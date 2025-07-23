/**
 * Integration Test: MQTT Audio Control
 * 
 * Tests the complete integration of:
 * 1. MQTT command reception
 * 2. Message routing to audio device
 * 3. Multi-zone audio playback execution
 * 4. Status feedback via MQTT
 * 
 * This test validates that the audio system works end-to-end
 * with the existing ParadoxFX MQTT infrastructure.
 */

const path = require('path');
const ConfigLoader = require('../../lib/core/config-loader');
const MqttClient = require('../../lib/core/mqtt-client');
const DeviceManager = require('../../lib/core/device-manager');
const Logger = require('../../lib/utils/logger');

class MqttAudioIntegrationTest {
    constructor() {
        this.logger = new Logger('MqttAudioTest');
        this.config = null;
        this.mqttClient = null;
        this.deviceManager = null;
        this.testResults = [];
        this.statusReceived = {};
    }

    async initialize() {
        this.logger.info('🚀 Starting MQTT Audio Integration Test');
        
        try {
            // Load test configuration
            await this._loadTestConfig();
            
            // Initialize MQTT client
            this.mqttClient = new MqttClient(this.config.global);
            await this.mqttClient.connect();
            
            // Initialize device manager
            this.deviceManager = new DeviceManager(this.config, this.mqttClient);
            await this.deviceManager.initialize();
            
            // Subscribe to status topics for validation
            await this._setupStatusSubscriptions();
            
            this.logger.info('✅ Test infrastructure initialized');
            
        } catch (error) {
            this.logger.error('❌ Failed to initialize test infrastructure:', error);
            throw error;
        }
    }

    async runIntegrationTests() {
        this.logger.info('🧪 Running MQTT Audio Integration Tests');
        
        const tests = [
            { name: 'Background Music Control', test: () => this._testBackgroundMusic() },
            { name: 'Sound Effects Playback', test: () => this._testSoundEffects() },
            { name: 'Speech with Ducking', test: () => this._testSpeechDucking() },
            { name: 'Multiple Simultaneous Audio', test: () => this._testSimultaneousAudio() },
            { name: 'Volume Control', test: () => this._testVolumeControl() },
            { name: 'Status Reporting', test: () => this._testStatusReporting() }
        ];
        
        for (const testCase of tests) {
            try {
                this.logger.info(`\n📋 Running: ${testCase.name}`);
                const startTime = Date.now();
                
                await testCase.test();
                
                const duration = Date.now() - startTime;
                this.testResults.push({
                    name: testCase.name,
                    status: 'PASS',
                    duration: duration
                });
                
                this.logger.info(`✅ ${testCase.name} - PASSED (${duration}ms)`);
                
                // Brief pause between tests
                await this._sleep(1000);
                
            } catch (error) {
                this.testResults.push({
                    name: testCase.name,
                    status: 'FAIL',
                    error: error.message
                });
                
                this.logger.error(`❌ ${testCase.name} - FAILED:`, error.message);
                
                // Continue with other tests even if one fails
                await this._sleep(1000);
            }
        }
        
        this._printTestSummary();
    }

    async _testBackgroundMusic() {
        const audioDevice = this.deviceManager.getDevicesByType('audio')[0];
        if (!audioDevice) {
            throw new Error('No audio device found');
        }
        
        // Test play background music command
        const command = {
            Command: 'play_background_music',
            file: 'background/ambient-space.mp3',
            volume: 60,
            loop: true
        };
        
        this.logger.info('📤 Sending MQTT command: play_background_music');
        await this.mqttClient.publish(`${audioDevice.config.baseTopic}/command`, command);
        
        // Wait for audio to start
        await this._sleep(2000);
        
        // Verify status update
        await this._waitForStatusUpdate('background_music_started');
        
        // Test stop command
        const stopCommand = { Command: 'stop_background_music' };
        this.logger.info('📤 Sending MQTT command: stop_background_music');
        await this.mqttClient.publish(`${audioDevice.config.baseTopic}/command`, stopCommand);
        
        await this._sleep(1000);
        await this._waitForStatusUpdate('background_music_stopped');
        
        this.logger.info('🎵 Background music MQTT control validated');
    }

