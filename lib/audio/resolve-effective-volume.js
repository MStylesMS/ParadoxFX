/**
 * resolveEffectiveVolume helper
 * Thin wrapper over existing volume-resolver.resolve so call sites
 * (playBackground/playSpeech/playVideo/etc.) can use a concise API
 * without importing internal clamp constants.
 *
 * This will become the single integration point in Phase 8 when
 * playback paths are refactored to apply the unified model at runtime.
 */
const { resolve } = require('./volume-resolver');

/**
 * Simplified helper.
 * @param {Object} params
 * @param {'background'|'speech'|'effects'|'video'} params.type
 * @param {Object} params.zoneModel  // zone.volumeModel
 * @param {Object} [params.command]  // raw command payload (volume, adjustVolume, skipDucking)
 * @param {boolean} [params.duckActive]
 * @returns {{ final:number, preDuck:number, ducked:boolean, warnings:Array, meta:Object }}
 */
function resolveEffectiveVolume({ type, zoneModel, command = {}, duckActive = false }) {
    const { final, preDuck, ducked, warnings, used, clamped } = resolve({
        type,
        zoneModel,
        commandParams: command,
        duckActive
    });
    return { final, preDuck, ducked, warnings, meta: { used, clamped } };
}

module.exports = { resolveEffectiveVolume };
