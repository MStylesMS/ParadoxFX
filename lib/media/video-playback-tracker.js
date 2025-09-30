/**
 * VideoPlaybackTracker - pause-aware wall-clock tracker for a single video instance.
 * Simplified adaptation of PlaybackMonitor used for speech/background.
 */
class VideoPlaybackTracker {
    constructor({ targetDurationSec = null, onNaturalEnd, epsilonMs = 60 }) {
        this.targetDurationSec = typeof targetDurationSec === 'number' ? targetDurationSec : null;
        this.onNaturalEnd = onNaturalEnd;
        this.epsilonMs = epsilonMs;
        this.startedAt = null;
        this.accumulatedMs = 0;
        this._lastResumeAt = null;
        this._tick = null;
        this._intervalMs = 100; // coarse; natural end check every 100ms
        this._stopped = false;
    }

    start(now = Date.now()) {
        if (this.startedAt) return; // idempotent
        this.startedAt = now;
        this._lastResumeAt = now;
        this._schedule();
    }

    _schedule() {
        if (this._tick) clearInterval(this._tick);
        if (this._stopped) return;
        this._tick = setInterval(() => this._onInterval(), this._intervalMs);
    }

    _onInterval() {
        if (this._stopped) return;
        if (this._lastResumeAt) {
            const now = Date.now();
            this.accumulatedMs += (now - this._lastResumeAt);
            this._lastResumeAt = now;
        }
        if (this.targetDurationSec != null) {
            const remainingMs = this.targetDurationSec * 1000 - this.accumulatedMs;
            if (remainingMs <= this.epsilonMs) {
                // Natural completion
                this.stop();
                if (this.onNaturalEnd) {
                    try { this.onNaturalEnd(); } catch (_) { /* swallow */ }
                }
            }
        }
    }

    pause(now = Date.now()) {
        if (!this._lastResumeAt) return;
        this.accumulatedMs += (now - this._lastResumeAt);
        this._lastResumeAt = null;
    }

    resume(now = Date.now()) {
        if (this._lastResumeAt) return;
        this._lastResumeAt = now;
    }

    stop() {
        this._stopped = true;
        if (this._tick) clearInterval(this._tick);
        this._tick = null;
        if (this._lastResumeAt) {
            const now = Date.now();
            this.accumulatedMs += (now - this._lastResumeAt);
            this._lastResumeAt = null;
        }
    }

    getWatchedSeconds() {
        return this.accumulatedMs / 1000;
    }
}

module.exports = { VideoPlaybackTracker };
