/**
 * Duck Lifecycle Manager (Phase 3 - PR-VOLUME)
 *
 * Tracks active ducking triggers (speech/video). The model is a simple counter:
 *  - addTrigger(id, kind) increments (kind for debugging/statistics only)
 *  - removeTrigger(id) decrements if present
 *  - active() returns boolean (count > 0)
 *  - snapshot() returns { active, count, kinds: {speech: n, video: n} }
 */
class DuckLifecycle {
    constructor() {
        this._triggers = new Map(); // id -> kind ('speech' | 'video' | other)
    }

    addTrigger(id, kind = 'speech') {
        if (!id) return;
        this._triggers.set(id, kind);
    }

    removeTrigger(id) {
        if (!id) return;
        this._triggers.delete(id);
    }

    clear() {
        this._triggers.clear();
    }

    count() {
        return this._triggers.size;
    }

    active() {
        return this.count() > 0;
    }

    snapshot() {
        const kinds = { speech: 0, video: 0, other: 0 };
        for (const kind of this._triggers.values()) {
            if (kind === 'speech') kinds.speech++;
            else if (kind === 'video') kinds.video++;
            else kinds.other++;
        }
        return { active: this.active(), count: this.count(), kinds };
    }
}

module.exports = DuckLifecycle;
