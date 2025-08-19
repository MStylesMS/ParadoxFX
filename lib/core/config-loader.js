/**
 * Configuration Loader
 * 
 * Loads and parses the pfx.ini configuration file.
 */

const fs = require('fs').promises;
const ini = require('ini');
const Logger = require('../utils/logger');

class ConfigLoader {
    constructor() {
        this.logger = new Logger('ConfigLoader');
    }

    /**
     * Load configuration from INI file
     * @param {string} filePath - Path to the INI file
     * @returns {Object} Parsed configuration object
     */
    static async load(filePath) {
        const loader = new ConfigLoader();
        return await loader._load(filePath);
    }

    async _load(filePath) {
        try {
            this.logger.info(`Loading configuration from ${filePath}`);

            const fileContent = await fs.readFile(filePath, 'utf8');
            const rawConfig = ini.parse(fileContent);

            // Separate global config and mqtt config from device configs
            const { global, mqtt, ...devices } = rawConfig;

            if (!global) {
                throw new Error('No [global] section found in configuration file');
            }

            // Handle both old and new config formats
            const mqttConfig = mqtt || {};
            
            // Validate configuration
            this._validateConfig(global, mqttConfig);

            // Process device configurations
            const processedDevices = {};
            for (const [deviceName, deviceConfig] of Object.entries(devices)) {
                processedDevices[deviceName] = this._processDeviceConfig(deviceName, deviceConfig);
            }

            const config = {
                global: this._processGlobalConfig(global, mqttConfig),
                devices: processedDevices
            };

            this.logger.info(`Configuration loaded successfully: ${Object.keys(devices).length} devices`);
            return config;

        } catch (error) {
            this.logger.error('Failed to load configuration:', error);
            throw error;
        }
    }

    _validateConfig(global, mqtt) {
        // Check for required fields in either old or new format
        const hasOldFormat = global.MQTT_SERVER && global.HEARTBEAT_TOPIC;
        const hasNewFormat = mqtt.broker && global.heartbeat_topic;
        
        if (!hasOldFormat && !hasNewFormat) {
            if (!mqtt.broker && !global.MQTT_SERVER) {
                throw new Error('MQTT broker configuration missing: need [mqtt] broker or [global] MQTT_SERVER');
            }
            if (!global.heartbeat_topic && !global.HEARTBEAT_TOPIC) {
                throw new Error('Heartbeat topic missing: need [global] heartbeat_topic or HEARTBEAT_TOPIC');
            }
        }
    }

    _processGlobalConfig(global, mqtt = {}) {
        // Support both old and new config formats
        return {
            mqttServer: mqtt.broker || global.MQTT_SERVER || 'localhost',
            mqttPort: parseInt(mqtt.port) || parseInt(global.MQTT_PORT) || 1883,
            mqttUsername: mqtt.username || global.MQTT_USERNAME || null,
            mqttPassword: mqtt.password || global.MQTT_PASSWORD || null,
            mqttClientId: mqtt.client_id || global.MQTT_CLIENT_ID || 'pfx-client',
            mqttKeepAlive: parseInt(mqtt.keepalive) || parseInt(global.MQTT_KEEPALIVE) || 60,
            mqttCleanSession: mqtt.clean_session !== undefined ? mqtt.clean_session : (global.MQTT_CLEAN_SESSION !== undefined ? global.MQTT_CLEAN_SESSION : true),
            baseTopic: mqtt.base_topic || global.BASE_TOPIC || 'paradox',
            deviceName: global.device_name || global.DEVICE_NAME || 'pfx-device',
            heartbeatTopic: global.heartbeat_topic || global.HEARTBEAT_TOPIC || 'paradox/heartbeat',
            heartbeatInterval: parseInt(global.heartbeat_interval) || parseInt(global.HEARTBEAT_INTERVAL_MS) || 10000,
            heartbeatEnabled: global.heartbeat_enabled !== undefined ? global.heartbeat_enabled : (global.HEARTBEAT_ENABLED !== undefined ? global.HEARTBEAT_ENABLED : true),
            logLevel: global.log_level || global.LOG_LEVEL || 'info',
            mediaBasePath: global.media_base_path || global.MEDIA_BASE_PATH || '/opt/paradox/media',
            duckingVolume: parseInt(global.ducking_volume) || 30,
            // Global ducking defaults (optional)
            speechDucking: global.speech_ducking !== undefined ? parseInt(global.speech_ducking) : undefined,
            videoDucking: global.video_ducking !== undefined ? parseInt(global.video_ducking) : undefined
        };
    }

