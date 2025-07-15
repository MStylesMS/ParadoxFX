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
    }

    async connect() {
        return new Promise((resolve, reject) => {
            const url = `mqtt://${this.config.mqttServer}:${this.config.mqttPort}`;
            this.logger.info(`Connecting to MQTT broker at ${url}`);

            this.client = mqtt.connect(url, {
                clientId: `pfx-${Date.now()}`,
                clean: true,
                reconnectPeriod: 5000
            });

            this.client.on('connect', () => {
                this.logger.info('Connected to MQTT broker');
                this.connected = true;
                this._startHeartbeat();
                resolve();
            });

            this.client.on('error', (error) => {
                this.logger.error('MQTT connection error:', error);
                if (!this.connected) {
                    reject(error);
                }
            });

            this.client.on('disconnect', () => {
                this.logger.warn('Disconnected from MQTT broker');
                this.connected = false;
            });

            this.client.on('message', (topic, message) => {
                this._handleMessage(topic, message);
            });

            // Set connection timeout
            setTimeout(() => {
                if (!this.connected) {
                    reject(new Error('MQTT connection timeout'));
                }
            }, 10000);
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
        try {
            const handler = this.messageHandlers.get(topic);
            if (handler) {
                const payload = message.toString();
                this.logger.debug(`Received message on ${topic}:`, payload);

                // Try to parse as JSON, fall back to string
                let parsedMessage;
                try {
                    parsedMessage = JSON.parse(payload);
                } catch {
                    parsedMessage = payload;
                }

                handler(topic, parsedMessage);
            } else {
                this.logger.warn(`No handler registered for topic: ${topic}`);
            }
        } catch (error) {
            this.logger.error(`Error handling message on ${topic}:`, error);
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

                this.publish(this.config.heartbeatTopic, heartbeat);
            }
        }, this.config.heartbeatInterval);
    }
}

module.exports = MqttClient;
