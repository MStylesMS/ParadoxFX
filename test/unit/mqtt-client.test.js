/**
 * Unit Tests for MqttClient
 */

const MqttClient = require('../../lib/core/mqtt-client');
const mqtt = require('mqtt');

describe('MqttClient', () => {
    let mqttClient;
    let mockMqttInstance;

    beforeEach(() => {
        mockMqttInstance = {
            on: jest.fn(),
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
            publish: jest.fn(),
            end: jest.fn()
        };

        mqtt.connect.mockReturnValue(mockMqttInstance);

        const config = {
            mqttServer: 'localhost',
            mqttPort: 1883,
            heartbeatTopic: 'test/heartbeat',
            heartbeatInterval: 1000,
            mqttMaxAttempts: 1,
            mqttConnectTimeoutMs: 200,
            mqttOverallTimeoutMs: 400
        };

        mqttClient = new MqttClient(config);
    });

    describe('connect', () => {
        test('should connect to MQTT broker successfully', async () => {
            const connectPromise = mqttClient.connect();

            // Simulate successful connection
            const connectCallback = mockMqttInstance.on.mock.calls.find(call => call[0] === 'connect')[1];
            connectCallback();

            await expect(connectPromise).resolves.toBeUndefined();
            expect(mqttClient.connected).toBe(true);
            expect(mqtt.connect).toHaveBeenCalledWith('mqtt://localhost:1883', expect.any(Object));
        });

        test('should handle connection errors', async () => {
            const connectPromise = mqttClient.connect();
            const errorCallback = mockMqttInstance.on.mock.calls.find(call => call[0] === 'error')[1];
            // Fire error before connect
            errorCallback(new Error('Connection failed'));
            await expect(connectPromise).rejects.toThrow('Connection failed');
        });

        test('should timeout on slow connections', async () => {
            jest.useFakeTimers();
            const connectPromise = mqttClient.connect();
            // Advance beyond overall timeout (400ms)
            jest.advanceTimersByTime(450);
            await expect(connectPromise).rejects.toThrow('overall connection timeout');
            jest.useRealTimers();
        });
    });

    describe('subscribe', () => {
        beforeEach(async () => {
            // Connect first
            const connectPromise = mqttClient.connect();
            const connectCallback = mockMqttInstance.on.mock.calls.find(call => call[0] === 'connect')[1];
            connectCallback();
            await connectPromise;
        });

        test('should subscribe to topic with handler', () => {
            const handler = jest.fn();

            mqttClient.subscribe('test/topic', handler);

            expect(mockMqttInstance.subscribe).toHaveBeenCalledWith('test/topic', expect.any(Function));

            // Simulate successful subscription callback
            const subscribeCallback = mockMqttInstance.subscribe.mock.calls[0][1];
            subscribeCallback(null); // null = no error

            // Now verify subscription was registered by triggering a message
            mqttClient._handleMessage('test/topic', JSON.stringify({ test: 'data' }));
            expect(handler).toHaveBeenCalledWith('test/topic', { test: 'data' });
        });

        test('should throw error if not connected', () => {
            mqttClient.connected = false;

            expect(() => {
                mqttClient.subscribe('test/topic', jest.fn());
            }).toThrow('MQTT client not connected');
        });
    });

    describe('publish', () => {
        beforeEach(async () => {
            // Connect first
            const connectPromise = mqttClient.connect();
            const connectCallback = mockMqttInstance.on.mock.calls.find(call => call[0] === 'connect')[1];
            connectCallback();
            await connectPromise;
        });

        test('should publish string message', () => {
            mqttClient.publish('test/topic', 'hello');

            expect(mockMqttInstance.publish).toHaveBeenCalledWith(
                'test/topic',
                'hello',
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should publish object as JSON', () => {
            const message = { command: 'test' };

            mqttClient.publish('test/topic', message);

            expect(mockMqttInstance.publish).toHaveBeenCalledWith(
                'test/topic',
                JSON.stringify(message),
                expect.any(Object),
                expect.any(Function)
            );
        });

        test('should not publish if not connected', () => {
            mqttClient.connected = false;

            mqttClient.publish('test/topic', 'hello');

            expect(mockMqttInstance.publish).not.toHaveBeenCalled();
        });
    });

    describe('message handling', () => {
        let messageHandler;

        beforeEach(async () => {
            // Connect and get message handler
            const connectPromise = mqttClient.connect();
            const connectCallback = mockMqttInstance.on.mock.calls.find(call => call[0] === 'connect')[1];
            connectCallback();
            await connectPromise;

            messageHandler = mockMqttInstance.on.mock.calls.find(call => call[0] === 'message')[1];
        });

        test('should handle JSON messages', () => {
            const handler = jest.fn();
            mqttClient.subscribe('test/topic', handler);

            // Simulate successful subscription
            const subscribeCallback = mockMqttInstance.subscribe.mock.calls[0][1];
            subscribeCallback(null);

            // Simulate incoming message
            const message = Buffer.from(JSON.stringify({ command: 'test' }));
            messageHandler('test/topic', message);

            expect(handler).toHaveBeenCalledWith('test/topic', { command: 'test' });
        });

        test('should handle plain text messages', () => {
            const handler = jest.fn();
            mqttClient.subscribe('test/topic', handler);

            // Simulate successful subscription
            const subscribeCallback = mockMqttInstance.subscribe.mock.calls[0][1];
            subscribeCallback(null);

            // Simulate incoming message
            const message = Buffer.from('plain text');
            messageHandler('test/topic', message);

            expect(handler).toHaveBeenCalledWith('test/topic', 'plain text');
        });

        test('should handle messages without registered handler', () => {
            const message = Buffer.from('test');

            expect(() => {
                messageHandler('unknown/topic', message);
            }).not.toThrow();
        });
    });

    describe('disconnect', () => {
        test('should disconnect from broker', async () => {
            mqttClient.client = mockMqttInstance;

            const disconnectPromise = mqttClient.disconnect();

            // Simulate end callback
            const endCallback = mockMqttInstance.end.mock.calls[0][2];
            endCallback();

            await expect(disconnectPromise).resolves.toBeUndefined();
            expect(mqttClient.connected).toBe(false);
        });

        test('should handle disconnect when no client exists', async () => {
            mqttClient.client = null;

            await expect(mqttClient.disconnect()).resolves.toBeUndefined();
        });
    });
});
