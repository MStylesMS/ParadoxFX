/**
 * Warning outcome test: playBackground with both volume and adjustVolume should produce warning outcome
 * including telemetry fields.
 */
const AudioZone = require('../../lib/zones/audio-zone');
jest.mock('../../lib/media/audio-manager');
jest.mock('../../lib/utils/logger');
const AudioManager = require('../../lib/media/audio-manager');

function makeMockAudioManager() {
    return {
        initialize: jest.fn().mockResolvedValue(),
        playBackgroundMusic: jest.fn().mockResolvedValue({ success: true }),
        setBackgroundMusicVolume: jest.fn().mockResolvedValue(true),
        pauseBackgroundMusic: jest.fn(),
        resumeBackgroundMusic: jest.fn(),
        stopBackgroundMusic: jest.fn(),
        fadeBackgroundMusic: jest.fn(),
        playSpeech: jest.fn().mockResolvedValue({ success: true }),
        clearSpeechQueue: jest.fn().mockResolvedValue(),
        fadeSpeech: jest.fn(),
        skipSpeech: jest.fn(),
        pauseSpeech: jest.fn(),
        resumeSpeech: jest.fn(),
        playSoundEffect: jest.fn().mockResolvedValue({ success: true }),
        checkAndRestartProcesses: jest.fn().mockResolvedValue(true)
    };
}

function makeMockMqtt() { return { publish: jest.fn() }; }
function stubValidate(zone) { zone._validateMediaFile = jest.fn().mockImplementation(p => ({ exists: true, path: '/tmp/' + p })); }

describe('playBackground warning outcome (volume + adjustVolume)', () => {
    beforeEach(() => { AudioManager.mockImplementation(makeMockAudioManager); });
    test('produces warning with telemetry', async () => {
        const mqtt = makeMockMqtt();
        const zone = new AudioZone({ name: 'azbg', baseTopic: 't/azbg', background_volume: 100, ducking_adjust: -40 }, mqtt, {});
        stubValidate(zone);
        await zone.initialize();
        await zone.handleCommand({ command: 'playBackground', file: 'bg.mp3', volume: 120, adjustVolume: -25 });
        const warningCall = mqtt.publish.mock.calls.find(c => /"command":"playBackground"/.test(JSON.stringify(c[1])) && /"outcome":"warning"/.test(JSON.stringify(c[1])));
        expect(warningCall).toBeTruthy();
        const payload = warningCall[1];
        expect(payload.parameters).toBeDefined();
        expect(payload.parameters.effective_volume).toBeDefined();
        expect(payload.parameters.pre_duck_volume).toBeDefined();
        expect(payload.parameters.ducked).toBeDefined();
        // Ensure warnings array or warning_type present
        expect(payload.warning_type || (payload.parameters.warnings && payload.parameters.warnings.length >= 0)).toBeTruthy();
    });
});
