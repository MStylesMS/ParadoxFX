const BaseZone = require('../../lib/zones/base-zone');
const ScreenZone = require('../../lib/zones/screen-zone');
const AudioZone = require('../../lib/zones/audio-zone');

// Simple stub MQTT client capturing published messages
class StubMqttClient {
    constructor() { this.published = []; }
    publish(topic, message) { this.published.push({ topic, message }); }
}

// Minimal config mocks
function makeScreenConfig() {
    return {
        name: 'zone1',
        type: 'screen',
        baseTopic: 'paradox/zone1',
        volume: 80,
        maxVolume: 150,
        background_volume: 90,
        speech_volume: 110,
        effects_volume: 120,
        video_volume: 95,
        ducking_adjust: -35,
        mediaDir: '',
        mediaBasePath: '/opt/paradox/media'
    };
}

function makeAudioConfig() {
    return {
        name: 'audio1',
        type: 'audio',
        baseTopic: 'paradox/audio1',
        volume: 70,
        maxVolume: 140,
        background_volume: 70,
        speech_volume: 75,
        effects_volume: 80,
        ducking_adjust: -20,
        mediaDir: '',
        mediaBasePath: '/opt/paradox/media'
    };
}

describe('Volume Command Handlers (Phase 4)', () => {
    test('screen zone single setVolume mutation success', async () => {
        const mqtt = new StubMqttClient();
        const cfg = makeScreenConfig();
        const zone = new ScreenZone(cfg, mqtt, null);
        // Directly call handler without full initialize (we only test mutation logic)
        await zone._handleSetVolumeModel({ type: 'speech', volume: 85 });
        expect(zone.volumeModel.baseVolumes.speech).toBe(85);
        const events = mqtt.published.filter(p => p.topic.endsWith('/events'));
        const ev = events.find(e => e.message.command === 'setVolume');
        expect(ev).toBeTruthy();
        expect(ev.message.outcome).toBe('success');
    });

    test('screen zone setVolume clamp high triggers warning', async () => {
        const mqtt = new StubMqttClient();
        const cfg = makeScreenConfig();
        cfg.maxVolume = 100; // tighter max
        const zone = new ScreenZone(cfg, mqtt, null);
        await zone._handleSetVolumeModel({ type: 'background', volume: 260 });
        expect(zone.volumeModel.baseVolumes.background).toBe(100);
        const events = mqtt.published.filter(p => p.topic.endsWith('/events'));
        const ev = events.find(e => e.message.command === 'setVolume');
        expect(ev.message.outcome).toBe('warning');
        expect(ev.message.warning_type).toBe('clamp_base_volume_high');
    });

    test('screen zone bulk setVolume partial success', async () => {
        const mqtt = new StubMqttClient();
        const cfg = makeScreenConfig();
        const zone = new ScreenZone(cfg, mqtt, null);
        // Seed video base (config-loader would normally populate this; direct constructor path leaves undefined)
        zone.volumeModel.baseVolumes.video = 95;
        await zone._handleSetVolumeModel({ volumes: { background: 95, foo: 80, video: 40 } });
        expect(zone.volumeModel.baseVolumes.background).toBe(95);
        expect(zone.volumeModel.baseVolumes.video).toBe(40);
        const ev = mqtt.published.find(p => p.topic.endsWith('/events') && p.message.command === 'setVolume');
        expect(ev.message.outcome).toBe('warning'); // partial success flagged as warning
    });

    test('audio zone invalid type failure', async () => {
        const mqtt = new StubMqttClient();
        const cfg = makeAudioConfig();
        const zone = new AudioZone(cfg, mqtt, null);
        await zone._handleSetVolumeModel({ type: 'video', volume: 50 }); // audio zone has no video base
        const ev = mqtt.published.find(p => p.topic.endsWith('/events') && p.message.command === 'setVolume');
        // Should be failed since video base volume is undefined for audio zone (initZoneVolumeModel sets video: undefined)
        expect(ev.message.outcome).toBe('failed');
    });

    test('setDuckingAdjustment clamp positive to 0 with warning', async () => {
        const mqtt = new StubMqttClient();
        const cfg = makeScreenConfig();
        const zone = new ScreenZone(cfg, mqtt, null);
        await zone._handleSetDuckingAdjustment({ adjustValue: 15 });
        expect(zone.volumeModel.duckingAdjust).toBe(0);
        const ev = mqtt.published.find(p => p.topic.endsWith('/events') && p.message.command === 'setDuckingAdjustment');
        expect(ev.message.outcome).toBe('warning');
        expect(ev.message.warning_type).toBe('clamp_ducking_adjust_high');
    });

    test('setDuckingAdjustment success no clamp', async () => {
        const mqtt = new StubMqttClient();
        const cfg = makeScreenConfig();
        const zone = new ScreenZone(cfg, mqtt, null);
        await zone._handleSetDuckingAdjustment({ adjustValue: -45 });
        expect(zone.volumeModel.duckingAdjust).toBe(-45);
        const ev = mqtt.published.find(p => p.topic.endsWith('/events') && p.message.command === 'setDuckingAdjustment');
        expect(ev.message.outcome).toBe('success');
    });
});
