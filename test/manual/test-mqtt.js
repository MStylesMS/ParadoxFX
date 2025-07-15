/**
 * Manual MQTT Test Script
 * 
 * Tests MQTT connectivity and demonstrates all device commands.
 * This script helps validate MQTT communication and provides examples
 * of all supported commands for each device type.
 */

const mqtt = require('mqtt');
const readline = require('readline');
const ConfigLoader = require('../../lib/core/config-loader');

class MqttTester {
    constructor() {
        this.client = null;
        this.config = null;
        this.testResults = [];
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async initialize(configPath = 'pfx.ini') {
        console.log('🚀 Initializing MQTT Test Suite...\n');

        try {
            // Load configuration
            this.config = await ConfigLoader.load(configPath);
            console.log(`✅ Configuration loaded: ${Object.keys(this.config.devices).length} devices found`);

            // Connect to MQTT broker
            await this.connectMqtt();
            console.log('✅ MQTT connection established\n');

        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            process.exit(1);
        }
    }

    async connectMqtt() {
        const brokerUrl = `mqtt://${this.config.global.mqttServer}:${this.config.global.mqttPort}`;
        console.log(`🔗 Connecting to MQTT broker: ${brokerUrl}`);

        return new Promise((resolve, reject) => {
            this.client = mqtt.connect(brokerUrl, {
                clientId: `pfx-test-${Date.now()}`,
                clean: true
            });

            this.client.on('connect', () => {
                console.log('✅ Connected to MQTT broker');
                resolve();
            });

            this.client.on('error', (error) => {
                console.error('❌ MQTT connection error:', error.message);
                reject(error);
            });

            this.client.on('message', (topic, message) => {
                try {
                    const payload = JSON.parse(message.toString());
                    console.log(`📨 Received message on ${topic}:`, JSON.stringify(payload, null, 2));
                } catch (error) {
                    console.log(`📨 Received message on ${topic}:`, message.toString());
                }
            });

            // Connection timeout
            setTimeout(() => {
                if (!this.client.connected) {
                    reject(new Error('MQTT connection timeout'));
                }
            }, 10000);
        });
    }

    async testMqttConnectivity() {
        console.log('🔍 Testing MQTT Connectivity...\n');

        const testTopic = 'pfx/test/connectivity';
        const testMessage = {
            test: 'connectivity',
            timestamp: new Date().toISOString(),
            message: 'MQTT test message'
        };

        return new Promise((resolve) => {
            let messageReceived = false;

            // Subscribe to test topic
            this.client.subscribe(testTopic, (error) => {
                if (error) {
                    console.error('❌ Failed to subscribe to test topic:', error.message);
                    resolve(false);
                    return;
                }
                console.log(`📡 Subscribed to: ${testTopic}`);
            });

            // Set up message handler
            const messageHandler = (topic, message) => {
                if (topic === testTopic && !messageReceived) {
                    messageReceived = true;
                    try {
                        const received = JSON.parse(message.toString());
                        if (received.test === testMessage.test) {
                            console.log('✅ MQTT connectivity test PASSED');
                            console.log('📨 Test message received successfully\n');
                            this.testResults.push({ test: 'MQTT Connectivity', result: 'PASS' });
                            resolve(true);
                        }
                    } catch (error) {
                        console.error('❌ Failed to parse received message:', error.message);
                        this.testResults.push({ test: 'MQTT Connectivity', result: 'FAIL' });
                        resolve(false);
                    }
                }
            };

            this.client.on('message', messageHandler);

            // Publish test message after short delay
            setTimeout(() => {
                console.log('📤 Publishing test message...');
                console.log('JSON:', JSON.stringify(testMessage, null, 2));
                this.client.publish(testTopic, JSON.stringify(testMessage));

                // Timeout if no response
                setTimeout(() => {
                    if (!messageReceived) {
                        console.error('❌ MQTT connectivity test FAILED - No response received');
                        this.testResults.push({ test: 'MQTT Connectivity', result: 'FAIL' });
                        resolve(false);
                    }
                }, 5000);
            }, 1000);
        });
    }

    async testDeviceCommands() {
        console.log('🎮 Testing Device Commands...\n');

        for (const [deviceName, deviceConfig] of Object.entries(this.config.devices)) {
            console.log(`\n🔧 Testing Device: ${deviceName} (${deviceConfig.type})`);
            console.log('='.repeat(60));

            await this.testDeviceType(deviceName, deviceConfig);
        }
    }

    async testDeviceType(deviceName, deviceConfig) {
        const commandTopic = `${deviceConfig.baseTopic}/command`;
        console.log(`📡 Command Topic: ${commandTopic}\n`);

        switch (deviceConfig.type) {
            case 'screen':
                await this.testScreenCommands(deviceName, deviceConfig, commandTopic);
                break;
            case 'light':
                await this.testLightCommands(deviceName, deviceConfig, commandTopic);
                break;
            case 'light_group':
                await this.testLightGroupCommands(deviceName, deviceConfig, commandTopic);
                break;
            case 'relay':
                await this.testRelayCommands(deviceName, deviceConfig, commandTopic);
                break;
            default:
                console.log(`⚠️  Unknown device type: ${deviceConfig.type}`);
        }
    }

    async testScreenCommands(deviceName, deviceConfig, commandTopic) {
        const commands = [
            // Image Commands
            {
                name: 'setImage (minimal)',
                description: 'Display an image file',
                command: { Command: 'setImage', Image: 'test-image.jpg' }
            },
            {
                name: 'setImage (with subdirectory)',
                description: 'Display an image from subdirectory',
                command: { Command: 'setImage', Image: 'backgrounds/lobby.jpg' }
            },

            // Video Commands
            {
                name: 'playVideo (minimal)',
                description: 'Play a video file',
                command: { Command: 'playVideo', Video: 'intro.mp4' }
            },
            {
                name: 'playVideo (full options)',
                description: 'Play a video with volume adjustment and channel',
                command: { Command: 'playVideo', Video: 'videos/intro.mp4', VolumeAdjust: -10, Channel: 'default' }
            },
            {
                name: 'stopVideo',
                description: 'Stop current video playback',
                command: { Command: 'stopVideo' }
            },
            {
                name: 'pause',
                description: 'Pause current video',
                command: { Command: 'pause' }
            },
            {
                name: 'resume',
                description: 'Resume paused video',
                command: { Command: 'resume' }
            },
            {
                name: 'skip',
                description: 'Skip to next video in queue',
                command: { Command: 'skip' }
            },

            // Audio Commands
            {
                name: 'playAudio (minimal)',
                description: 'Play an audio file',
                command: { Command: 'playAudio', Audio: 'background.mp3' }
            },
            {
                name: 'playAudio (full options)',
                description: 'Play audio with volume adjustment and channel',
                command: { Command: 'playAudio', Audio: 'music/background.mp3', VolumeAdjust: 20, Channel: 'default' }
            },
            {
                name: 'playAudioFx (minimal)',
                description: 'Play an audio effect',
                command: { Command: 'playAudioFx', Audio: 'doorbell.wav' }
            },
            {
                name: 'playAudioFx (full options)',
                description: 'Play audio effect with all options',
                command: { Command: 'playAudioFx', Audio: 'effects/explosion.wav', Type: 'one-shot', VolumeAdjust: 10 }
            },
            {
                name: 'playAudioFx (loop)',
                description: 'Play looping audio effect',
                command: { Command: 'playAudioFx', Audio: 'effects/ambient.wav', Type: 'loop', VolumeAdjust: -30 }
            },
            {
                name: 'stopAudio',
                description: 'Stop current audio playback',
                command: { Command: 'stopAudio' }
            },
            {
                name: 'stopAllAudioFx',
                description: 'Stop all audio effects',
                command: { Command: 'stopAllAudioFx' }
            },

            // Advanced Commands
            {
                name: 'transition (minimal)',
                description: 'Play video then show image',
                command: { Command: 'transition', Video: 'intro.mp4', Image: 'final.jpg' }
            },
            {
                name: 'transition (with channel)',
                description: 'Play video then show image with channel routing',
                command: { Command: 'transition', Video: 'transitions/intro.mp4', Image: 'backgrounds/final.jpg', Channel: 'default' }
            },
            {
                name: 'stopAll',
                description: 'Stop all media playback',
                command: { Command: 'stopAll' }
            },

            // Queue Management
            {
                name: 'videoQueue',
                description: 'Get video queue status',
                command: { Command: 'videoQueue' }
            },
            {
                name: 'audioQueue',
                description: 'Get audio queue status',
                command: { Command: 'audioQueue' }
            },
            {
                name: 'clearQueue',
                description: 'Clear media queue',
                command: { Command: 'clearQueue' }
            },

            // Configuration
            {
                name: 'getConfig',
                description: 'Get device configuration',
                command: { Command: 'getConfig' }
            }
        ];

        await this.executeCommands(commands, commandTopic, deviceName);
    }

    async testLightCommands(deviceName, deviceConfig, commandTopic) {
        const commands = [
            {
                name: 'on (minimal)',
                description: 'Turn light on',
                command: { Command: 'on' }
            },
            {
                name: 'on (with brightness)',
                description: 'Turn light on with specific brightness',
                command: { Command: 'on', Brightness: 80 }
            },
            {
                name: 'off',
                description: 'Turn light off',
                command: { Command: 'off' }
            },
            {
                name: 'setColor (hex)',
                description: 'Set light color using hex code',
                command: { Command: 'setColor', Color: '#FF6400', Brightness: 75 }
            },
            {
                name: 'setColor (RGB)',
                description: 'Set light color using RGB values',
                command: { Command: 'setColor', Color: { r: 255, g: 100, b: 0 }, Brightness: 90 }
            }
        ];

        await this.executeCommands(commands, commandTopic, deviceName);
    }

    async testLightGroupCommands(deviceName, deviceConfig, commandTopic) {
        const commands = [
            {
                name: 'on (group)',
                description: 'Turn all lights in group on',
                command: { Command: 'on', Brightness: 100 }
            },
            {
                name: 'off (group)',
                description: 'Turn all lights in group off',
                command: { Command: 'off' }
            },
            {
                name: 'setGroupColor',
                description: 'Set color for all lights in group',
                command: { Command: 'setGroupColor', Color: { r: 255, g: 100, b: 0 }, Brightness: 80, Lights: ['light1', 'light2'] }
            },
            {
                name: 'fade',
                description: 'Fade lights to target brightness',
                command: { Command: 'fade', Brightness: 50, Duration: 10000 }
            }
        ];

        await this.executeCommands(commands, commandTopic, deviceName);
    }

    async testRelayCommands(deviceName, deviceConfig, commandTopic) {
        const commands = [
            {
                name: 'on',
                description: 'Turn relay on',
                command: { Command: 'on' }
            },
            {
                name: 'off',
                description: 'Turn relay off',
                command: { Command: 'off' }
            },
            {
                name: 'toggle',
                description: 'Toggle relay state',
                command: { Command: 'toggle' }
            },
            {
                name: 'pulse (minimal)',
                description: 'Pulse relay with default duration',
                command: { Command: 'pulse' }
            },
            {
                name: 'pulse (with duration)',
                description: 'Pulse relay with custom duration',
                command: { Command: 'pulse', Duration: 5000 }
            }
        ];

        await this.executeCommands(commands, commandTopic, deviceName);
    }

    async executeCommands(commands, commandTopic, deviceName) {
        for (const cmd of commands) {
            console.log(`\n📝 Command: ${cmd.name}`);
            console.log(`   Description: ${cmd.description}`);
            console.log(`   Topic: ${commandTopic}`);
            console.log(`   JSON: ${JSON.stringify(cmd.command, null, 2)}`);

            // Subscribe to status topic for responses
            const statusTopic = `${commandTopic.replace('/command', '/status')}`;
            this.client.subscribe(statusTopic);

            console.log(`\n   Would you like to send this command? (y/n/q to quit): `);
            const response = await this.waitForInput();

            if (response.toLowerCase() === 'q') {
                console.log('🛑 Test terminated by user');
                return;
            }

            if (response.toLowerCase() === 'y') {
                console.log('📤 Publishing command...');
                this.client.publish(commandTopic, JSON.stringify(cmd.command));
                this.testResults.push({
                    test: `${deviceName} - ${cmd.name}`,
                    result: 'SENT',
                    command: cmd.command
                });

                // Wait briefly for any responses
                await this.delay(1000);
            } else {
                console.log('⏭️  Skipped');
                this.testResults.push({
                    test: `${deviceName} - ${cmd.name}`,
                    result: 'SKIPPED'
                });
            }
        }
    }

    waitForInput() {
        return new Promise((resolve) => {
            this.rl.question('', (answer) => {
                resolve(answer);
            });
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(60));

        let sent = 0, skipped = 0, passed = 0, failed = 0;

        for (const result of this.testResults) {
            const status = result.result === 'PASS' ? '✅' :
                result.result === 'FAIL' ? '❌' :
                    result.result === 'SENT' ? '📤' : '⏭️';

            console.log(`${status} ${result.test}: ${result.result}`);

            switch (result.result) {
                case 'SENT': sent++; break;
                case 'SKIPPED': skipped++; break;
                case 'PASS': passed++; break;
                case 'FAIL': failed++; break;
            }
        }

        console.log('\n📈 Statistics:');
        console.log(`   Commands Sent: ${sent}`);
        console.log(`   Commands Skipped: ${skipped}`);
        console.log(`   Tests Passed: ${passed}`);
        console.log(`   Tests Failed: ${failed}`);
        console.log(`   Total: ${this.testResults.length}`);

        console.log('\n💡 Note: "SENT" means the command was published to MQTT.');
        console.log('   Check your ParadoxFX application logs to see if commands were processed correctly.');
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up...');

        if (this.client) {
            this.client.end();
            console.log('✅ MQTT client disconnected');
        }

        this.rl.close();
    }

    async run(configPath) {
        try {
            await this.initialize(configPath);

            console.log('🎯 Starting MQTT Test Suite');
            console.log('This will test MQTT connectivity and demonstrate all device commands.\n');

            // Test basic MQTT connectivity
            const connectivityOk = await this.testMqttConnectivity();

            if (!connectivityOk) {
                console.log('❌ MQTT connectivity test failed. Please check your MQTT broker.');
                console.log('   Make sure mosquitto or another MQTT broker is running on localhost:1883');
                await this.cleanup();
                return;
            }

            // Test device commands
            await this.testDeviceCommands();

            // Show summary
            this.printSummary();

        } catch (error) {
            console.error('❌ Test suite failed:', error.message);
        } finally {
            await this.cleanup();
        }
    }
}

// Main execution
async function main() {
    const configPath = process.argv[2] || 'pfx.ini';
    console.log('🧪 ParadoxFX MQTT Test Suite');
    console.log('========================\n');

    const tester = new MqttTester();
    await tester.run(configPath);

    process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Test interrupted by user');
    process.exit(0);
});

if (require.main === module) {
    main().catch(console.error);
}

module.exports = MqttTester;
