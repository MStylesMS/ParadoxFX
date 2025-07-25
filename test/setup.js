/**
 * Test Setup
 * 
 * Global test configuration and setup.
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Suppress logs during testing

// Global test timeout
jest.setTimeout(10000);

// Mock external dependencies that require actual hardware/services
jest.mock('mqtt', () => ({
    connect: jest.fn(() => ({
        on: jest.fn(),
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
        publish: jest.fn(),
        end: jest.fn()
    }))
}));

// Global test utilities
global.testUtils = {
    createMockMqttClient: () => ({
        connected: true,
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
        publish: jest.fn(),
        config: {
            heartbeatTopic: 'test/heartbeat'
        }
    }),

    createMockConfig: () => ({
        global: {
            mqttServer: 'localhost',
            mqttPort: 1883,
            heartbeatTopic: 'test/heartbeat',
            heartbeatInterval: 1000
        },
        devices: {
            TestScreen: {
                name: 'TestScreen',
                type: 'screen',
                display: ':0',
                baseTopic: 'test/screen',
                statusTopic: 'test/screen/status',
                mediaDir: '/opt/paradox/apps/pfx/media/test',
                videoQueueMax: 5,
                audioQueueMax: 5
            }
        }
    }),

    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};
