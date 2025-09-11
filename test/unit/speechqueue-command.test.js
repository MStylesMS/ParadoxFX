/**
 * Unit tests for speechQueue command functionality
 */

const AudioManager = require('../../lib/media/audio-manager');
const AudioZone = require('../../lib/zones/audio-zone');

describe('Speech Queue Command', () => {
    
    describe('AudioManager.getSpeechQueueStatus', () => {
        test('should return correct queue status structure', () => {
            const audioManager = new AudioManager({
                zoneId: 'test',
                audioDevice: 'auto'
            });

            const status = audioManager.getSpeechQueueStatus();

            expect(status).toHaveProperty('queue');
            expect(status).toHaveProperty('current');
            expect(status).toHaveProperty('length');
            expect(status).toHaveProperty('isProcessing');
            
            expect(Array.isArray(status.queue)).toBe(true);
            expect(typeof status.length).toBe('number');
            expect(typeof status.isProcessing).toBe('boolean');
        });

        test('should return empty queue status initially', () => {
            const audioManager = new AudioManager({
                zoneId: 'test',
                audioDevice: 'auto'
            });

            const status = audioManager.getSpeechQueueStatus();

            expect(status.queue).toEqual([]);
            expect(status.current).toBeNull();
            expect(status.length).toBe(0);
            expect(status.isProcessing).toBe(false);
        });
    });

    describe('AudioZone speechQueue command', () => {
        test('should include speechQueue in supported commands', () => {
            const mockMqttClient = {
                publish: jest.fn()
            };

            const audioZone = new AudioZone({
                name: 'test-zone',
                type: 'audio',
                baseTopic: 'test/zone',
                statusTopic: 'test/zone/status',
                audioDevice: 'auto'
            }, mockMqttClient);

            const supportedCommands = audioZone.getSupportedCommands();
            expect(supportedCommands).toContain('speechQueue');
        });

        test('should have _speechQueue method', () => {
            const mockMqttClient = {
                publish: jest.fn()
            };

            const audioZone = new AudioZone({
                name: 'test-zone',
                type: 'audio',
                baseTopic: 'test/zone',
                statusTopic: 'test/zone/status',
                audioDevice: 'auto'
            }, mockMqttClient);

            expect(typeof audioZone._speechQueue).toBe('function');
        });

        test('should publish speech queue status when _speechQueue is called', async () => {
            const mockMqttClient = {
                publish: jest.fn()
            };

            const audioZone = new AudioZone({
                name: 'test-zone',
                type: 'audio',
                baseTopic: 'test/zone',
                statusTopic: 'test/zone/status',
                audioDevice: 'auto'
            }, mockMqttClient);

            await audioZone._speechQueue();

            // Verify publishMessage was called
            expect(mockMqttClient.publish).toHaveBeenCalled();
            
            // Get the published message
            const publishCall = mockMqttClient.publish.mock.calls[0];
            const [topic, message] = publishCall;
            
            expect(topic).toBe('test/zone/info');
            expect(message).toHaveProperty('type', 'speech_queue');
            expect(message).toHaveProperty('queue');
            expect(message).toHaveProperty('length');
            expect(message).toHaveProperty('isProcessing');
            expect(Array.isArray(message.queue)).toBe(true);
        });
    });
});