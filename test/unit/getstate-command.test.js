#!/usr/bin/env node
/**
 * Test for getState command implementation
 * 
 * Tests that both ScreenZone and AudioZone properly handle getState commands
 * and publish status immediately when requested.
 */

const mqtt = require('mqtt');

async function testGetStateCommand() {
    return new Promise((resolve, reject) => {
        const client = mqtt.connect('mqtt://localhost');
        let statusReceived = false;
        let testTimeout;

        client.on('connect', () => {
            console.log('🔗 Connected to MQTT broker');
            
            // Subscribe to state topic
            client.subscribe('paradox/houdini/mirror/state', (err) => {
                if (err) {
                    reject(new Error(`Failed to subscribe: ${err.message}`));
                    return;
                }
                
                console.log('📡 Subscribed to state topic');
                
                // Send getState command
                const command = { command: 'getState' };
                client.publish('paradox/houdini/mirror/commands', JSON.stringify(command), (err) => {
                    if (err) {
                        reject(new Error(`Failed to publish command: ${err.message}`));
                        return;
                    }
                    
                    console.log('📤 Sent getState command');
                    
                    // Set timeout for test
                    testTimeout = setTimeout(() => {
                        if (!statusReceived) {
                            reject(new Error('❌ Timeout: No state message received within 5 seconds'));
                        }
                    }, 5000);
                });
            });
        });

        client.on('message', (topic, message) => {
            if (topic === 'paradox/houdini/mirror/state') {
                statusReceived = true;
                clearTimeout(testTimeout);
                
                try {
                    const state = JSON.parse(message.toString());
                    console.log('✅ State message received');
                    console.log('📊 State data:', {
                        zone: state.zone || 'unknown',
                        status: state.current_state?.status || 'unknown',
                        lastCommand: state.current_state?.lastCommand || 'unknown'
                    });
                    
                    // Verify it contains expected fields
                    if (state.current_state && typeof state.current_state === 'object') {
                        console.log('✅ State message has valid structure');
                        resolve();
                    } else {
                        reject(new Error('❌ State message missing current_state field'));
                    }
                    
                } catch (parseError) {
                    reject(new Error(`❌ Failed to parse state message: ${parseError.message}`));
                }
                
                client.end();
            }
        });

        client.on('error', (err) => {
            clearTimeout(testTimeout);
            reject(new Error(`❌ MQTT error: ${err.message}`));
        });
    });
}

// Run test if called directly
if (require.main === module) {
    console.log('🧪 Testing getState command implementation...');
    console.log('===============================================');
    
    testGetStateCommand()
        .then(() => {
            console.log('===============================================');
            console.log('✅ getState command test PASSED');
            console.log('🎉 Implementation working correctly!');
            process.exit(0);
        })
        .catch((error) => {
            console.log('===============================================');
            console.log('❌ getState command test FAILED');
            console.error('💥 Error:', error.message);
            process.exit(1);
        });
}

module.exports = { testGetStateCommand };
