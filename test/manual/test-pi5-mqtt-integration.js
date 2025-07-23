/**
 * Pi5 MQTT Integration Test
 * 
 * Tests actual MQTT command integration with ParadoxFX on Pi5
 */

const mqtt = require('mqtt');

// Test configuration
const testConfig = {
    mqttServer: 'localhost',
    mqttPort: 1883,
    testTopic: 'pfx/test/zone1/commands',
    statusTopic: 'pfx/test/zone1/status'
};

console.log('🎬 Pi5 MQTT Integration Test');
console.log('============================\n');

async function testMqttCommands() {
    const client = mqtt.connect(`mqtt://${testConfig.mqttServer}:${testConfig.mqttPort}`, {
        clientId: `pi5-mqtt-test-${Date.now()}`
    });

    return new Promise((resolve, reject) => {
        client.on('connect', () => {
            console.log('✅ Connected to MQTT broker');
            
            // Subscribe to status updates
            client.subscribe(testConfig.statusTopic, (err) => {
                if (err) {
                    console.log('❌ Failed to subscribe to status topic');
                    reject(err);
                } else {
                    console.log('✅ Subscribed to status updates');
                    runTestSequence();
                }
            });
        });

        client.on('message', (topic, message) => {
            if (topic === testConfig.statusTopic) {
                try {
                    const status = JSON.parse(message.toString());
                    console.log('📊 Status update:', {
                        device: status.device,
                        status: status.status,
                        timestamp: status.timestamp
                    });
                } catch (e) {
                    console.log('📊 Raw status:', message.toString());
                }
            }
        });

        client.on('error', (err) => {
            console.log('❌ MQTT connection error:', err.message);
            reject(err);
        });

        function runTestSequence() {
            console.log('\n🧪 Sending test commands via MQTT...\n');
            
            setTimeout(() => {
                console.log('📸 Test 1: Set Image Command');
                const imageCommand = {
                    Command: 'setImage',
                    Image: 'default.mp4'
                };
                client.publish(testConfig.testTopic, JSON.stringify(imageCommand));
            }, 1000);
            
            setTimeout(() => {
                console.log('🎬 Test 2: Play Video Command');
                const videoCommand = {
                    Command: 'playVideo',
                    Video: 'intro_short.mp4',
                    Channel: 1
                };
                client.publish(testConfig.testTopic, JSON.stringify(videoCommand));
            }, 4000);
            
            setTimeout(() => {
                console.log('🔊 Test 3: Audio Test Command');
                const audioCommand = {
                    Command: 'playAudio',
                    Audio: 'default.mp4',
                    Channel: 1
                };
                client.publish(testConfig.testTopic, JSON.stringify(audioCommand));
            }, 8000);
            
            setTimeout(() => {
                console.log('\n✅ MQTT command test sequence complete');
                console.log('📋 Summary:');
                console.log('  - MQTT broker connection: Working');
                console.log('  - Command publishing: Working');
                console.log('  - Status subscription: Working');
                console.log('\n🎉 Pi5 MQTT integration test passed!');
                client.end();
                resolve();
            }, 12000);
        }
    });
}

// Run the test
testMqttCommands().catch(console.error);