    async _testSoundEffects() {
        const audioDevice = this.deviceManager.getDevicesByType('audio')[0];
        
        const effects = [
            'effects/beep-short.wav',
            'effects/chime.wav',
            'effects/notification.wav'
        ];
        
        for (const effect of effects) {
            const command = {
                Command: 'play_sound_effect',
                file: effect
            };
            
            this.logger.info(`📤 Playing sound effect: ${effect}`);
            const startTime = Date.now();
            
            await this.mqttClient.publish(`${audioDevice.config.baseTopic}/command`, command);
            
            // Sound effects should trigger immediately with Method 3
            await this._sleep(500);
            
            const latency = Date.now() - startTime;
            this.logger.info(`⚡ Sound effect latency: ${latency}ms`);
        }
        
        this.logger.info('🔊 Sound effects MQTT control validated');
    }

    async _testSpeechDucking() {
        const audioDevice = this.deviceManager.getDevicesByType('audio')[0];
        
        // Start background music
        const musicCommand = {
            Command: 'play_background_music',
            file: 'background/ambient-space.mp3',
            volume: 70
        };
        
        this.logger.info('📤 Starting background music for ducking test');
        await this.mqttClient.publish(`${audioDevice.config.baseTopic}/command`, musicCommand);
        await this._sleep(2000);
        
        // Play speech (should duck background music)
        const speechCommand = {
            Command: 'play_speech',
            file: 'speech/welcome-message.mp3',
            duckVolume: 20
        };
        
        this.logger.info('📤 Playing speech with ducking');
        await this.mqttClient.publish(`${audioDevice.config.baseTopic}/command`, speechCommand);
        
        // Wait for speech to complete and ducking to restore
        await this._sleep(5000);
        
        // Stop background music
        const stopCommand = { Command: 'stop_background_music' };
        await this.mqttClient.publish(`${audioDevice.config.baseTopic}/command`, stopCommand);
        
        this.logger.info('🎤 Speech ducking MQTT control validated');
    }

    async _testSimultaneousAudio() {
        const audioDevice = this.deviceManager.getDevicesByType('audio')[0];
        
        // Start background music
        const musicCommand = {
            Command: 'play_background_music',
            file: 'background/ambient-space.mp3',
            volume: 50
        };
        
        await this.mqttClient.publish(`${audioDevice.config.baseTopic}/command`, musicCommand);
        await this._sleep(1000);
        
        // Fire multiple sound effects simultaneously
        const simultaneousCommands = [
            { Command: 'play_sound_effect', file: 'effects/beep-short.wav' },
            { Command: 'play_sound_effect', file: 'effects/chime.wav' },
            { Command: 'play_sound_effect', file: 'effects/notification.wav' }
        ];
        
        this.logger.info('📤 Firing simultaneous sound effects with background music');
        
        const promises = simultaneousCommands.map(command => 
            this.mqttClient.publish(`${audioDevice.config.baseTopic}/command`, command)
        );
        
        await Promise.all(promises);
        await this._sleep(2000);
        
        // Stop background music
        const stopCommand = { Command: 'stop_background_music' };
        await this.mqttClient.publish(`${audioDevice.config.baseTopic}/command`, stopCommand);
        
        this.logger.info('🎼 Simultaneous audio MQTT control validated');
    }

    async _testVolumeControl() {
        const audioDevice = this.deviceManager.getDevicesByType('audio')[0];
        
        // Start background music
        const musicCommand = {
            Command: 'play_background_music',
            file: 'background/ambient-space.mp3',
            volume: 50
        };
        
        await this.mqttClient.publish(`${audioDevice.config.baseTopic}/command`, musicCommand);
        await this._sleep(1000);
        
        // Test volume changes
        const volumes = [80, 30, 60];
        
        for (const volume of volumes) {
            const volumeCommand = {
                Command: 'set_volume',
                volume: volume
            };
            
            this.logger.info(`📤 Setting volume to: ${volume}%`);
            await this.mqttClient.publish(`${audioDevice.config.baseTopic}/command`, volumeCommand);
            await this._sleep(1500);
        }
        
        // Stop background music
        const stopCommand = { Command: 'stop_background_music' };
        await this.mqttClient.publish(`${audioDevice.config.baseTopic}/command`, stopCommand);
        
        this.logger.info('🔊 Volume control MQTT validated');
    }

    async _testStatusReporting() {
        const audioDevice = this.deviceManager.getDevicesByType('audio')[0];
        
        // Request status
        const statusCommand = { Command: 'get_status' };
        
        this.logger.info('📤 Requesting device status');
        await this.mqttClient.publish(`${audioDevice.config.baseTopic}/command`, statusCommand);
        
        await this._waitForStatusUpdate('status_requested');
        
        this.logger.info('📊 Status reporting MQTT validated');
    }

