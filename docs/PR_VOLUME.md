# PR: Unified Volume & Ducking Model

## Status
Phases 1–3 implemented (config parsing, resolver with tests, duck lifecycle triggers). Currently executing Phase 4 (runtime command handlers for updating base volumes & ducking adjustment) prior to state publication & integration.

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
1. (DONE) Data Model & Loader:
   - Config loader parses `*_volume`, `ducking_adjust`, `max_volume`; produces `baseVolumes`, `duckingAdjust`, `maxVolume`.
2. (DONE) Resolver & Utility:
   - `volume-resolver.js` pure function with unit tests (precedence, clamping, ducking, skipDucking).
3. (DONE) Duck Lifecycle:
   - `duck-lifecycle.js` + integration in `screen-zone` (video + speech triggers) and `base-zone` exposure (`getDuckActive`).
4. (IN PROGRESS) Command Handlers:
   - Implement runtime mutation commands for base volumes & ducking adjustment (details below). No legacy removal yet.
5. State Publishing:
   - Extend status with `current_state.volumes` + `current_state.ducking` (base + duck active snapshot). (Pending)
6. Config INI Samples Update:
   - Update examples to prefer per-type keys. (Pending)
7. Documentation Updates:
   - Update README / MQTT API / INI docs with new model & migration notes. (Pending)
8. MPV Integration:
   - Replace legacy per-duck absolute adjustments with resolver-driven percentage duck for background; remove double-duck risk. (Pending)
9. Tests Expansion:
   - Add command handler tests, state publication tests, duck lifecycle integration tests for overlapping triggers. (Partial – lifecycle unit test complete.)
10. Cleanup:
   - Remove legacy ducking registry and negative duck-level semantics once resolver path live. (Pending)

### Phase 4 Detailed Design (Command Handlers)

New/clarified MQTT commands (JSON payloads shown) to mutate persistent zone volume model:

1. Update a single base volume (per type):
```
{"command":"setVolume","type":"speech","volume":80}
```
2. Bulk update multiple base volumes (optional extension):
```
{"command":"setVolume","volumes":{"background":95,"video":90}}
```
3. Update ducking adjustment:
```
{"command":"setDuckingAdjustment","adjustValue":-45}
```

Validation rules:
| Field | Presence | Valid Range | Clamp | Warning Codes |
|-------|----------|-------------|-------|---------------|
| `type` | required if no `volumes` map | one of background|speech|effects|video | n/a | invalid_type |
| `volume` | required when single `type` provided | 0..200 | yes | clamp_base_volume_low / clamp_base_volume_high |
| `volumes` | optional object (bulk mode) | keys subset of allowed types | per value | clamp_base_volume_low / clamp_base_volume_high |
| `adjustValue` | required for setDuckingAdjustment | -100..0 | yes | clamp_ducking_adjust_low / clamp_ducking_adjust_high (positive -> coerced 0) |

Outcome semantics:
| Condition | outcome | Notes |
|-----------|---------|-------|
| Successful update w/o clamp | success | Event + status publish |
| Successful with clamp | success + warning | Warning published (code & original) |
| Invalid type / payload | failed | error_type: validation |

Event payload examples:
```
{ "command":"setVolume","outcome":"success","parameters":{"type":"speech","volume":80},"message":"speech base volume set to 80" }
{ "command":"setVolume","outcome":"success","parameters":{"type":"background","volume":260},"message":"background base volume clamped to 200 (requested 260)","warning_type":"clamp_base_volume_high" }
{ "command":"setDuckingAdjustment","outcome":"success","parameters":{"adjustValue":-45},"message":"ducking_adjust set to -45" }
```

Internal model updates:
```
zone.baseVolumes[type] = clampedVolume
zone.duckingAdjust = clampedAdjust
```
The legacy `currentState.volume` (single field) remains untouched for now (will eventually mirror background base or be deprecated).

Publishing:
After each successful mutation, immediately publish status so downstream controllers can reconcile.

Failure cases (examples):
```
{"command":"setVolume","type":"ambient","volume":90} -> outcome: failed, error_type: validation, message: "Invalid volume type 'ambient'"
{"command":"setDuckingAdjustment","adjustValue":10} -> coerce to 0 with warning (positive not allowed)
```

Concurrency / sequencing:
- Mutations are synchronous (single-threaded JS). No special locking required.
- Bulk updates apply all valid keys; invalid keys are reported individually in a combined warning array (aggregate outcome still success if at least one valid update occurred; failed if none valid).

Telemetry additions (optional future):
- Track last mutation timestamp per type for diagnostics.

Forward compatibility:
- If future per-zone presets or profiles are added, these commands can feed a higher-level preset manager; schema leaves space for `profile` field.


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
