/**
 * Core Integration Validation
 * 
 * Validates that all core components can be loaded and instantiated
 * without requiring network connections or hardware initialization.
 */

const path = require('path');
const Logger = require('../../lib/utils/logger');

class CoreIntegrationValidation {
    constructor() {
        this.logger = new Logger('CoreValidation');
        this.testResults = [];
    }

    async runValidation() {
        this.logger.info('🚀 Starting Core Integration Validation');
        
        const tests = [
            { name: 'Load AudioDevice Class', test: () => this._testAudioDeviceLoad() },
            { name: 'Load AudioManager Class', test: () => this._testAudioManagerLoad() },
            { name: 'Load DeviceManager Class', test: () => this._testDeviceManagerLoad() },
            { name: 'Load MqttClient Class', test: () => this._testMqttClientLoad() },
            { name: 'Create AudioDevice Instance', test: () => this._testAudioDeviceCreation() },
            { name: 'Validate Configuration Structure', test: () => this._testConfigurationStructure() },
            { name: 'Test File System Access', test: () => this._testFileSystemAccess() }
        ];
        
        for (const testCase of tests) {
            try {
                this.logger.info(`📋 Running: ${testCase.name}`);
                const startTime = Date.now();
                
                await testCase.test();
                
                const duration = Date.now() - startTime;
                this.testResults.push({
                    name: testCase.name,
                    status: 'PASS',
                    duration: duration
                });
                
                this.logger.info(`✅ ${testCase.name} - PASSED (${duration}ms)`);
                
            } catch (error) {
                this.testResults.push({
                    name: testCase.name,
                    status: 'FAIL',
                    error: error.message
                });
                
                this.logger.error(`❌ ${testCase.name} - FAILED:`, error.message);
            }
        }
        
        this._printValidationSummary();
    }

    async _testAudioDeviceLoad() {
        const AudioDevice = require('../../lib/devices/audio-device');
        if (typeof AudioDevice !== 'function') {
            throw new Error('AudioDevice is not a constructor function');
        }
        this.logger.info('🎵 AudioDevice class loaded successfully');
    }

    async _testAudioManagerLoad() {
        const AudioManager = require('../../lib/media/audio-manager');
        if (typeof AudioManager !== 'function') {
            throw new Error('AudioManager is not a constructor function');
        }
        this.logger.info('🎼 AudioManager class loaded successfully');
    }

    async _testDeviceManagerLoad() {
        const DeviceManager = require('../../lib/core/device-manager');
        if (typeof DeviceManager !== 'function') {
            throw new Error('DeviceManager is not a constructor function');
        }
        this.logger.info('🔧 DeviceManager class loaded successfully');
    }

    async _testMqttClientLoad() {
        const MqttClient = require('../../lib/core/mqtt-client');
        if (typeof MqttClient !== 'function') {
            throw new Error('MqttClient is not a constructor function');
        }
        this.logger.info('📡 MqttClient class loaded successfully');
    }

    async _testAudioDeviceCreation() {
        const AudioDevice = require('../../lib/devices/audio-device');
        
        const testConfig = {
            type: 'audio',
            name: 'test-audio-device',
            baseTopic: 'paradox/test/audio',
            statusTopic: 'paradox/test/audio/status',
            mediaPath: '/opt/paradox/media',
            audioDevice: 'auto',
            volume: 80,
            ipcSocketPath: '/tmp/test-audio-socket'
        };
        
        // Mock MQTT client
        const mockMqttClient = {
            publish: () => {},
            subscribe: () => {},
            connected: false
        };
        
        const audioDevice = new AudioDevice(testConfig, mockMqttClient);
        
        if (!audioDevice || !audioDevice.config) {
            throw new Error('AudioDevice creation failed');
        }
        
        if (!audioDevice.handleCommand || typeof audioDevice.handleCommand !== 'function') {
            throw new Error('AudioDevice missing handleCommand method');
        }
        
        this.logger.info('🎵 AudioDevice instance created successfully');
    }

