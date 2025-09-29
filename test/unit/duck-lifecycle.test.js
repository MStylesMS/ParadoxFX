const DuckLifecycle = require('../../lib/audio/duck-lifecycle');

describe('DuckLifecycle', () => {
    test('add/remove trigger activates and deactivates', () => {
        const dl = new DuckLifecycle();
        expect(dl.active()).toBe(false);
        dl.addTrigger('id1', 'speech');
        expect(dl.active()).toBe(true);
        expect(dl.count()).toBe(1);
        dl.removeTrigger('id1');
        expect(dl.active()).toBe(false);
        expect(dl.count()).toBe(0);
    });

    test('multiple triggers different kinds', () => {
        const dl = new DuckLifecycle();
        dl.addTrigger('v1', 'video');
        dl.addTrigger('s1', 'speech');
        dl.addTrigger('s2', 'speech');
    expect(dl.count()).toBe(3);
        const snap = dl.snapshot();
            expect(snap.count).toBe(3);
        expect(snap.kinds.video).toBe(1);
        expect(snap.kinds.speech).toBe(2);
        dl.removeTrigger('s1');
        dl.removeTrigger('v1');
    expect(dl.count()).toBe(1);
    expect(dl.active()).toBe(true); // still one remaining
        dl.clear();
        expect(dl.active()).toBe(false);
        expect(dl.count()).toBe(0);
    });
});
