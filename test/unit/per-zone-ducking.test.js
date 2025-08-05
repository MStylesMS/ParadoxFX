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
            testZone._applyDucking('speech-1', 50);
            
            expect(testZone._activeDucks.size).toBe(1);
            expect(testZone._activeDucks.get('speech-1')).toBe(50);
            expect(testZone._baseBackgroundVolume).toBe(80);
            expect(testZone.backgroundVolume).toBe(40); // 80 * (100-50) / 100
        });

        test('should handle multiple overlapping duckers', () => {
            // Apply first ducker
            testZone._applyDucking('speech-1', 30);
            expect(testZone.backgroundVolume).toBe(56); // 80 * (100-30) / 100

            // Apply second ducker with higher level
            testZone._applyDucking('video-1', 60);
            expect(testZone.backgroundVolume).toBe(32); // 80 * (100-60) / 100 (max level)

            // Apply third ducker with lower level
            testZone._applyDucking('speech-2', 20);
            expect(testZone.backgroundVolume).toBe(32); // Still using max level (60)

            expect(testZone._activeDucks.size).toBe(3);
        });

        test('should remove ducking correctly', () => {
            // Set up multiple duckers
            testZone._applyDucking('speech-1', 30);
            testZone._applyDucking('video-1', 60);
            testZone._applyDucking('speech-2', 20);

            // Remove the highest ducker
            testZone._removeDucking('video-1');
            expect(testZone.backgroundVolume).toBe(56); // Now using 30% (next highest)
            expect(testZone._activeDucks.size).toBe(2);

            // Remove another ducker
            testZone._removeDucking('speech-1');
            expect(testZone.backgroundVolume).toBe(64); // Now using 20%
            expect(testZone._activeDucks.size).toBe(1);

            // Remove last ducker
            testZone._removeDucking('speech-2');
            expect(testZone.backgroundVolume).toBe(80); // Restored to original
            expect(testZone._activeDucks.size).toBe(0);
            expect(testZone._baseBackgroundVolume).toBe(null);
        });

        test('should handle removing non-existent ducker gracefully', () => {
            testZone._applyDucking('speech-1', 50);
            
            // Try to remove non-existent ducker
            testZone._removeDucking('non-existent');
            
            // Should not affect existing ducker
            expect(testZone._activeDucks.size).toBe(1);
            expect(testZone.backgroundVolume).toBe(40);
        });

        test('should validate ducking levels', () => {
            // Test invalid levels
            testZone._applyDucking('test-1', -10);
            expect(testZone._activeDucks.get('test-1')).toBe(50); // Default fallback

            testZone._applyDucking('test-2', 150);
            expect(testZone._activeDucks.get('test-2')).toBe(50); // Default fallback

            testZone._applyDucking('test-3', 'invalid');
            expect(testZone._activeDucks.get('test-3')).toBe(50); // Default fallback
        });

        test('should handle edge cases', () => {
            // Test 0% ducking (no effect)
            testZone._applyDucking('test-1', 0);
            expect(testZone.backgroundVolume).toBe(80); // No change

            // Test 100% ducking (complete silence)
            testZone._applyDucking('test-2', 100);
            expect(testZone.backgroundVolume).toBe(0); // Complete silence
        });
    });

    describe('Ducking Status', () => {
        test('should provide correct ducking status', () => {
            testZone._applyDucking('speech-1', 30);
            testZone._applyDucking('video-1', 60);

            const status = testZone._getDuckingStatus();
            expect(status.activeDucks).toEqual({
                'speech-1': 30,
                'video-1': 60
            });
            expect(status.duckCount).toBe(2);
            expect(status.baseVolume).toBe(80);
            expect(status.maxDuckLevel).toBe(60);
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
            testZone._applyDucking('speech-1', 40);
            testZone._applyDucking('video-1', 70);
            testZone._removeDucking('speech-1');
            testZone._applyDucking('speech-2', 20);
            testZone._removeDucking('video-1');
            testZone._applyDucking('video-2', 50);

            expect(testZone._activeDucks.size).toBe(2);
            expect(testZone.backgroundVolume).toBe(40); // 80 * (100-50) / 100
        });

        test('should maintain base volume correctly across operations', () => {
            const originalVolume = testZone.backgroundVolume;

            // Apply and remove ducking
            testZone._applyDucking('test-1', 30);
            expect(testZone._baseBackgroundVolume).toBe(originalVolume);

            testZone._applyDucking('test-2', 60);
            expect(testZone._baseBackgroundVolume).toBe(originalVolume);

            testZone._removeDucking('test-1');
            expect(testZone._baseBackgroundVolume).toBe(originalVolume);

            testZone._removeDucking('test-2');
            expect(testZone._baseBackgroundVolume).toBe(null);
            expect(testZone.backgroundVolume).toBe(originalVolume);
        });
    });
});

describe('AudioZone Ducking Integration', () => {
    let audioZone;
    let mockConfig;
    let mockMqttClient;
    let mockZoneManager;
    let mockAudioManager;

    beforeEach(() => {
        // Mock AudioManager
        const AudioManager = require('../../lib/media/audio-manager');
        mockAudioManager = {
            initialize: jest.fn().mockResolvedValue(),
            playSpeech: jest.fn().mockResolvedValue({ success: true }),
            setBackgroundMusicVolume: jest.fn(),
            checkAndRestartProcesses: jest.fn().mockResolvedValue(true),
            shutdown: jest.fn().mockResolvedValue()
        };
        AudioManager.mockImplementation(() => mockAudioManager);

        mockConfig = {
            name: 'test-audio-zone',
            type: 'audio',
            volume: 80,
            mediaPath: '/test/media',
            duckingVolume: 30
        };
        mockMqttClient = {
            publish: jest.fn()
        };
        mockZoneManager = {};

        audioZone = new AudioZone(mockConfig, mockMqttClient, mockZoneManager);
        
        // Mock file validation
        audioZone._validateMediaFile = jest.fn().mockResolvedValue({
            exists: true,
            path: '/test/media/test.mp3'
        });
    });

    test('should apply ducking for speech commands', async () => {
        await audioZone.initialize();
        
        // Mock the ducking methods
        const applyDuckingSpy = jest.spyOn(audioZone, '_applyDucking');
        
        await audioZone._playSpeech('test.mp3', 80, 60);
        
        expect(applyDuckingSpy).toHaveBeenCalledWith(
            expect.stringMatching(/^speech-\d+-\w+$/),
            60
        );
    });

    test('should use default ducking level when not specified', async () => {
        await audioZone.initialize();
        
        const applyDuckingSpy = jest.spyOn(audioZone, '_applyDucking');
        
        await audioZone._playSpeech('test.mp3', 80); // No ducking parameter
        
        expect(applyDuckingSpy).toHaveBeenCalledWith(
            expect.stringMatching(/^speech-\d+-\w+$/),
            50 // Default level
        );
    });

    test('should not apply ducking when level is 0', async () => {
        await audioZone.initialize();
        
        const applyDuckingSpy = jest.spyOn(audioZone, '_applyDucking');
        
        await audioZone._playSpeech('test.mp3', 80, 0);
        
        expect(applyDuckingSpy).not.toHaveBeenCalled();
    });
});