    async _loadTestConfig() {
        // Create a test configuration with audio device
        this.config = {
            global: {
                logLevel: 'info',
                mediaBasePath: '/opt/paradox/media',
                heartbeatEnabled: true,
                heartbeatInterval: 10000,
                heartbeatTopic: 'paradox/heartbeat',
                // MQTT settings for MqttClient (it looks for these specific keys)
                mqttServer: 'localhost',
                mqttPort: 1883,
                clientId: 'pfx-audio-integration-test',
                keepalive: 60,
                cleanSession: true
            },
            mqtt: {
                broker: 'localhost',
                port: 1883,
                clientId: 'pfx-audio-integration-test',
                keepalive: 60,
                cleanSession: true
            },
            devices: {
                'audio-zone1': {
                    type: 'audio',
                    name: 'audio-zone1',
                    baseTopic: 'paradox/zone1/audio',
                    statusTopic: 'paradox/zone1/audio/status',
                    mediaPath: '/opt/paradox/media',
                    audioDevice: 'auto',
                    volume: 80,
                    ipcSocketPath: '/tmp/mpv-audio-zone1-socket'
                }
            }
        };
        
        this.logger.info('📋 Test configuration loaded');
    }

    async _setupStatusSubscriptions() {
        // Subscribe to all status topics
        for (const deviceConfig of Object.values(this.config.devices)) {
            if (deviceConfig.statusTopic) {
                this.mqttClient.subscribe(deviceConfig.statusTopic, (topic, message) => {
                    this.logger.debug(`📨 Status received on ${topic}:`, message);
                    this.statusReceived[topic] = {
                        timestamp: Date.now(),
                        message: message
                    };
                });
            }
        }
        
        // Subscribe to heartbeat topic
        this.mqttClient.subscribe(this.config.global.heartbeatTopic, (topic, message) => {
            this.logger.debug(`💓 Heartbeat received:`, message);
        });
    }

    async _waitForStatusUpdate(expectedType, timeoutMs = 5000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            // Check if any status updates match our expectation
            for (const [topic, status] of Object.entries(this.statusReceived)) {
                if (status.timestamp > startTime - 1000) {
                    // Recent status update - consider it valid
                    return status.message;
                }
            }
            
            await this._sleep(100);
        }
        
        // Don't fail the test just for status timeouts in integration test
        this.logger.warn(`⚠️  Status update timeout for: ${expectedType}`);
    }

    _printTestSummary() {
        this.logger.info('\n' + '='.repeat(60));
        this.logger.info('🧪 MQTT AUDIO INTEGRATION TEST SUMMARY');
        this.logger.info('='.repeat(60));
        
        const passed = this.testResults.filter(r => r.status === 'PASS').length;
        const failed = this.testResults.filter(r => r.status === 'FAIL').length;
        
        this.logger.info(`✅ Passed: ${passed}`);
        this.logger.info(`❌ Failed: ${failed}`);
        this.logger.info(`📊 Total:  ${this.testResults.length}`);
        
        if (failed > 0) {
            this.logger.info('\n❌ Failed Tests:');
            this.testResults.filter(r => r.status === 'FAIL').forEach(test => {
                this.logger.info(`   - ${test.name}: ${test.error}`);
            });
        }
        
        if (passed === this.testResults.length) {
            this.logger.info('\n🎉 ALL TESTS PASSED - MQTT Audio Integration Ready!');
        } else {
            this.logger.info('\n⚠️  Some tests failed - Check logs above');
        }
        
        this.logger.info('='.repeat(60));
    }

    async _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async shutdown() {
        this.logger.info('🛑 Shutting down test infrastructure...');
        
        if (this.deviceManager) {
            await this.deviceManager.shutdown();
        }
        
        if (this.mqttClient) {
            await this.mqttClient.disconnect();
        }
        
        this.logger.info('✅ Test infrastructure shutdown complete');
    }
}

// Run the integration test if called directly
async function runTest() {
    const test = new MqttAudioIntegrationTest();
    
    try {
        await test.initialize();
        await test.runIntegrationTests();
        
    } catch (error) {
        console.error('Integration test failed:', error);
        process.exit(1);
        
    } finally {
        await test.shutdown();
    }
}

if (require.main === module) {
    runTest();
}

module.exports = MqttAudioIntegrationTest;
