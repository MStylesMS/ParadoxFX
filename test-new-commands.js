#!/usr/bin/env node

/**
 * Test script for newly implemented PFX commands
 * Tests: setZoneVolume, restartPfx, setBrowserUrl, setBrowserKeepAlive
 */

const mqtt = require('mqtt');

// Configuration
const MQTT_BROKER = 'mqtt://localhost:1883';
const TEST_TOPIC = 'paradox/houdini/mirror/commands';
const STATUS_TOPIC = 'paradox/houdini/mirror/state';

console.log('🧪 Testing newly implemented PFX commands...');
console.log('==============================================');

// Connect to MQTT
const client = mqtt.connect(MQTT_BROKER);

client.on('connect', () => {
    console.log('✅ Connected to MQTT broker');
    
    // Subscribe to status updates
    client.subscribe(STATUS_TOPIC, (err) => {
        if (err) {
            console.error('❌ Failed to subscribe to status topic:', err);
            return;
        }
        console.log('✅ Subscribed to status updates');
        
        // Start tests
        runTests();
    });
});

client.on('message', (topic, message) => {
    if (topic === STATUS_TOPIC) {
        try {
            const status = JSON.parse(message.toString());
            console.log('📊 Status Update:', {
                zoneVolume: status.zoneVolume,
                browserEnabled: status.browser?.enabled,
                browserUrl: status.browser?.url,
                focus: status.focus
            });
        } catch (err) {
            console.log('📊 Status (raw):', message.toString());
        }
    }
});

function sendCommand(command, description) {
    return new Promise((resolve) => {
        console.log(`\n🔧 ${description}`);
        console.log(`   Command: ${JSON.stringify(command)}`);
        
        client.publish(TEST_TOPIC, JSON.stringify(command), (err) => {
            if (err) {
                console.error(`❌ Failed to send command: ${err}`);
            } else {
                console.log('✅ Command sent successfully');
            }
            setTimeout(resolve, 2000); // Wait 2 seconds before next command
        });
    });
}

async function runTests() {
    console.log('\n🚀 Starting command tests...\n');
    
    try {
        // Test 1: setZoneVolume
        await sendCommand(
            { command: 'setZoneVolume', volume: 75 },
            'Testing setZoneVolume - Set zone master volume to 75%'
        );
        
        // Test 2: setBrowserUrl
        await sendCommand(
            { command: 'setBrowserUrl', url: 'http://localhost/clock/?theme=dark' },
            'Testing setBrowserUrl - Change browser URL to dark theme'
        );
        
        // Test 3: setBrowserKeepAlive (enable)
        await sendCommand(
            { command: 'setBrowserKeepAlive', enabled: true },
            'Testing setBrowserKeepAlive - Enable browser auto-restart'
        );
        
        // Test 4: Another volume change
        await sendCommand(
            { command: 'setZoneVolume', volume: 60 },
            'Testing setZoneVolume - Set zone master volume to 60%'
        );
        
        // Test 5: setBrowserKeepAlive (disable)
        await sendCommand(
            { command: 'setBrowserKeepAlive', enabled: false },
            'Testing setBrowserKeepAlive - Disable browser auto-restart'
        );
        
        console.log('\n✅ All tests completed!');
        console.log('\n⚠️  Note: restartPfx command not tested as it would terminate PFX');
        console.log('💡 To test restartPfx manually, run:');
        console.log('   mosquitto_pub -t "paradox/houdini/mirror/commands" -m \'{"command":"restartPfx"}\'');
        
        // Keep listening for a bit longer
        setTimeout(() => {
            console.log('\n🏁 Test script completed. Disconnecting...');
            client.end();
            process.exit(0);
        }, 5000);
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        client.end();
        process.exit(1);
    }
}

// Handle cleanup
process.on('SIGINT', () => {
    console.log('\n🛑 Test interrupted. Disconnecting...');
    client.end();
    process.exit(0);
});
