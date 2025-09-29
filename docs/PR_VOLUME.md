# PR: Unified Volume & Ducking Model

## Status
Draft / Proposal (Pre-implementation)

Implementation Branch: `PR-VOLUME` (initial commit: adds plan steps 6 & 7). All subsequent implementation commits will reference this doc with `PR-VOLUME:` prefix in commit messages for traceability.

## Goal
Replace the current ad-hoc and inconsistent volume & ducking handling with a clear, predictable, easily testable model that:
- Uses absolute base volumes (0–200) with a zone-level max clamp.
- Uses per‑play transient adjustments (percentage) without affecting persisted zone state.
- Applies a single ducking adjustment (percentage reduction) that only affects background audio while speech or video is active (video does NOT get ducked itself).
- Publishes effective volumes per media type in zone state.
- Eliminates legacy negative ducking semantics and multi-layer hidden scaling.

## Design Summary
| Concept | Type / Range | Scope | Notes |
|--------|--------------|-------|-------|
| Base media volume (background/speech/effects/video) | Absolute 0–200 | Per zone, per type | Defaults: 100 if omitted. Parsed from INI kebab_case (e.g., `background_volume`). |
| max_volume | Absolute 0–200 | Per zone (fallback to global) | Global default 200. Warn if <50 or >150 at startup. Immutable at runtime. |
| Ducking (ducking_adjust) | Percentage -100% .. 0% | Per zone (fallback to global) | Applies only to background audio while any ducking trigger active. |
| adjustVolume (per play) | Percentage -100% .. +100% | Command-scoped | Transient; applied before ducking; not persisted. |
| volume (per play) | Absolute 0–200 | Command-scoped | Overrides base & ignore adjustVolume if both present (warn). |
| setVolume command | Absolute 0–200 | Runtime persistent (zone) | Updates base volume for specified type (background/speech/effects/video); clamped; success+warning if clamped. |
| setDuckingAdjustment command | Percentage -100% .. 0% | Runtime persistent (zone) | Updates zone ducking_adjust (only affects future duck episodes). |
| Duck trigger sources | Events | speech, video | Starting speech or video increments active duck counter; ending decrements; duck active if counter > 0. |
| Effective volume in state | Absolute 0–200 | Published in zone status | Per type; includes transient play adjust & duck if applicable at publish time. |

## INI Configuration (kebab_case)
Global (optional):
```
[global]
max_volume = 180          ; optional (warn if >150 or <50)
ducking_adjust = -40      ; optional (default 0 -> no reduction)
```
Per Zone (example audio + screen hybrid):
```
[audio:zone1]
background_volume = 90
speech_volume = 110
 effects_volume = 120
 max_volume = 170
 ducking_adjust = -35

[screen:main]
 background_volume = 85        ; screen can host background audio too
 speech_volume = 105           ; speech overlaid on video
 effects_volume = 115          ; UI / interface effects
 video_volume = 95
 max_volume = 180
 ducking_adjust = -40          ; overrides global (if present)
```
Defaults if a zone omits a field:
- `*_volume` → 100
- `max_volume` → global `max_volume` or 200
- `ducking_adjust` → global `ducking_adjust` or 0

## Play Command Payload Examples
1. Absolute override:
```
{"command":"playBackground","file":"loop.mp3","volume":140}
```
2. Percentage transient adjust (reduce by 30%):
```
{"command":"playSpeech","file":"hint.mp3","adjustVolume":-30}
```
3. Skip ducking for this speech:
```
{"command":"playSpeech","file":"hint.mp3","skipDucking":true}
```
4. Attempting both (volume wins, warning logged/published):
```
{"command":"playSpeech","file":"hint.mp3","volume":120,"adjustVolume":-25}
```

## Runtime Commands
1. Set persistent per-type volume:
```
{"command":"setVolume","type":"speech","volume":80}
```
2. Set ducking adjustment:
```
{"command":"setDuckingAdjustment","adjustValue":-45}
```
(Clamped to -100..0; success+warning outcome if clamped.)

## Validation & Clamping Rules
| Field | Allowed | Clamp Behavior | Outcome |
|-------|---------|----------------|---------|
| Absolute volume (base or per-play) | 0..200 | To nearest limit | success + warning if clamped |
| adjustVolume | -100..+100 (%) | To nearest limit | success + warning if clamped |
| ducking_adjust | -100..0 (%) | To nearest limit | success + warning if clamped |

Max volume warning on startup if zone `max_volume`:<50 or >150 (still allowed).

