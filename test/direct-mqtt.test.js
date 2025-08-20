/**
 * Test direct MQTT library in Jest environment
 */

const mqtt = require('mqtt');

describe('Direct MQTT Library Test', () => {
    test('direct mqtt connection', async () => {
        console.log('Starting direct MQTT test...');
        
        return new Promise((resolve, reject) => {
            console.log('Creating direct MQTT client...');
            const client = mqtt.connect('mqtt://localhost:1883', {
                clientId: 'jest-test-' + Date.now(),
                clean: true,
                connectTimeout: 10000
            });
            
            console.log('Setting up event handlers...');
            
            client.on('connect', () => {
                console.log('✅ Direct MQTT connect event fired!');
                client.end();
                resolve();
            });
            
            client.on('error', (error) => {
                console.log('❌ Direct MQTT error:', error.message);
                reject(error);
            });
            
            console.log('Waiting for events...');
        });
    }, 15000);
});
