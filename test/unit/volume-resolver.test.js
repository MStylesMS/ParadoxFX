/**
 * Unit tests for Volume Resolver (PR-VOLUME Phase 2)
 */

const { resolve } = require('../../lib/audio/volume-resolver');

function model(overrides = {}) {
    return {
        baseVolumes: { background: 90, speech: 110, effects: 120, video: 95 },
        duckingAdjust: -40,
        maxVolume: 170,
        ...overrides
    };
}

describe('volume-resolver', () => {
    test('uses absolute volume overriding adjust/base', () => {
        const r = resolve({ type: 'speech', zoneModel: model(), commandParams: { volume: 160, adjustVolume: -50 } });
        expect(r.final).toBe(160); // within max 170
        const bothWarn = r.warnings.find(w => w.code === 'both_volume_and_adjust');
        expect(bothWarn).toBeTruthy();
    });

    test('clamps absolute volume above max', () => {
        const r = resolve({ type: 'effects', zoneModel: model(), commandParams: { volume: 500 } });
        expect(r.final).toBe(170); // clamped to max
        expect(r.warnings.some(w => w.code === 'clamp_abs_high')).toBe(true);
    });

    test('adjustVolume percentage increase capped by max', () => {
        const r = resolve({ type: 'speech', zoneModel: model(), commandParams: { adjustVolume: 100 } });
        // base speech 110 * (1+1) = 220 -> clamp 170
        expect(r.final).toBe(170);
        expect(r.warnings.some(w => w.code === 'clamp_adjust_result_high')).toBe(true);
    });

    test('adjustVolume negative reduces volume, clamps at 0', () => {
        const r = resolve({ type: 'speech', zoneModel: model(), commandParams: { adjustVolume: -99 } });
        // 110 * 0.01 = 1.1 -> round => 1
        expect(r.final).toBe(1);
    });

    test('background ducking applies when active', () => {
        const r = resolve({ type: 'background', zoneModel: model(), commandParams: {}, duckActive: true });
        // base background 90 * (1 - 0.40) = 54
        expect(r.final).toBe(54);
        expect(r.ducked).toBe(true);
    });

    test('skipDucking overrides active duck', () => {
        const r = resolve({ type: 'background', zoneModel: model(), commandParams: { skipDucking: true }, duckActive: true });
        expect(r.final).toBe(90);
        expect(r.ducked).toBe(false);
    });

    test('invalid adjustVolume clamps and warns', () => {
        const r = resolve({ type: 'speech', zoneModel: model(), commandParams: { adjustVolume: 999 } });
        expect(r.final).toBe(170);
        expect(r.warnings.some(w => w.code === 'clamp_adjust_high')).toBe(true);
    });

    test('invalid negative adjustVolume below -100 clamps', () => {
        const r = resolve({ type: 'speech', zoneModel: model(), commandParams: { adjustVolume: -150 } });
        expect(r.final).toBe(0);
        expect(r.warnings.some(w => w.code === 'clamp_adjust_low')).toBe(true);
    });

    test('background base above max clamps with warning', () => {
        const m = model({ baseVolumes: { background: 500, speech: 110, effects: 120, video: 95 } });
        const r = resolve({ type: 'background', zoneModel: m, commandParams: {} });
        expect(r.final).toBe(170);
        expect(r.warnings.some(w => w.code === 'clamp_base_high')).toBe(true);
    });

    test('ducking cannot raise volume (positive adjust ignored to 0)', () => {
        const m = model({ duckingAdjust: 15 });
        const r = resolve({ type: 'background', zoneModel: m, commandParams: {}, duckActive: true });
        // duckingAdjust positive coerced to 0 => unchanged base 90
        expect(r.final).toBe(90);
        expect(r.ducked).toBe(true); // considered ducked though no change
    });
});