## Effective Volume Resolution
Per play invocation for type T:
```
base = zone.baseVolumes[T]  (default 100)   
if command.volume present:
    effectivePreDuck = clamp(command.volume, 0, maxVolume)
    if adjustVolume also present -> warn (ignore adjustVolume)
else if command.adjustVolume present:
    effectivePreDuck = clamp(base * (1 + adjustVolume/100), 0, maxVolume)
else:
    effectivePreDuck = clamp(base, 0, maxVolume)

if (T === 'background' && duckActive && !command.skipDucking):
    ducked = clamp(effectivePreDuck * (1 + duckingAdjust/100), 0, maxVolume)
else:
    ducked = effectivePreDuck

final = round(ducked)
```
`duckActive` = (activeDuckCounter > 0). Speech & video start increment; finish decrement. The duck level does not stack—any active triggers apply the single configured ducking percentage.

## State Publication Format (Draft)
Augment existing zone state payload `current_state`:
```
"current_state": {
   "volumes": {
      "background": { "volume": 90, "ducked": true },
      "speech": { "volume": 110 },
      "effects": { "volume": 120 },
      "video": { "volume": 95 }
   },
   "ducking": { "active": true, "adjust": -35, "active_triggers": 2 },
  ... existing fields ...
}
```
Here, each `volume` is the configured *base* volume for that type. If background is currently ducked, `ducked: true` is present. (Effective runtime volume = base with adjustments + ducking applied internally; we expose base for clarity and can add `effective` later if needed.)

## Outcome & Warning Semantics
- Clamp events publish `outcome: success` with an added warning message (standardized outcome model) and a /warnings topic payload.
- Invalid combos (both `volume` and `adjustVolume`) produce `outcome: warning` (command still executes using `volume`).
- Out-of-range values auto-correct, included in message: e.g. `Requested speech volume 240 capped to max 170`.

## Removal of Legacy Behavior
- Remove legacy negative duck calculations & multi-layer volume inference.
- Remove per-play reliance on background volume as fallback for speech/effects (each type uses its own base volume).
- Remove unused or redundant volume fields in `AudioManager` that conflict (map to new model internally during transition).
- Reject legacy duck parameters (negative integers pretending to be dB) with a warning and ignore.

## Implementation Plan (Phase Breakdown)
1. Data Model & Loader:
   - Extend config loader to parse `*_volume`, `ducking_adjust`, `max_volume` (kebab_case) into camelCase.
   - Initialize zone volume model object.
2. Resolver & Utility:
   - Implement `volumeResolver.resolve(type, commandParams, context)`.
3. Duck Lifecycle:
   - Add active duck counter & hooks in `playSpeech` / `playVideo` start & cleanup on completion.
4. Command Handlers:
   - Add `setVolume` & `setDuckingAdjustment` with validation + standardized outcomes.
5. State Publishing:
   - Extend zone status to include `current_state.volumes` and `current_state.ducking` as described.
6. Config INI Samples Update:
   - Update `config/*.ini` examples to adopt new per-type `*_volume` keys; remove deprecated keys (e.g., `ducking_volume`, legacy single `volume`).
   - Ensure `max_volume` & `ducking_adjust` usage consistent; add comments for ranges and clamping semantics.
7. Documentation Updates:
   - Propagate model changes to `README.md`, `docs/MQTT_API.md`, `README_FULL.md`, and `docs/INI_Config.md` (replace legacy volume/ducking sections, add new command examples `setVolume`, `setDuckingAdjustment`).
   - Add migration notes (legacy keys still read? or warn + ignore) and cross-link to this PR doc.
8. MPV Integration:
   - Centralize volume application into one helper for background, and per-invocation for others.
9. Tests:
   - Unit tests for resolver edge cases, clamping, precedence, duck activation stack.
10. Cleanup:
   - Remove legacy code and unused config keys, strip direct volume references in favor of resolver.

## Edge Cases Covered
| Scenario | Expected Result |
|----------|-----------------|
| playSpeech with volume 220, zone max 170 | Clamped to 170, success + warning |
| playEffect with adjustVolume -120 | Clamped to -100% (silence), success + warning |
| playSpeech with volume 120 & adjustVolume -30 | Use 120, outcome warning (adjust ignored) |
| Two overlapping speeches while video also playing | active_triggers increments/decrements; background ducked once |
| Ducking adjust -100 | Background becomes 0 while ducked |
| adjustVolume +100 | Double the base (capped by max volume) |

## Open Questions (Closed by User Responses)
All prior ambiguities resolved; no further open questions.

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Regression in existing tests | Introduce new tests first; refactor tests to use new model; update fixtures. |
| Misinterpretation of adjustVolume sign | Explicit range validation + clear error messages. |
| Over-complication of state payload | Keep schema stable; only add nested volumes object. |

## Next Steps
Upon approval:
1. Implement volume model & resolver.
2. Add commands + tests.
3. Refactor zones & audio manager.
4. Update documentation (README sections referencing volume).
5. Remove deprecated logic.

---
**Reviewer Checklist**
- [ ] Structure & formulas match expectations
- [ ] Command semantics clear
- [ ] State schema acceptable
- [ ] Clamp & warning behavior appropriate
- [ ] Migration / removal plan acceptable

Please provide feedback or approval to proceed with implementation.
