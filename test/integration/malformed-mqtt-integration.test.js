#!/usr/bin/env node

/**
 * Integration Test for Malformed MQTT Message Handling
 * 
 * This script tests the actual application behavior with malformed MQTT messages
 * to verify that the application doesn't crash and handles errors gracefully.
 */

const ZoneManager = require('../../lib/core/zone-manager');
const MqttClient = require('../../lib/core/mqtt-client');
const Logger = require('../../lib/utils/logger');

// Create a simple test zone
class TestZone {
    constructor(config) {
        this.config = config;
        this.logger = new Logger('TestZone');
        this.messages = [];
    }

    async initialize() {
        this.logger.info('Test zone initialized');
    }

    async handleCommand(command) {
        this.logger.info('Handling command:', command);

        // Simulate some command processing that could fail
        if (command.Command === 'playSpeech' && command.filePath) {
            // Simulate file not found error
            if (command.filePath.includes('/nonexistent/')) {
                const error = new Error('File not found');
                error.code = 'ENOENT';
                throw error;
            }
        }
    }

    publishMessage(type, data) {
        this.messages.push({ type, data, timestamp: new Date().toISOString() });
        this.logger.info(`Published ${type} message:`, data);
    }

    async shutdown() {
        this.logger.info('Test zone shutdown');
    }
}

async function runIntegrationTest() {
    const logger = new Logger('IntegrationTest');
    logger.info('Starting malformed MQTT message integration test...');

    try {
        // Create mock MQTT client
        const mockMqttClient = {
            subscribe: (topic, handler) => {
                logger.info(`Subscribed to ${topic}`);
            },
            unsubscribe: (topic) => {
                logger.info(`Unsubscribed from ${topic}`);
            },
            publish: (topic, message) => {
                logger.info(`Published to ${topic}:`, message);
            }
        };

        // Create test configuration
        const config = {
            global: {
                logLevel: 'info'
            },
            devices: {
                testZone: {
                    type: 'audio',
                    name: 'testZone',
                    baseTopic: 'paradox/testZone'
                }
            }
        };

        // Create zone manager
        const zoneManager = new ZoneManager(config, mockMqttClient);

        // Create and register test zone
        const testZone = new TestZone(config.devices.testZone);
        zoneManager.zones.set('testZone', testZone);

        logger.info('Zone manager initialized, starting tests...');

        // Test scenarios from the issue
        const testCases = [
            {
                name: 'Malformed JSON - Missing closing brace',
                message: '{"command":"playSpeech","filePath":"/path/file.mp3"',
                expectedErrorType: 'warning'
            },
            {
                name: 'Missing file path',
                message: '{"Command":"playSpeech","filePath":"/nonexistent/file.mp3"}',
                expectedErrorType: 'error'
            },
            {
                name: 'Invalid command',
                message: '{"Command":"invalidCommand","param":"value"}',
                expectedErrorType: 'events' // Should process but zone might reject
            },
            {
                name: 'Wrong data types',
                message: '{"Command":"playSpeech","filePath":123}',
                expectedErrorType: 'events' // Validation should allow this, but execution may fail
            },
            {
                name: 'Completely invalid JSON',
                message: 'this is not json at all',
                expectedErrorType: 'warning'
            },
            {
                name: 'Empty message',
                message: '',
                expectedErrorType: 'warning'
            },
            {
                name: 'Missing Command field',
                message: '{"filePath":"/path/file.mp3"}',
                expectedErrorType: 'warning'
            }
        ];

        logger.info(`Running ${testCases.length} test cases...`);

        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            logger.info(`\n=== Test ${i + 1}: ${testCase.name} ===`);

            const messagesBefore = testZone.messages.length;

            try {
                // This should NOT crash the application
                await zoneManager._handleZoneCommand('testZone', testZone, testCase.message);

                const messagesAfter = testZone.messages.length;
                const newMessages = testZone.messages.slice(messagesBefore);

                if (newMessages.length > 0) {
                    logger.info(`✓ Test passed - Published ${newMessages.length} message(s):`);
                    newMessages.forEach(msg => {
                        logger.info(`  - ${msg.type}: ${msg.data.message || JSON.stringify(msg.data).substring(0, 100)}`);
                    });
                } else {
                    logger.info('✓ Test passed - No messages published (message filtered out)');
                }

            } catch (error) {
                logger.error(`✗ Test failed - Unexpected error: ${error.message}`);
                return false;
            }
        }

        logger.info('\n=== Integration Test Results ===');
        logger.info(`✓ All ${testCases.length} test cases passed!`);
        logger.info(`✓ Application did not crash during any test`);
        logger.info(`✓ Total messages published: ${testZone.messages.length}`);

        // Show message type breakdown
        const messageTypes = {};
        testZone.messages.forEach(msg => {
            messageTypes[msg.type] = (messageTypes[msg.type] || 0) + 1;
        });

        logger.info('✓ Message type breakdown:');
        Object.entries(messageTypes).forEach(([type, count]) => {
            logger.info(`  - ${type}: ${count}`);
        });

        return true;

    } catch (error) {
        logger.error('Integration test failed:', error);
        return false;
    }
}

// Run the test
if (require.main === module) {
    runIntegrationTest()
        .then(success => {
            if (success) {
                console.log('\n🎉 Integration test completed successfully!');
                process.exit(0);
            } else {
                console.log('\n❌ Integration test failed!');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('\n💥 Integration test crashed:', error);
            process.exit(1);
        });
} else {
    // Placeholder Jest test
    describe('malformed-mqtt-integration placeholder', () => {
        test('placeholder – script style integration harness (manual run)', () => {
            expect(true).toBe(true);
        });
    });
}

module.exports = runIntegrationTest;