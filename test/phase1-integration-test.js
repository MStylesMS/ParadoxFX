/**
 * Phase 1 Refactoring Integration Test
 * 
 * Tests the new MPV Zone Manager architecture via MQTT commands
 */

const mqtt = require('mqtt');
const MqttClient = require('../../lib/core/mqtt-client');
const ScreenDevice = require('../../lib/devices/screen-device');
const Logger = require('../../lib/utils/logger');

// Test configuration
const testConfig = {
    // MQTT settings
    mqttServer: 'localhost',
    mqttPort: 1883,

    // Device settings
    name: 'test-screen',
    type: 'screen',
    display: ':0',
    xineramaScreen: 0,
    audioDevice: 'hw:0,0', // Adjust for your system
    mediaDir: '/opt/paradox/apps/pfx/test/fixtures/test-media',

    // Topics
    baseTopic: 'test/phase1/screen',
    statusTopic: 'test/phase1/screen/status',
    commandTopic: 'test/phase1/screen/commands',

    // Queue settings
    videoQueueMax: 3,
    defaultVolume: 70
};

class Phase1IntegrationTest {
    constructor() {
        this.logger = new Logger('Phase1Test');
        this.mqttClient = null;
        this.screenDevice = null;
        this.testResults = [];
        this.isRunning = false;
    }

    async initialize() {
        this.logger.info('Initializing Phase 1 Integration Test...');

        try {
            // Initialize MQTT client
            this.mqttClient = new MqttClient({
                mqttServer: testConfig.mqttServer,
                mqttPort: testConfig.mqttPort,
                heartbeatTopic: 'test/phase1/heartbeat',
                heartbeatInterval: 10000
            });

            await this.mqttClient.connect();
            this.logger.info('MQTT client connected');

            // Set up status monitoring
            await this.mqttClient.subscribe(testConfig.statusTopic);
            this.mqttClient.on('message', (topic, message) => {
                if (topic === testConfig.statusTopic) {
                    this.handleStatusMessage(JSON.parse(message.toString()));
                }
            });

            // Initialize screen device with new architecture
            this.screenDevice = new ScreenDevice(testConfig, this.mqttClient);
            await this.screenDevice.initialize();

            this.logger.info('Screen device initialized with MPV Zone Manager');
            this.isRunning = true;

        } catch (error) {
            this.logger.error('Initialization failed:', error);
            throw error;
        }
    }

    handleStatusMessage(status) {
        this.logger.debug('Status received:', status);
        this.testResults.push({
            timestamp: new Date(),
            type: 'status',
            data: status
        });
    }

    async sendCommand(command) {
        this.logger.info(`Sending command: ${command.Command}`);

        try {
            await this.screenDevice.handleCommand(command);

            this.testResults.push({
                timestamp: new Date(),
                type: 'command_sent',
                data: command
            });

            // Wait a moment for the command to process
            await this.sleep(1000);

        } catch (error) {
            this.logger.error(`Command failed: ${command.Command}`, error);
            this.testResults.push({
                timestamp: new Date(),
                type: 'command_error',
                data: { command, error: error.message }
            });
        }
    }

    async runAudioTests() {
        this.logger.info('Running audio tests with new MPV Zone Manager...');

        const testMedia = {
            audio: `${testConfig.mediaDir}/default.mp3`,
            audioShort: `${testConfig.mediaDir}/default_fx.wav`,
            audioBackground: `${testConfig.mediaDir}/houdini_music.mp3`
        };

        // Test 1: Basic audio playback
        this.logger.info('Test 1: Basic audio playback');
        await this.sendCommand({
            Command: 'playAudio',
            Audio: testMedia.audio,
            Channel: 'main'
        });

        await this.sleep(3000); // Let it play for 3 seconds

        // Test 2: Volume control
        this.logger.info('Test 2: Volume control');
        await this.sendCommand({
            Command: 'setVolume',
            Volume: 50
        });

        await this.sleep(2000);

        // Test 3: Background music
        this.logger.info('Test 3: Background music');
        await this.sendCommand({
            Command: 'playBackgroundMusic',
            Audio: testMedia.audioBackground,
            Volume: 30
        });

        await this.sleep(3000);

        // Test 4: Speech (should pause background music)
        this.logger.info('Test 4: Speech playback');
        await this.sendCommand({
            Command: 'playSpeech',
            Audio: testMedia.audioShort,
            Volume: 80
        });

        await this.sleep(2000);

        // Test 5: Sound effect
        this.logger.info('Test 5: Sound effect');
        await this.sendCommand({
            Command: 'playSoundEffect',
            Audio: testMedia.audioShort,
            Volume: 70
        });

        await this.sleep(2000);

        // Test 6: Stop all
        this.logger.info('Test 6: Stop all playback');
        await this.sendCommand({
            Command: 'stopAll'
        });

        await this.sleep(1000);
    }

