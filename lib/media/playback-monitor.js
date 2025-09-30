/**
 * PlaybackMonitor
 * Lightweight timer-based playback completion monitor with pause/resume & interrupt support.
 *
 * This utility estimates natural completion based on an expected duration. When a duration is
 * not available, callers may choose to fall back to another mechanism (e.g., MPV property observer)
 * and skip using this monitor. For Phase 1 we focus on speech where duration is usually available.
 */
class PlaybackMonitor {
    /**
     * @param {Object} opts
     * @param {number} opts.expectedDurationMs - Expected media duration in ms (may be approximate)
     * @param {Function} opts.onComplete - Called exactly once on natural completion
     * @param {Function} [opts.onInterrupt] - Called if interrupted (manual stop/skip)
     * @param {Function} [opts.getPaused] - Optional function returning boolean paused state (poll check before firing)
     * @param {number} [opts.safetyMs=120] - Safety window subtracted from expected duration before final check
     */
    constructor({ expectedDurationMs, onComplete, onInterrupt, safetyMs = 120 }) {
        this.expectedDurationMs = typeof expectedDurationMs === 'number' && expectedDurationMs > 0 ? expectedDurationMs : null;
        this.onComplete = typeof onComplete === 'function' ? onComplete : () => { };
        this.onInterrupt = typeof onInterrupt === 'function' ? onInterrupt : () => { };
        this.safetyMs = safetyMs;
        this._timer = null;
        this._finalTimer = null;
        this._startedAt = null;
        this._pausedAt = null;
        this._accumulatedPause = 0;
        this._isPaused = false;
        this._interrupted = false;
        this._completed = false;
    }

    start() {
        if (this._startedAt) return; // already started
        this._startedAt = Date.now();
        if (!this.expectedDurationMs) return; // Nothing to schedule (caller will manage alternative path)
        // Primary timer triggers near end (minus safety window) then schedules a short validation before final completion
        const primaryMs = Math.max(0, this.expectedDurationMs - this.safetyMs);
        this._timer = setTimeout(() => this._enterValidationWindow(), primaryMs);
    }

    _enterValidationWindow() {
        if (this._interrupted || this._completed) return;
        // If paused, defer until resumed
        if (this._isPaused) {
            // Poll every 200ms until unpaused or interrupted
            this._finalTimer = setTimeout(() => this._enterValidationWindow(), 200);
            return;
        }
        // Short validation delay (safetyMs) then complete
        this._finalTimer = setTimeout(() => this._complete(), this.safetyMs);
    }

    pause() {
        if (this._interrupted || this._completed) return;
        if (this._pausedAt) return; // already paused
        this._pausedAt = Date.now();
        this._isPaused = true;
        // Clear active timers
        if (this._timer) { clearTimeout(this._timer); this._timer = null; }
        if (this._finalTimer) { clearTimeout(this._finalTimer); this._finalTimer = null; }
    }

    resume() {
        if (this._interrupted || this._completed) return;
        if (!this._pausedAt) return; // not paused
        const pausedDelta = Date.now() - this._pausedAt;
        this._accumulatedPause += pausedDelta;
        this._pausedAt = null;
        this._isPaused = false;
        if (!this.expectedDurationMs) return; // nothing scheduled when unknown duration
        // Recompute remaining primary time (if we were still in primary phase) else validation window
        const elapsed = Date.now() - this._startedAt - this._accumulatedPause;
        const remainingPrimary = (this.expectedDurationMs - this.safetyMs) - elapsed;
        if (remainingPrimary > 0) {
            this._timer = setTimeout(() => this._enterValidationWindow(), remainingPrimary);
        } else {
            // Already within validation window
            this._enterValidationWindow();
        }
    }

    interrupt(reason = 'interrupted') {
        if (this._interrupted || this._completed) return;
        this._interrupted = true;
        if (this._timer) clearTimeout(this._timer);
        if (this._finalTimer) clearTimeout(this._finalTimer);
        this._timer = null; this._finalTimer = null;
        try { this.onInterrupt(reason); } catch (e) { /* noop */ }
    }

    _complete() {
        if (this._interrupted || this._completed) return;
        this._completed = true;
        if (this._timer) clearTimeout(this._timer);
        if (this._finalTimer) clearTimeout(this._finalTimer);
        this._timer = null; this._finalTimer = null;
        try { this.onComplete(); } catch (e) { /* noop */ }
    }
}

module.exports = PlaybackMonitor;
