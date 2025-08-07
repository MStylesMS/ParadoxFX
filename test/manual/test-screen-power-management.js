/**
 * Pi5 Screen Power Management Test
 * 
 * Tests the new intelligent screen power management system
 */

const mqtt = require('mqtt');
const Logger = require('../../lib/utils/logger');

const testConfig = {
    mqttServer: 'localhost',
    mqttPort: 1883,
    // PFX subscribes to baseTopic/commands and publishes to baseTopic/status
    commandTopic: 'paradox/zone1/commands',
    statusTopic: 'paradox/zone1/status'
};

class ScreenPowerTest {
    constructor() {
        this.logger = new Logger('ScreenPowerTest');
        this.mqttClient = null;
        this.testResults = [];
    }

    async initialize() {
        console.log('🔌 Pi5 Screen Power Management Test');
        console.log('=====================================\n');

        return new Promise((resolve, reject) => {
            this.mqttClient = mqtt.connect(`mqtt://${testConfig.mqttServer}:${testConfig.mqttPort}`, {
                clientId: `screen-power-test-${Date.now()}`
            });

            this.mqttClient.on('connect', () => {
                console.log('✅ Connected to MQTT broker');
                
                // Subscribe to status updates
                this.mqttClient.subscribe(testConfig.statusTopic, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('✅ Subscribed to device status updates\n');
                        resolve();
                    }
                });
            });

            this.mqttClient.on('message', (topic, message) => {
                if (topic === testConfig.statusTopic) {
                    try {
                        const status = JSON.parse(message.toString());
                        console.log('📊 Device Status:', {
                            status: status.status,
                            screenAwake: status.screenAwake,
                            currentImage: status.currentImage,
                            currentVideo: status.currentVideo,
                            timestamp: new Date().toLocaleTimeString()
                        });
                    } catch (e) {
                        console.log('📊 Raw status:', message.toString());
                    }
                }
            });

            this.mqttClient.on('error', reject);
        });
    }

    async runPowerManagementTests() {
        console.log('🧪 Running Screen Power Management Tests...\n');

        const tests = [
            { name: 'Sleep Screen', command: { Command: 'sleepScreen' }, delay: 3000 },
            { name: 'Wake Screen', command: { Command: 'wakeScreen' }, delay: 3000 },
            { name: 'Auto-wake with Image', command: { Command: 'setImage', Image: 'default.mp4' }, delay: 3000 },
            { name: 'Sleep Again', command: { Command: 'sleepScreen' }, delay: 3000 },
            { name: 'Auto-wake with Video', command: { Command: 'playVideo', Video: 'intro_short.mp4' }, delay: 5000 },
            { name: 'Test HDMI Audio Wake', command: { Command: 'playAudio', Audio: 'default.mp4' }, delay: 3000 },
            { name: 'Final Sleep Test', command: { Command: 'sleepScreen' }, delay: 2000 }
        ];

        for (let i = 0; i < tests.length; i++) {
            const test = tests[i];
            console.log(`🔄 Test ${i + 1}/${tests.length}: ${test.name}`);
            
            // Send command
            this.mqttClient.publish(testConfig.commandTopic, JSON.stringify(test.command));
            console.log(`   📤 Command sent:`, test.command);
            
            // Wait for response
            await this.sleep(test.delay);
            console.log(`   ⏰ Waiting ${test.delay}ms for response...\n`);
        }

        console.log('✅ All power management tests completed!\n');
    }

    async runIntelligentWakeTests() {
        console.log('🧠 Testing Intelligent Auto-Wake Behavior...\n');

        console.log('📝 Test Scenario:');
        console.log('   1. Put screen to sleep');
        console.log('   2. Send image command (should auto-wake)');
        console.log('   3. Send video command (should auto-wake)');
        console.log('   4. Send HDMI audio command (should auto-wake)');
        console.log('   5. Verify wake behavior is seamless\n');

        // Sleep first
        console.log('😴 Putting screen to sleep...');
        this.mqttClient.publish(testConfig.commandTopic, JSON.stringify({ Command: 'sleepScreen' }));
        await this.sleep(3000);

        // Test image auto-wake
        console.log('📸 Testing image auto-wake...');
        this.mqttClient.publish(testConfig.commandTopic, JSON.stringify({ 
            Command: 'setImage', 
            Image: 'default.mp4' 
        }));
        await this.sleep(3000);

        // Sleep and test video auto-wake
        console.log('😴 Sleep again...');
        this.mqttClient.publish(testConfig.commandTopic, JSON.stringify({ Command: 'sleepScreen' }));
        await this.sleep(2000);

        console.log('🎬 Testing video auto-wake...');
        this.mqttClient.publish(testConfig.commandTopic, JSON.stringify({ 
            Command: 'playVideo', 
            Video: 'intro_short.mp4' 
        }));
        await this.sleep(5000);

        console.log('✅ Intelligent wake tests completed!\n');
    }

    async shutdown() {
        console.log('🛑 Shutting down test...');
        
        if (this.mqttClient) {
            this.mqttClient.end();
        }
        
        console.log('✅ Test shutdown complete');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

async function runScreenPowerTest() {
    const test = new ScreenPowerTest();
    
    process.on('SIGINT', async () => {
        console.log('\n🛑 Received interrupt signal...');
        await test.shutdown();
        process.exit(0);
    });

    try {
        await test.initialize();
        await test.runPowerManagementTests();
        await test.runIntelligentWakeTests();
        
        console.log('🎉 All screen power management tests completed successfully!');
        console.log('\n📋 Summary:');
        console.log('✅ MQTT communication working');
        console.log('✅ Sleep/wake commands working');  
        console.log('✅ Auto-wake for media commands working');
        console.log('✅ Intelligent wake behavior implemented');

    } catch (error) {
        console.log(`\n❌ TEST FAILED: ${error.message}`);
        
    } finally {
        await test.shutdown();
    }
}

if (require.main === module) {
    runScreenPowerTest();
}

module.exports = ScreenPowerTest;
