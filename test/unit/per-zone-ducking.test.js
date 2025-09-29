/**
 * Per-Zone Ducking System Tests
 * Tests the new enhanced ducking functionality for speech and video
 */

const BaseZone = require('../../lib/zones/base-zone');
const AudioZone = require('../../lib/zones/audio-zone');

// Mock dependencies
jest.mock('../../lib/media/audio-manager');
jest.mock('../../lib/utils/logger');
jest.mock('../../lib/utils/utils');

class TestZone extends BaseZone {
    constructor(config, mqttClient) {
        super(config, mqttClient);
        this.backgroundVolume = 80;
    }

    async initialize() {
        this.isInitialized = true;
    }

    async handleCommand(command) {
        // Mock implementation
    }

    async shutdown() {
        this.isInitialized = false;
    }

    _setBackgroundVolume(volume) {
        this.backgroundVolume = volume;
    }

    _getCurrentBackgroundVolume() {
        return this.backgroundVolume;
    }
}

describe('Per-Zone Ducking System', () => {
    let testZone;
    let mockConfig;
    let mockMqttClient;

    beforeEach(() => {
        mockConfig = {
            name: 'test-zone',
            type: 'audio',
            volume: 80
        };
        mockMqttClient = {
            publish: jest.fn()
        };
        testZone = new TestZone(mockConfig, mockMqttClient);
    });

    describe('Ducking Registry', () => {
        test('should initialize with empty ducking registry', () => {
            expect(testZone._activeDucks.size).toBe(0);
            expect(testZone._baseBackgroundVolume).toBe(null);
        });

        test('should apply single ducking correctly', () => {
            testZone._applyDucking('speech-1', -30);

            expect(testZone._activeDucks.size).toBe(1);
            expect(testZone._activeDucks.get('speech-1')).toBe(-30);
            expect(testZone._baseBackgroundVolume).toBe(80);
            expect(testZone.backgroundVolume).toBe(50); // 80 + (-30) = 50
        });

        test('should handle multiple overlapping duckers', () => {
            // Apply first ducker
            testZone._applyDucking('speech-1', -20);
            expect(testZone.backgroundVolume).toBe(60); // 80 + (-20) = 60

            // Apply second ducker with higher level (more negative)
            testZone._applyDucking('video-1', -40);
            expect(testZone.backgroundVolume).toBe(40); // 80 + (-40) = 40 (uses most negative value)

            // Apply third ducker with lower level (less negative)
            testZone._applyDucking('speech-2', -10);
            expect(testZone.backgroundVolume).toBe(40); // Still using -40 (most negative)

            expect(testZone._activeDucks.size).toBe(3);
        });

        test('should remove ducking correctly', () => {
            // Set up multiple duckers
            testZone._applyDucking('speech-1', -20);
            testZone._applyDucking('video-1', -40);
            testZone._applyDucking('speech-2', -10);

            // Remove the highest ducker (most negative)
            testZone._removeDucking('video-1');
            expect(testZone.backgroundVolume).toBe(60); // Now using -20 (next most negative)
            expect(testZone._activeDucks.size).toBe(2);

            // Remove another ducker
            testZone._removeDucking('speech-1');
            expect(testZone.backgroundVolume).toBe(70); // Now using -10
            expect(testZone._activeDucks.size).toBe(1);

            // Remove last ducker
            testZone._removeDucking('speech-2');
            expect(testZone.backgroundVolume).toBe(80); // Restored to original
            expect(testZone._activeDucks.size).toBe(0);
            expect(testZone._baseBackgroundVolume).toBe(null);
        });

        test('should handle removing non-existent ducker gracefully', () => {
            testZone._applyDucking('speech-1', -30);

            // Try to remove non-existent ducker
            testZone._removeDucking('non-existent');

            // Should not affect existing ducker
            expect(testZone._activeDucks.size).toBe(1);
            expect(testZone.backgroundVolume).toBe(50);
        });

        test('should validate ducking levels', () => {
            // Test positive values (should be ignored with warning)
            testZone._applyDucking('test-1', 20);
            expect(testZone._activeDucks.has('test-1')).toBe(false); // Positive values are ignored

            // Test valid negative value
            testZone._applyDucking('test-2', -30);
            expect(testZone._activeDucks.get('test-2')).toBe(-30);

            // Test very negative value (should be capped)
            testZone._applyDucking('test-3', -150);
            expect(testZone._activeDucks.get('test-3')).toBe(-100); // Capped at -100

            // Test invalid type (should use default)
            testZone._applyDucking('test-4', 'invalid');
            expect(testZone._activeDucks.get('test-4')).toBe(-26); // Default fallback

        });

        test('should handle edge cases', () => {
            // Test 0 ducking (should be ignored as positive)
            testZone._applyDucking('test-1', 0);
            expect(testZone.backgroundVolume).toBe(80); // No change (ignored)

            // Test maximum negative ducking
            testZone._applyDucking('test-2', -80);
            expect(testZone.backgroundVolume).toBe(0); // 80 + (-80) = 0 (complete silence)
        });
    });

    describe('Ducking Status', () => {
        test('should provide correct ducking status', () => {
            testZone._applyDucking('speech-1', -20);
            testZone._applyDucking('video-1', -40);

            const status = testZone._getDuckingStatus();
            expect(status.activeDucks).toEqual({
                'speech-1': -20,
                'video-1': -40
            });
            expect(status.duckCount).toBe(2);
            expect(status.baseVolume).toBe(80);
            expect(status.maxDuckLevel).toBe(-40); // Most negative value
        });

        test('should provide empty status when no ducking active', () => {
            const status = testZone._getDuckingStatus();
            expect(status.activeDucks).toEqual({});
            expect(status.duckCount).toBe(0);
            expect(status.baseVolume).toBe(null);
            expect(status.maxDuckLevel).toBe(0);
        });
    });

    describe('Complex Scenarios', () => {
        test('should handle rapid add/remove operations', () => {
            // Simulate rapid speech and video requests
            testZone._applyDucking('speech-1', -20);
            testZone._applyDucking('video-1', -50);
            testZone._removeDucking('speech-1');
            testZone._applyDucking('speech-2', -10);
            testZone._removeDucking('video-1');
            testZone._applyDucking('video-2', -30);

            expect(testZone._activeDucks.size).toBe(2);
            expect(testZone.backgroundVolume).toBe(50); // 80 + (-30) = 50 (uses most negative)
        });

        test('should maintain base volume correctly across operations', () => {
            const originalVolume = testZone.backgroundVolume;

            // Apply and remove ducking
            testZone._applyDucking('test-1', -20);
            expect(testZone._baseBackgroundVolume).toBe(originalVolume);

            testZone._applyDucking('test-2', -40);
            expect(testZone._baseBackgroundVolume).toBe(originalVolume);

            testZone._removeDucking('test-1');
            expect(testZone._baseBackgroundVolume).toBe(originalVolume);

            testZone._removeDucking('test-2');
            expect(testZone._baseBackgroundVolume).toBe(null);
            expect(testZone.backgroundVolume).toBe(originalVolume);
        });
    });
});

// AudioZone ducking integration tests removed: legacy _applyDucking path deprecated in Phase 8.