    async runImageVideoTests() {
        this.logger.info('Running image/video tests...');

        const testMedia = {
            image: `${testConfig.mediaDir}/default_hq.jpg`,
            video: `${testConfig.mediaDir}/intro_short.mp4`
        };

        // Test 7: Image display
        this.logger.info('Test 7: Image display');
        await this.sendCommand({
            Command: 'setImage',
            Image: testMedia.image
        });

        await this.sleep(2000);

        // Test 8: Video playback
        this.logger.info('Test 8: Video playback');
        await this.sendCommand({
            Command: 'playVideo',
            Video: testMedia.video,
            Channel: 'main'
        });

        await this.sleep(3000);

        // Test 9: Transition (video to image)
        this.logger.info('Test 9: Video to image transition');
        await this.sendCommand({
            Command: 'transition',
            Video: testMedia.video,
            Image: testMedia.image,
            Channel: 'main'
        });

        await this.sleep(5000); // Let transition complete
    }

    async runFullTest() {
        try {
            await this.initialize();

            this.logger.info('=== Starting Phase 1 Integration Tests ===');

            // Run audio tests
            await this.runAudioTests();

            // Run image/video tests (if media files exist)
            await this.runImageVideoTests();

            // Final status check
            await this.sendCommand({
                Command: 'getStatus'
            });

            this.logger.info('=== Tests Complete ===');

            // Print results summary
            this.printResults();

        } catch (error) {
            this.logger.error('Test suite failed:', error);
        } finally {
            await this.cleanup();
        }
    }

    printResults() {
        this.logger.info('\n=== TEST RESULTS ===');

        const statusUpdates = this.testResults.filter(r => r.type === 'status');
        const commandsSent = this.testResults.filter(r => r.type === 'command_sent');
        const commandErrors = this.testResults.filter(r => r.type === 'command_error');

        this.logger.info(`Commands sent: ${commandsSent.length}`);
        this.logger.info(`Command errors: ${commandErrors.length}`);
        this.logger.info(`Status updates received: ${statusUpdates.length}`);

        if (commandErrors.length > 0) {
            this.logger.error('Command errors:');
            commandErrors.forEach((error, index) => {
                this.logger.error(`  ${index + 1}. ${error.data.command.Command}: ${error.data.error}`);
            });
        }

        // Check final status
        const lastStatus = statusUpdates[statusUpdates.length - 1];
        if (lastStatus) {
            this.logger.info('Final device status:', lastStatus.data);
        }

        this.logger.info('=== END RESULTS ===\n');
    }

    async cleanup() {
        this.logger.info('Cleaning up test environment...');

        if (this.screenDevice) {
            await this.screenDevice.shutdown();
        }

        if (this.mqttClient) {
            await this.mqttClient.disconnect();
        }

        this.isRunning = false;
        this.logger.info('Cleanup complete');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Command line execution
if (require.main === module) {
    const test = new Phase1IntegrationTest();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT, shutting down gracefully...');
        await test.cleanup();
        process.exit(0);
    });

    // Run the test
    test.runFullTest().catch(error => {
        console.error('Test failed:', error);
        process.exit(1);
    });
}

module.exports = Phase1IntegrationTest;
