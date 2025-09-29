/**
 * Volume Resolver (Phase 2 - PR-VOLUME)
 *
 * Pure function style utilities to compute effective volume for a play request
 * adhering to the specification in docs/PR_VOLUME.md.
 *
 * Responsibilities:
 *  - Enforce precedence: absolute per-play volume > adjustVolume % > base
 *  - Apply ducking (background only, when duckActive && !skipDucking)
 *  - Clamp values to 0..maxVolume
 *  - Produce structured warnings for:
 *      * Both volume & adjustVolume supplied
 *      * Clamping of absolute or adjusted volumes
 *  - Return final integer volume (rounded) and metadata
 */

const { CLAMP_ABS_MIN, CLAMP_ABS_MAX, CLAMP_DUCK_MIN, CLAMP_DUCK_MAX, clamp } = require('./volume-model');

/**
 * Resolve effective volume for a single media play invocation.
 * @param {Object} opts
 * @param {('background'|'speech'|'effects'|'video')} opts.type Media type
 * @param {Object} opts.zoneModel Zone volume model: { baseVolumes, duckingAdjust, maxVolume }
 * @param {Object} [opts.commandParams] Incoming command parameters (may include volume, adjustVolume, skipDucking)
 * @param {boolean} [opts.duckActive] Whether ducking currently active (any trigger)
 * @returns {{
 *   final: number,            // Final integer volume applied
 *   preDuck: number,          // Volume before ducking
 *   ducked: boolean,          // Whether ducking applied
 *   warnings: Array<Object>,  // Warning objects (message, code)
 *   used: { base: number, volume?: number, adjustVolume?: number, duckingAdjust?: number },
 *   clamped: boolean          // True if any clamping occurred
 * }}
 */
function resolve({ type, zoneModel, commandParams = {}, duckActive = false }) {
  if (!zoneModel || !zoneModel.baseVolumes) {
    throw new Error('Invalid zone model: missing baseVolumes');
  }
  const warnings = [];
  const maxVolume = typeof zoneModel.maxVolume === 'number' ? Math.min(CLAMP_ABS_MAX, Math.max(CLAMP_ABS_MIN, zoneModel.maxVolume)) : 200;
  const base = zoneModel.baseVolumes[type] !== undefined ? zoneModel.baseVolumes[type] : 100;

  let preDuck; // effective before ducking
  let clamped = false;
  const used = { base };
  const { volume, adjustVolume, skipDucking } = commandParams;

  if (volume !== undefined && adjustVolume !== undefined) {
    warnings.push({ code: 'both_volume_and_adjust', message: 'Both volume and adjustVolume supplied; using volume and ignoring adjustVolume.' });
  }

  if (volume !== undefined) {
    let abs = parseInt(volume, 10);
    if (isNaN(abs)) abs = base;
    if (abs < 0) { clamped = true; warnings.push({ code: 'clamp_abs_low', message: `Requested volume ${abs} < 0; clamped to 0.` }); abs = 0; }
    if (abs > maxVolume) { clamped = true; warnings.push({ code: 'clamp_abs_high', message: `Requested volume ${abs} > max ${maxVolume}; clamped.` }); abs = maxVolume; }
    preDuck = abs;
    used.volume = abs;
  } else if (adjustVolume !== undefined) {
    let pct = parseFloat(adjustVolume);
    if (isNaN(pct)) pct = 0;
    if (pct < -100) { warnings.push({ code: 'clamp_adjust_low', message: `adjustVolume ${pct} < -100; clamped to -100.` }); pct = -100; clamped = true; }
    if (pct > 100) { warnings.push({ code: 'clamp_adjust_high', message: `adjustVolume ${pct} > 100; clamped to 100.` }); pct = 100; clamped = true; }
    let adjusted = base * (1 + pct / 100);
    if (adjusted < 0) { warnings.push({ code: 'clamp_adjust_result_low', message: `Adjusted volume ${adjusted} < 0; clamped to 0.` }); adjusted = 0; clamped = true; }
    if (adjusted > maxVolume) { warnings.push({ code: 'clamp_adjust_result_high', message: `Adjusted volume ${adjusted} > max ${maxVolume}; clamped.` }); adjusted = maxVolume; clamped = true; }
    preDuck = adjusted;
    used.adjustVolume = pct;
  } else {
    // base direct
    let b = base;
    if (b > maxVolume) { warnings.push({ code: 'clamp_base_high', message: `Base volume ${b} > max ${maxVolume}; clamped.` }); b = maxVolume; clamped = true; }
    preDuck = b;
  }

  // Ducking (only for background)
  let final = preDuck;
  let ducked = false;
  if (type === 'background' && duckActive && !skipDucking) {
    ducked = true;
    let adj = parseInt(zoneModel.duckingAdjust, 10);
    if (isNaN(adj)) adj = 0;
    if (adj > 0) adj = 0; // safety
    if (adj < -100) adj = -100;
    used.duckingAdjust = adj;
    let duckedVal = preDuck * (1 + adj / 100);
    if (duckedVal < 0) { warnings.push({ code: 'clamp_duck_low', message: `Ducked volume ${duckedVal} < 0; clamped to 0.` }); duckedVal = 0; clamped = true; }
    if (duckedVal > maxVolume) { warnings.push({ code: 'clamp_duck_high', message: `Ducked volume ${duckedVal} > max ${maxVolume}; clamped.` }); duckedVal = maxVolume; clamped = true; }
    final = duckedVal;
  }

  return {
    final: Math.round(final),
    preDuck: Math.round(preDuck),
    ducked,
    warnings,
    used,
    clamped
  };
}

module.exports = { resolve };
