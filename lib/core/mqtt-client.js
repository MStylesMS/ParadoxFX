/**
 * MQTT Client
 * 
 * Manages shared MQTT connection for all devices.
 */

const mqtt = require('mqtt');
const Logger = require('../utils/logger');

class MqttClient {
    constructor(globalConfig) {
        this.logger = new Logger('MqttClient');
        this.config = globalConfig;
        this.client = null;
        this.connected = false;
        this.subscriptions = new Map();
        this.messageHandlers = new Map();
        this.zoneManager = null; // Will be set by zone manager
    }

    async connect() {
        const url = `mqtt://${this.config.mqttServer}:${this.config.mqttPort}`;
        let attempt = 0;
        let maxDelay = 60000; // 1 minute max backoff
        let baseDelay = 2000; // 2 seconds initial
        const maxAttempts = 0; // 0 = unlimited

        const connectWithBackoff = async (resolve, reject) => {
            attempt++;
            let delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
            this.logger.info(`Connecting to MQTT broker at ${url} (attempt ${attempt}, delay ${delay}ms)`);

            this.client = mqtt.connect(url, {
                clientId: `pfx-${Date.now()}`,
                clean: true,
                reconnectPeriod: 0 // disable built-in reconnect, we handle it
            });

            let resolved = false;

            this.client.on('connect', () => {
                this.logger.info('Connected to MQTT broker');
                this.connected = true;
                this._startHeartbeat();
                resolved = true;
                attempt = 0;
                resolve();
            });

            this.client.on('error', (error) => {
                this.logger.error('MQTT connection error:', error);
                if (!this.connected && !resolved) {
                    this.client.end(true);
                    if (maxAttempts === 0 || attempt < maxAttempts) {
                        this.logger.warn(`Retrying MQTT connection in ${delay}ms (attempt ${attempt})`);
                        setTimeout(() => connectWithBackoff(resolve, reject), delay);
                    } else {
                        reject(error);
                    }
                }
            });

            this.client.on('close', () => {
                this.logger.warn('MQTT connection closed');
                this.connected = false;
                if (!resolved) return; // don't reconnect if not yet connected
                // Reconnect with backoff
                attempt = 0;
                const reconnect = () => {
                    attempt++;
                    let delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
                    this.logger.warn(`Reconnecting to MQTT broker in ${delay}ms (attempt ${attempt})`);
                    setTimeout(() => {
                        this.client = mqtt.connect(url, {
                            clientId: `pfx-${Date.now()}`,
                            clean: true,
                            reconnectPeriod: 0
                        });
                    }, delay);
                };
                reconnect();
            });

            this.client.on('disconnect', () => {
                this.logger.warn('Disconnected from MQTT broker');
                this.connected = false;
            });

            this.client.on('message', (topic, message) => {
                this._handleMessage(topic, message);
            });
        };

        return new Promise((resolve, reject) => {
            connectWithBackoff(resolve, reject);
        });
    }

    async disconnect() {
        if (this.client) {
            this.logger.info('Disconnecting from MQTT broker');
            return new Promise((resolve) => {
                this.client.end(false, {}, () => {
                    this.connected = false;
                    resolve();
                });
            });
        }
    }

    subscribe(topic, handler) {
        if (!this.connected) {
            throw new Error('MQTT client not connected');
        }

        this.logger.debug(`Subscribing to topic: ${topic}`);
        this.client.subscribe(topic, (error) => {
            if (error) {
                this.logger.error(`Failed to subscribe to ${topic}:`, error);
            } else {
                this.subscriptions.set(topic, true);
                this.messageHandlers.set(topic, handler);
                this.logger.debug(`Successfully subscribed to ${topic}`);
            }
        });
    }

    unsubscribe(topic) {
        if (!this.connected) {
            return;
        }

        this.logger.debug(`Unsubscribing from topic: ${topic}`);
        this.client.unsubscribe(topic);
        this.subscriptions.delete(topic);
        this.messageHandlers.delete(topic);
    }

    publish(topic, message, options = {}) {
        if (!this.connected) {
            this.logger.warn(`Cannot publish to ${topic}: MQTT client not connected`);
            return;
        }

        const payload = typeof message === 'string' ? message : JSON.stringify(message);
        this.logger.debug(`Publishing to ${topic}:`, payload);

        this.client.publish(topic, payload, {
            qos: options.qos || 0,
            retain: options.retain || false
        }, (error) => {
            if (error) {
                this.logger.error(`Failed to publish to ${topic}:`, error);
            }
        });
    }

    _handleMessage(topic, message) {
        let handler = null;
        let parsedMessage = null;
        let rawPayload = null;
        
        try {
            handler = this.messageHandlers.get(topic);
            if (!handler) {
                this.logger.warn(`No handler registered for topic: ${topic}`);
                return;
            }
            
            rawPayload = message.toString();
            this.logger.debug(`Received message on ${topic}:`, rawPayload);

            // Try to parse as JSON, fall back to string
            try {
                parsedMessage = JSON.parse(rawPayload);
            } catch (parseError) {
                // If JSON parsing fails, use the raw string
                parsedMessage = rawPayload;
                this.logger.debug(`Message on ${topic} is not valid JSON, treating as string`);
            }

            // Call handler with defensive error handling
            try {
                handler(topic, parsedMessage);
            } catch (handlerError) {
                this.logger.error(`Message handler error for topic ${topic}:`, handlerError);
                // Don't re-throw to prevent app crash
            }
            
        } catch (error) {
            this.logger.error(`Critical error handling message on ${topic}:`, error, {
                rawMessage: rawPayload,
                hasHandler: !!handler,
                topic: topic
            });
            // Don't re-throw to prevent app crash
        }
    }

    _startHeartbeat() {
        setInterval(() => {
            if (this.connected) {
                const heartbeat = {
                    timestamp: new Date().toISOString(),
                    application: 'pfx',
                    status: 'online',
                    uptime: process.uptime()
                };

                // Add zone status summary if zone manager is available
                if (this.zoneManager) {
                    heartbeat.zones = this._getZoneStatusSummary();
                }

                this.publish(this.config.heartbeatTopic, heartbeat);
            }
        }, this.config.heartbeatInterval);
    }

    /**
     * Set zone manager reference for enhanced heartbeat reporting
     */
    setZoneManager(zoneManager) {
        this.zoneManager = zoneManager;
    }

    /**
     * Get zone status summary for heartbeat
     */
    _getZoneStatusSummary() {
        if (!this.zoneManager || !this.zoneManager.zones) {
            return {};
        }

        const summary = {};
        for (const [zoneName, zone] of this.zoneManager.zones) {
            const state = zone.currentState || {};
            summary[zoneName] = {
                status: state.status || 'unknown',
                focus: state.focus || 'none',
                content: state.content || 'none',
                browser_enabled: state.browser?.enabled || false
            };
        }
        return summary;
    }
}

module.exports = MqttClient;