    _processDeviceConfig(deviceName, config) {
        // Support both old and new config formats
        const deviceType = config.type || config.DEVICE_TYPE;
        if (!deviceType) {
            throw new Error(`Device ${deviceName} missing type or DEVICE_TYPE`);
        }

        const processed = {
            name: deviceName,
            type: deviceType,
            baseTopic: config.topic || config.BASE_TOPIC,
            statusTopic: config.status_topic || config.STATUS_TOPIC
        };

        // Add type-specific configuration
        switch (deviceType) {
            case 'screen':
                processed.display = config.display || config.DISPLAY || ':0';
                
                // Use target_monitor for screen targeting
                processed.targetMonitor = parseInt(config.target_monitor || config.TARGET_MONITOR) || 0;
                
                processed.mediaDir = config.media_dir || config.MEDIA_DIR || '';
                processed.mediaBasePath = config.media_base_path || config.MEDIA_BASE_PATH || '/opt/paradox/media';
                processed.audioDevice = config.audio_device || config.AUDIO_DEVICE || 'default';
                processed.playerType = config.player_type || config.PLAYER_TYPE || 'mpv';
                processed.volume = parseInt(config.volume || config.VOLUME) || 70;
                processed.defaultImage = config.default_image || config.DEFAULT_IMAGE || 'default.png';
                processed.videoQueueMax = parseInt(config.video_queue_max || config.VIDEO_QUEUE_MAX) || 5;
                processed.audioQueueMax = parseInt(config.audio_queue_max || config.AUDIO_QUEUE_MAX) || 5;
                processed.mpvVideoOptions = config.mpv_video_options || config.MPV_VIDEO_OPTIONS;
                processed.mpvVideoProfile = config.mpv_video_profile || config.MPV_VIDEO_PROFILE;
                processed.transitionDelay = parseInt(config.TRANSITION_DELAY_MS) || 100;
                
                // Combined sink configuration for screen devices
                if (config.combined_sinks) {
                    try {
                        processed.combinedSinks = typeof config.combined_sinks === 'string' 
                            ? JSON.parse(config.combined_sinks) 
                            : config.combined_sinks;
                        processed.combinedSinkName = config.combined_sink_name || 'combined_output';
                        processed.combinedSinkDescription = config.combined_sink_description || 'Combined Audio Output';
                    } catch (error) {
                        this.logger.warn(`Invalid combined_sinks JSON for ${deviceName}: ${error.message}`);
                    }
                }
                
                // Per-zone ducking configuration. If not set per-zone, inherit global defaults (if present).
                if (config.speech_ducking !== undefined) {
                    processed.speechDucking = parseInt(config.speech_ducking);
                } else if (global && global.speechDucking !== undefined) {
                    processed.speechDucking = global.speechDucking;
                } else {
                    processed.speechDucking = undefined;
                }

                if (config.video_ducking !== undefined) {
                    processed.videoDucking = parseInt(config.video_ducking);
                } else if (global && global.videoDucking !== undefined) {
                    processed.videoDucking = global.videoDucking;
                } else {
                    processed.videoDucking = undefined;
                }
                break;

            case 'light':
            case 'light_group':
                processed.controller = config.CONTROLLER;
                processed.deviceId = config.DEVICE_ID;
                processed.deviceList = config.DEVICE_LIST ? config.DEVICE_LIST.split(',').map(s => s.trim()) : null;
                break;

            case 'relay':
                processed.controller = config.CONTROLLER;
                processed.deviceId = config.DEVICE_ID;
                break;

            case 'audio':
                processed.mediaDir = config.media_dir || config.MEDIA_DIR || '';
                processed.mediaBasePath = config.media_base_path || config.MEDIA_BASE_PATH || '/opt/paradox/media';
                processed.audioDevice = config.audio_device || config.AUDIO_DEVICE || 'auto';
                processed.volume = parseInt(config.volume || config.VOLUME) || 80;
                processed.dualOutputMode = config.dual_output_mode === true || config.dual_output_mode === 'true';
                processed.primaryDevice = config.primary_device || config.PRIMARY_DEVICE || null;
                processed.secondaryDevice = config.secondary_device || config.SECONDARY_DEVICE || null;
                
                // Combined sink configuration
                if (config.combined_sinks) {
                    try {
                        processed.combinedSinks = typeof config.combined_sinks === 'string' 
                            ? JSON.parse(config.combined_sinks) 
                            : config.combined_sinks;
                        processed.combinedSinkName = config.combined_sink_name || 'combined_output';
                        processed.combinedSinkDescription = config.combined_sink_description || 'Combined Audio Output';
                    } catch (error) {
                        this.logger.warn(`Invalid combined_sinks JSON for ${deviceName}: ${error.message}`);
                    }
                }
                
                // Per-zone ducking configuration
                processed.speechDucking = config.speech_ducking !== undefined ? parseInt(config.speech_ducking) : undefined;
                processed.videoDucking = config.video_ducking !== undefined ? parseInt(config.video_ducking) : undefined;
                break;

            default:
                this.logger.warn(`Unknown device type: ${config.DEVICE_TYPE} for device ${deviceName}`);
        }

        return processed;
    }
}

module.exports = ConfigLoader;
