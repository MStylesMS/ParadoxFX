const ScreenZone = require('../../lib/zones/screen-zone');
const AudioZone = require('../../lib/zones/audio-zone');

class StubMqttClient { constructor() { this.published = []; } publish(t, m) { this.published.push({ topic: t, message: m }); } }

function makeScreenConfig() { return { name: 'zone1', type: 'screen', baseTopic: 'paradox/zone1', volume: 80, maxVolume: 150, background_volume: 90, speech_volume: 110, effects_volume: 120, video_volume: 95, ducking_adjust: -35, mediaDir: '', mediaBasePath: '/opt/paradox/media' }; }
function makeAudioConfig() { return { name: 'audio1', type: 'audio', baseTopic: 'paradox/audio1', volume: 70, maxVolume: 140, background_volume: 70, speech_volume: 75, effects_volume: 80, ducking_adjust: -20, mediaDir: '', mediaBasePath: '/opt/paradox/media' }; }

describe('Flattened status schema (Phase 5)', () => {
    test('audio zone status shape', () => {
        const mqtt = new StubMqttClient();
        const zone = new AudioZone(makeAudioConfig(), mqtt, null);
        zone.publishStatus();
        const stateMsg = mqtt.published.find(p => p.topic === 'paradox/audio1/state');
        expect(stateMsg).toBeTruthy();
        const msg = stateMsg.message;
        expect(msg.background).toBeDefined();
        expect(msg.speech).toBeDefined();
        expect(msg.effects).toBeDefined();
        expect(msg.video).toBeUndefined();
        expect(msg.isDucked).toBe(false);
        expect(msg.background.volume).toBe(70);
        expect(msg.speech.volume).toBe(75);
        expect(msg.effects.volume).toBe(80);
    });
    test('screen zone status includes video and browser', () => {
        const mqtt = new StubMqttClient();
        const zone = new ScreenZone(makeScreenConfig(), mqtt, null);
        zone.publishStatus();
        const stateMsg = mqtt.published.find(p => p.topic === 'paradox/zone1/state');
        expect(stateMsg).toBeTruthy();
        const msg = stateMsg.message;
        expect(msg.video).toBeDefined();
        expect(msg.browser).toBeDefined();
        expect(msg.video.volume).toBe(95);
        expect(Object.prototype.hasOwnProperty.call(msg.video, 'queue_length')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(msg.video, 'next')).toBe(true);
        expect(msg.isDucked).toBe(false);
    });
});
