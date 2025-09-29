/**
 * Volume Model Helper (Phase 1 - PR-VOLUME)
 *
 * Provides initialization & normalization utilities for the unified volume & ducking model.
 * This phase does NOT modify runtime playback logic; it just prepares structures.
 */

const DEFAULT_BASE = 100;
const CLAMP_ABS_MIN = 0;
const CLAMP_ABS_MAX = 200;
const CLAMP_DUCK_MIN = -100;
const CLAMP_DUCK_MAX = 0;

function clamp(n, min, max) {
    if (n === undefined || n === null || isNaN(n)) return undefined;
    return Math.min(max, Math.max(min, n));
}

function normalizeBaseVolumes(raw = {}) {
    return {
        background: clamp(raw.background, CLAMP_ABS_MIN, CLAMP_ABS_MAX) ?? DEFAULT_BASE,
        speech: clamp(raw.speech, CLAMP_ABS_MIN, CLAMP_ABS_MAX) ?? DEFAULT_BASE,
        effects: clamp(raw.effects, CLAMP_ABS_MIN, CLAMP_ABS_MAX) ?? DEFAULT_BASE,
        video: raw.video !== undefined ? (clamp(raw.video, CLAMP_ABS_MIN, CLAMP_ABS_MAX) ?? DEFAULT_BASE) : undefined
    };
}

function normalizeDuckingAdjust(val) {
    if (val === undefined || val === null || isNaN(val)) return 0;
    let v = parseInt(val, 10);
    if (v > CLAMP_DUCK_MAX) v = 0; // positive not allowed
    if (v < CLAMP_DUCK_MIN) v = CLAMP_DUCK_MIN;
    return v;
}

/**
 * Initialize a zone volume model object from processed device config
 */
function initZoneVolumeModel(deviceConfig) {
    return {
        baseVolumes: normalizeBaseVolumes(deviceConfig.baseVolumes),
        duckingAdjust: normalizeDuckingAdjust(deviceConfig.duckingAdjust),
        maxVolume: clamp(deviceConfig.maxVolume, CLAMP_ABS_MIN, CLAMP_ABS_MAX) ?? 150,
        phase: 1 // marker for later migrations
    };
}

module.exports = {
    normalizeBaseVolumes,
    normalizeDuckingAdjust,
    initZoneVolumeModel,
    clamp,
    DEFAULT_BASE,
    CLAMP_ABS_MIN,
    CLAMP_ABS_MAX,
    CLAMP_DUCK_MIN,
    CLAMP_DUCK_MAX
};
