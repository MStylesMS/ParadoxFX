/**
 * Tests for Malformed MQTT Message Handling
 * 
 * Verifies that the application gracefully handles malformed MQTT messages
 * without crashing or terminating processes.
 */

const ZoneManager = require('../../lib/core/zone-manager');
const MqttClient = require('../../lib/core/mqtt-client');
const Logger = require('../../lib/utils/logger');

// Mock zone for testing
class MockZone {
    constructor(config) {
        this.config = config;
        this.logger = new Logger('MockZone');
        this.messages = [];
    }
    
    async initialize() {
        // Mock initialization
    }
    
    async handleCommand(command) {
        // Mock command handling that could throw errors
        if (command.Command === 'crashTest') {
            throw new Error('Simulated command error');
        }
        if (command.Command === 'timeoutTest') {
            return new Promise(() => {}); // Never resolves (timeout test)
        }
        if (command.Command === 'fileNotFound') {
            const error = new Error('File not found');
            error.code = 'ENOENT';
            throw error;
        }
    }
    
    publishMessage(type, data) {
        this.messages.push({ type, data, timestamp: new Date().toISOString() });
    }
    
    async shutdown() {
        // Mock shutdown
    }
}

describe('Malformed MQTT Message Handling', () => {
    let zoneManager;
    let mockMqttClient;
    let mockZone;
    let config;

    beforeEach(() => {
        // Create mock MQTT client
        mockMqttClient = {
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
            publish: jest.fn()
        };

        // Create test configuration
        config = {
            global: {
                logLevel: 'debug'
            },
            devices: {
                testZone: {
                    type: 'test',
                    name: 'testZone',
                    baseTopic: 'paradox/testZone'
                }
            }
        };

        // Create zone manager
        zoneManager = new ZoneManager(config, mockMqttClient);

        // Create and register mock zone
        mockZone = new MockZone(config.devices.testZone);
        zoneManager.zones.set('testZone', mockZone);
    });

    describe('JSON Parsing Errors', () => {
        test('should handle malformed JSON gracefully', async () => {
            const malformedJson = '{"command":"playSpeech","filePath":"/path/file.mp3"'; // Missing closing brace

            await zoneManager._handleZoneCommand('testZone', mockZone, malformedJson);

            // Should not throw error, should publish warning
            expect(mockZone.messages).toHaveLength(1);
            expect(mockZone.messages[0].type).toBe('warning');
            expect(mockZone.messages[0].data.message).toContain('Invalid JSON format');
        });

        test('should handle completely invalid JSON', async () => {
            const invalidJson = 'this is not json at all!!!';

            await zoneManager._handleZoneCommand('testZone', mockZone, invalidJson);

            expect(mockZone.messages).toHaveLength(1);
            expect(mockZone.messages[0].type).toBe('warning');
            expect(mockZone.messages[0].data.raw_message).toBe(invalidJson);
        });

        test('should handle empty message', async () => {
            await zoneManager._handleZoneCommand('testZone', mockZone, '');

            expect(mockZone.messages).toHaveLength(1);
            expect(mockZone.messages[0].type).toBe('warning');
        });

        test('should handle null message', async () => {
            await zoneManager._handleZoneCommand('testZone', mockZone, null);

            expect(mockZone.messages).toHaveLength(1);
            expect(mockZone.messages[0].type).toBe('warning');
        });
    });

    describe('Command Validation', () => {
        test('should reject commands without Command field', async () => {
            const invalidCommand = { filePath: '/path/file.mp3' };

            await zoneManager._handleZoneCommand('testZone', mockZone, invalidCommand);

            expect(mockZone.messages).toHaveLength(1);
            expect(mockZone.messages[0].type).toBe('warning');
            expect(mockZone.messages[0].data.validation_error).toContain('Command');
        });

        test('should reject commands with empty Command field', async () => {
            const invalidCommand = { Command: '', filePath: '/path/file.mp3' };

            await zoneManager._handleZoneCommand('testZone', mockZone, invalidCommand);

            expect(mockZone.messages).toHaveLength(1);
            expect(mockZone.messages[0].type).toBe('warning');
            expect(mockZone.messages[0].data.validation_error).toContain('empty');
        });

        test('should reject commands with invalid volume', async () => {
            const invalidCommand = { Command: 'playSpeech', volume: 'loud' };

            await zoneManager._handleZoneCommand('testZone', mockZone, invalidCommand);

            expect(mockZone.messages).toHaveLength(1);
            expect(mockZone.messages[0].type).toBe('warning');
            expect(mockZone.messages[0].data.validation_error).toContain('Volume');
        });

        test('should reject commands with volume out of range', async () => {
            const invalidCommand = { Command: 'playSpeech', volume: 200 };

            await zoneManager._handleZoneCommand('testZone', mockZone, invalidCommand);

            expect(mockZone.messages).toHaveLength(1);
            expect(mockZone.messages[0].type).toBe('warning');
            expect(mockZone.messages[0].data.validation_error).toContain('0 and 150');
        });
    });

    describe('Command Execution Errors', () => {
        test('should handle command execution errors gracefully', async () => {
            const command = { Command: 'crashTest' };

            await zoneManager._handleZoneCommand('testZone', mockZone, command);

            // Should publish event for received command and error for failed execution
            expect(mockZone.messages).toHaveLength(2);
            expect(mockZone.messages[0].type).toBe('events');
            expect(mockZone.messages[1].type).toBe('error');
            expect(mockZone.messages[1].data.message).toContain('Simulated command error');
        });

        test('should handle file not found errors', async () => {
            const command = { Command: 'fileNotFound' };

            await zoneManager._handleZoneCommand('testZone', mockZone, command);

            expect(mockZone.messages).toHaveLength(2);
            expect(mockZone.messages[1].type).toBe('error');
            expect(mockZone.messages[1].data.error_type).toBe('file_not_found');
        });

        test('should handle command timeouts', async () => {
            jest.setTimeout(35000); // Increase timeout for this test
            
            const command = { Command: 'timeoutTest' };

            await zoneManager._handleZoneCommand('testZone', mockZone, command);

            expect(mockZone.messages).toHaveLength(2);
            expect(mockZone.messages[1].type).toBe('error');
            expect(mockZone.messages[1].data.error_type).toBe('command_timeout');
        }, 35000);
    });

    describe('Edge Cases', () => {
        test('should handle mixed case Command field', async () => {
            const command = { command: 'validCommand' }; // lowercase

            await zoneManager._handleZoneCommand('testZone', mockZone, command);

            // Should work fine with lowercase 'command'
            expect(mockZone.messages).toHaveLength(1);
            expect(mockZone.messages[0].type).toBe('events');
        });

        test('should handle very large messages', async () => {
            const largeCommand = {
                Command: 'testCommand',
                data: 'x'.repeat(10000) // 10KB of data
            };

            await zoneManager._handleZoneCommand('testZone', mockZone, largeCommand);

            expect(mockZone.messages).toHaveLength(1);
            expect(mockZone.messages[0].type).toBe('events');
        });

        test('should handle commands with special characters', async () => {
            const specialCommand = {
                Command: 'test',
                filePath: '/path/with spaces/file&name[special].mp3'
            };

            await zoneManager._handleZoneCommand('testZone', mockZone, specialCommand);

            expect(mockZone.messages).toHaveLength(1);
            expect(mockZone.messages[0].type).toBe('events');
        });
    });

    describe('Command Validation Helper', () => {
        test('_validateCommand should return null for valid commands', () => {
            const validCommand = { Command: 'playSpeech', filePath: '/path/file.mp3', volume: 80 };
            const result = zoneManager._validateCommand(validCommand);
            expect(result).toBeNull();
        });

        test('_validateCommand should return error for invalid commands', () => {
            const invalidCommand = { notACommand: 'test' };
            
            const result = zoneManager._validateCommand(invalidCommand);
            
            expect(result).toContain('Command');
        });

        test('_validateCommand should handle null/undefined input', () => {
            expect(zoneManager._validateCommand(null)).toContain('object');
            expect(zoneManager._validateCommand(undefined)).toContain('object');
            expect(zoneManager._validateCommand('string')).toContain('object');
        });
    });
});