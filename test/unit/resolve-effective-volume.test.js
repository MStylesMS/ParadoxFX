const { resolveEffectiveVolume } = require('../../lib/audio/resolve-effective-volume');

function makeZoneModel(overrides = {}) {
    return Object.assign({
        baseVolumes: { background: 90, speech: 80, effects: 70, video: 60 },
        duckingAdjust: -40,
        maxVolume: 150
    }, overrides);
}

describe('resolveEffectiveVolume helper', () => {
    test('uses base volume when no overrides', () => {
        const zm = makeZoneModel();
        const r = resolveEffectiveVolume({ type: 'speech', zoneModel: zm });
        expect(r.final).toBe(80);
        expect(r.meta.used.base).toBe(80);
    });

    test('absolute volume precedence over adjust', () => {
        const zm = makeZoneModel();
        const r = resolveEffectiveVolume({ type: 'speech', zoneModel: zm, command: { volume: 120, adjustVolume: -50 } });
        expect(r.final).toBe(120);
        const bothWarn = r.warnings.find(w => w.code === 'both_volume_and_adjust');
        expect(bothWarn).toBeTruthy();
    });

    test('adjust volume percentage applied & clamped', () => {
        const zm = makeZoneModel();
        const r = resolveEffectiveVolume({ type: 'speech', zoneModel: zm, command: { adjustVolume: 50 } });
        // base 80 * 1.5 = 120
        expect(r.final).toBe(120);
        expect(r.meta.used.adjustVolume).toBe(50);
    });

    test('ducking applies to background only when active', () => {
        const zm = makeZoneModel();
        const r = resolveEffectiveVolume({ type: 'background', zoneModel: zm, duckActive: true });
        // base 90 with -40% duck => 54
        expect(r.final).toBe(54);
        expect(r.ducked).toBe(true);
    });

    test('skipDucking prevents ducking', () => {
        const zm = makeZoneModel();
        const r = resolveEffectiveVolume({ type: 'background', zoneModel: zm, duckActive: true, command: { skipDucking: true } });
        expect(r.final).toBe(90);
        expect(r.ducked).toBe(false);
    });

    test('non-background not ducked even if active', () => {
        const zm = makeZoneModel();
        const r = resolveEffectiveVolume({ type: 'speech', zoneModel: zm, duckActive: true });
        expect(r.final).toBe(80);
        expect(r.ducked).toBe(false);
    });

    test('clamps absolute volume to maxVolume', () => {
        const zm = makeZoneModel({ maxVolume: 100 });
        const r = resolveEffectiveVolume({ type: 'speech', zoneModel: zm, command: { volume: 140 } });
        expect(r.final).toBe(100);
        const w = r.warnings.find(w => w.code === 'clamp_abs_high');
        expect(w).toBeTruthy();
    });
});
