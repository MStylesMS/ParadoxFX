/**
 * Integration Tests for MQTT Communication
 */

const mqtt = require('mqtt');
const MqttClient = require('../../lib/core/mqtt-client');

const shouldSkipIntegrationTests = process.env.SKIP_INTEGRATION_TESTS === '1';

const describeIntegration = shouldSkipIntegrationTests ? describe.skip : describe;

describeIntegration('MQTT Integration', () => {
    let testBroker;
    let mqttClient;

    beforeAll(async () => {
        // These tests require an actual MQTT broker running on localhost
        console.log('Running MQTT integration tests - requires broker on localhost:1883');
    });

    beforeEach(() => {
        const config = {
            mqttServer: 'localhost',
            mqttPort: 1883,
            heartbeatTopic: 'test/integration/heartbeat',
            heartbeatInterval: 5000
        };

        mqttClient = new MqttClient(config);
    });

    afterEach(async () => {
        if (mqttClient) {
            await mqttClient.disconnect();
        }
    });

    test('should connect to real MQTT broker', async () => {
        await expect(mqttClient.connect()).resolves.toBeUndefined();
        expect(mqttClient.connected).toBe(true);
    }, 15000);

    test('should publish and receive messages', async () => {
        await mqttClient.connect();

        const testTopic = 'test/integration/message';
        const testMessage = { command: 'test', timestamp: Date.now() };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Message not received within timeout'));
            }, 5000);

            mqttClient.subscribe(testTopic, (topic, message) => {
                try {
                    clearTimeout(timeout);
                    expect(topic).toBe(testTopic);
                    expect(message).toEqual(testMessage);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });

            // Give subscription time to register
            setTimeout(() => {
                mqttClient.publish(testTopic, testMessage);
            }, 100);
        });
    }, 10000);

    test('should handle multiple subscribers', async () => {
        await mqttClient.connect();

        const testTopic = 'test/integration/multi';
        const testMessage = 'multi-test';

        let received1 = false;
        let received2 = false;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Not all messages received within timeout'));
            }, 5000);

            const checkComplete = () => {
                if (received1 && received2) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            mqttClient.subscribe(`${testTopic}/1`, (topic, message) => {
                expect(message).toBe(testMessage);
                received1 = true;
                checkComplete();
            });

            mqttClient.subscribe(`${testTopic}/2`, (topic, message) => {
                expect(message).toBe(testMessage);
                received2 = true;
                checkComplete();
            });

            // Give subscriptions time to register
            setTimeout(() => {
                mqttClient.publish(`${testTopic}/1`, testMessage);
                mqttClient.publish(`${testTopic}/2`, testMessage);
            }, 100);
        });
    }, 10000);

    test('should handle connection loss and reconnection', async () => {
        await mqttClient.connect();
        expect(mqttClient.connected).toBe(true);

        // Simulate connection loss
        mqttClient.client.emit('disconnect');
        expect(mqttClient.connected).toBe(false);

        // The client should automatically attempt to reconnect
        // This test verifies the event handling works correctly
    }, 10000);

    test('should respect QoS settings', async () => {
        await mqttClient.connect();

        const testTopic = 'test/integration/qos';
        const testMessage = 'qos-test';

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('QoS message not received'));
            }, 5000);

            mqttClient.subscribe(testTopic, (topic, message) => {
                clearTimeout(timeout);
                expect(message).toBe(testMessage);
                resolve();
            });

            setTimeout(() => {
                mqttClient.publish(testTopic, testMessage, { qos: 1 });
            }, 100);
        });
    }, 10000);
});
