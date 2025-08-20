/**
 * Minimal MQTT Jest test to debug hanging issue
 */

const MqttClient = require('../lib/core/mqtt-client');

describe('Debug MQTT', () => {
    let mqttClient;

    beforeEach(() => {
        console.log('beforeEach: creating config...');
        const config = {
            mqttServer: 'localhost',
            mqttPort: 1883,
            heartbeatTopic: 'test/debug/heartbeat',
            heartbeatInterval: 5000
        };

        console.log('beforeEach: creating MqttClient...');
        mqttClient = new MqttClient(config);
        console.log('beforeEach: MqttClient created');
    });

    afterEach(async () => {
        console.log('afterEach: starting...');
        if (mqttClient && mqttClient.connected) {
            console.log('afterEach: disconnecting...');
            await mqttClient.disconnect();
            console.log('afterEach: disconnected');
        }
        console.log('afterEach: finished');
    });

    test('minimal connection test', async () => {
        console.log('test: starting connection...');
        console.log('test: mqttClient exists:', !!mqttClient);
        console.log('test: about to call connect()...');
        
        // Try with a timeout wrapper
        const connectPromise = mqttClient.connect();
        console.log('test: connect() called, promise created');
        
        await connectPromise;
        console.log('test: connect() resolved');
        console.log('test: connected, status:', mqttClient.connected);
        expect(mqttClient.connected).toBe(true);
        console.log('test: finished');
    }, 30000);
});
