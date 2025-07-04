#!/usr/bin/env node

/**
 * MQTT Connection Test Script
 * Tests the MQTT connection using the same configuration and client as the main application
 */

const mqtt = require('mqtt');
const ini = require('ini');
const fs = require('fs');
const path = require('path');

// Read configuration
const configPath = path.join(__dirname, 'pxfx.ini');
if (!fs.existsSync(configPath)) {
    console.error('❌ Configuration file not found:', configPath);
    process.exit(1);
}

const config = ini.parse(fs.readFileSync(configPath, 'utf-8'));
const globalConfig = config.global || {};

// Extract MQTT settings
const mqttServer = globalConfig.MQTT_SERVER || 'localhost';
const mqttPort = globalConfig.MQTT_PORT || 1883;
const heartbeatTopic = globalConfig.HEARTBEAT_TOPIC || 'Paradox/Devices';

console.log('🔧 MQTT Connection Test');
console.log('📋 Configuration:');
console.log(`   Server: ${mqttServer}`);
console.log(`   Port: ${mqttPort}`);
console.log(`   Heartbeat Topic: ${heartbeatTopic}`);
console.log('');

const url = `mqtt://${mqttServer}:${mqttPort}`;
console.log(`🔌 Connecting to ${url}...`);

// Create MQTT client
const client = mqtt.connect(url, {
    clientId: `pxfx-test-${Date.now()}`,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000
});

let testsPassed = 0;
let totalTests = 4;

// Test 1: Connection
client.on('connect', () => {
    console.log('✅ Test 1/4: Connection successful');
    testsPassed++;

    // Test 2: Subscribe to test topic
    const testTopic = 'pxfx/test/connection';
    client.subscribe(testTopic, (err) => {
        if (err) {
            console.log('❌ Test 2/4: Subscribe failed:', err.message);
        } else {
            console.log('✅ Test 2/4: Subscribe successful');
            testsPassed++;

            // Test 3: Publish test message
            const testMessage = {
                timestamp: new Date().toISOString(),
                test: 'connection-test',
                clientId: client.options.clientId
            };

            client.publish(testTopic, JSON.stringify(testMessage), (err) => {
                if (err) {
                    console.log('❌ Test 3/4: Publish failed:', err.message);
                } else {
                    console.log('✅ Test 3/4: Publish successful');
                    testsPassed++;
                }
            });
        }
    });
});

// Test 4: Message reception
client.on('message', (topic, message) => {
    try {
        const data = JSON.parse(message.toString());
        if (data.test === 'connection-test') {
            console.log('✅ Test 4/4: Message reception successful');
            console.log(`   📨 Received: ${message.toString()}`);
            testsPassed++;

            // All tests complete
            setTimeout(() => {
                console.log('');
                console.log('📊 Test Results:');
                console.log(`   Passed: ${testsPassed}/${totalTests}`);

                if (testsPassed === totalTests) {
                    console.log('🎉 All MQTT tests passed! Connection is working correctly.');

                    // Test heartbeat functionality
                    console.log('');
                    console.log('💓 Testing heartbeat...');
                    const heartbeatMessage = {
                        timestamp: new Date().toISOString(),
                        device: 'test-client',
                        status: 'online'
                    };

                    client.publish(heartbeatTopic, JSON.stringify(heartbeatMessage), (err) => {
                        if (err) {
                            console.log('❌ Heartbeat test failed:', err.message);
                        } else {
                            console.log('✅ Heartbeat test successful');
                        }

                        client.end();
                        process.exit(0);
                    });
                } else {
                    console.log('❌ Some MQTT tests failed. Check broker configuration.');
                    client.end();
                    process.exit(1);
                }
            }, 1000);
        }
    } catch (err) {
        console.log('⚠️  Received non-JSON message:', message.toString());
    }
});

// Error handling
client.on('error', (error) => {
    console.log('❌ MQTT connection error:', error.message);
    console.log('');
    console.log('🔍 Troubleshooting:');
    console.log('   1. Check if MQTT broker is running: sudo systemctl status mosquitto');
    console.log('   2. Check broker logs: sudo journalctl -u mosquitto -f');
    console.log('   3. Verify port is open: netstat -tlnp | grep :1883');
    console.log('   4. Test with mosquitto clients:');
    console.log(`      mosquitto_sub -h ${mqttServer} -p ${mqttPort} -t "test/topic"`);
    console.log(`      mosquitto_pub -h ${mqttServer} -p ${mqttPort} -t "test/topic" -m "test"`);

    process.exit(1);
});

client.on('disconnect', () => {
    console.log('🔌 Disconnected from MQTT broker');
});

// Timeout for the entire test
setTimeout(() => {
    if (testsPassed < totalTests) {
        console.log('⏰ Test timeout - not all tests completed');
        console.log(`   Completed: ${testsPassed}/${totalTests}`);
        client.end();
        process.exit(1);
    }
}, 15000);