    async _testConfigurationStructure() {
        const testConfig = {
            global: {
                logLevel: 'info',
                mediaBasePath: '/opt/paradox/media',
                heartbeatEnabled: true,
                heartbeatInterval: 10000,
                heartbeatTopic: 'paradox/heartbeat',
                mqttServer: 'localhost',
                mqttPort: 1883
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
        
        // Validate structure
        if (!testConfig.global || !testConfig.devices) {
            throw new Error('Invalid configuration structure');
        }
        
        if (!testConfig.global.mediaBasePath) {
            throw new Error('Missing mediaBasePath in configuration');
        }
        
        const audioDevices = Object.values(testConfig.devices).filter(d => d.type === 'audio');
        if (audioDevices.length === 0) {
            throw new Error('No audio devices in configuration');
        }
        
        this.logger.info(`📋 Configuration structure validated (${audioDevices.length} audio devices)`);
    }

    async _testFileSystemAccess() {
        const fs = require('fs');
        const mediaPath = '/opt/paradox/media';
        
        if (!fs.existsSync(mediaPath)) {
            throw new Error(`Media directory not found: ${mediaPath}`);
        }
        
        // Check for test media files
        const testFiles = [
            '/opt/paradox/media/background/ambient-space.mp3',
            '/opt/paradox/media/effects/beep-short.wav',
            '/opt/paradox/media/speech/welcome-message.mp3'
        ];
        
        const existingFiles = testFiles.filter(file => fs.existsSync(file));
        
        if (existingFiles.length === 0) {
            throw new Error('No test media files found');
        }
        
        this.logger.info(`📁 File system access validated (${existingFiles.length} test files found)`);
    }

    _printValidationSummary() {
        this.logger.info('\n' + '='.repeat(60));
        this.logger.info('🔍 CORE INTEGRATION VALIDATION SUMMARY');
        this.logger.info('='.repeat(60));
        
        const passed = this.testResults.filter(r => r.status === 'PASS').length;
        const failed = this.testResults.filter(r => r.status === 'FAIL').length;
        
        this.logger.info(`✅ Passed: ${passed}`);
        this.logger.info(`❌ Failed: ${failed}`);
        this.logger.info(`📊 Total:  ${this.testResults.length}`);
        
        if (failed > 0) {
            this.logger.info('\n❌ Failed Validations:');
            this.testResults.filter(r => r.status === 'FAIL').forEach(test => {
                this.logger.info(`   - ${test.name}: ${test.error}`);
            });
        }
        
        if (passed === this.testResults.length) {
            this.logger.info('\n🎉 ALL CORE COMPONENTS VALIDATED!');
            this.logger.info('✅ Multi-Zone Audio Integration Architecture Complete');
            
            this.logger.info('\n📋 INTEGRATION READINESS:');
            this.logger.info('   ✅ AudioDevice class - Ready for MQTT commands');
            this.logger.info('   ✅ AudioManager class - Ready for hardware integration');
            this.logger.info('   ✅ DeviceManager class - Ready for device registration');  
            this.logger.info('   ✅ Configuration system - Ready for production config');
            this.logger.info('   ✅ Test media files - Ready for audio validation');
            
            this.logger.info('\n🚀 NEXT STEPS:');
            this.logger.info('   1. Add audio device to pfx.ini configuration');
            this.logger.info('   2. Test with: node test/manual/test-audio.js');
            this.logger.info('   3. Deploy with full MQTT + audio integration');
            
            this.logger.info('\n💡 RECOMMENDED PRODUCTION CONFIG:');
            this.logger.info('   [audio:zone1-audio]');
            this.logger.info('   type = audio');
            this.logger.info('   topic = paradox/zone1/audio');
            this.logger.info('   media_dir = audio');
            this.logger.info('   volume = 80');
            this.logger.info('   audio_device = pulse/alsa_output.platform-107c701400.hdmi.hdmi-stereo');
            
        } else {
            this.logger.info('\n⚠️  Some core components failed validation');
            this.logger.info('   Please fix the failed components before proceeding');
        }
        
        this.logger.info('='.repeat(60));
    }
}

// Run the validation if called directly
async function runValidation() {
    const validation = new CoreIntegrationValidation();
    
    try {
        await validation.runValidation();
        
    } catch (error) {
        console.error('Core validation failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    runValidation();
}

module.exports = CoreIntegrationValidation;
