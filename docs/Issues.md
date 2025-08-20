# ParadoxFX - Tracked Issues and Questions

This file captures items discovered while reconciling the functional specification with the implementation. Each entry is intentionally short and actionable.

## Issue 1 — Spec vs Implementation: MPV / audio process separation
Summary: The functional spec states a "single MPV instance per zone for images, video, and audio." The implementation uses a dedicated MPV process per zone for images/video and separate MPV instances spawned/managed by `AudioManager` for background music and speech.
Action: Decide whether the spec should be updated (recommended) or whether audio should be consolidated into the zone MPV (likely higher risk). Document the chosen architecture and update docs accordingly.

---

## Issue 2 — PulseAudio vs PipeWire support
Summary: The code currently uses PulseAudio-compatible tooling (pactl, `pulse/<name>` device names, combined-sink creation). The spec claims PipeWire (default) and PulseAudio support.
Action: Revisit whether the project will fully support PipeWire-native workflows (and if so, add an implementation plan), or explicitly state PulseAudio compatibility is required. Evaluate PipeWire mapping strategies (e.g., `pw-link`, `pw-cli`, or libpulse compatibility layers).

---

## Issue 3 — Audio vs Video queue semantics
Summary: Video uses an application-level FIFO with replacement rules; audio uses separate behaviors (speech queue with de-duplication and completion promises; effects are fire-and-forget). The spec describes a unified queueing model.
Action: Decide if queue semantics should be unified. If keeping them separate, document the rationale and expected behaviors clearly in the spec and API docs. If unifying, propose a design and roadmap.

---

## Issue 4 — Screen wake on audio / HDMI detection
Summary: The spec states audio commands that route to HDMI should wake displays. The implementation checks `shouldWakeForAudio()` in some audio paths but behavior is not universal across all audio entry points.
Action: Audit audio entry points and decide whether HDMI-audio-triggered wake should be guaranteed for all audio commands. If yes, implement consistent checks and document the behavior and required audio device naming conventions.

---

## Issue 5 — Runtime configuration hot-reload via MQTT
Summary: The spec mentions runtime configuration updates via MQTT. The code currently parses `pfx.ini` at startup and does not implement a full runtime hot-reload/apply mechanism.
Action: Decide whether runtime INI/MQTT-based config updates are required. If so, design a safe apply-and-rollback mechanism, list the keys that can be changed at runtime, and implement a config revalidation step.

---

## Issue 6 — Update tests (automated and manual)
Summary: The repository contains unit, integration, and manual tests; several docs and behavior changes mean tests may be out of date. Some tests reference old spec assumptions (queueing, MPV single-instance, audio routing).
Action: Audit and update automated unit/integration tests to match current implementation. Update or add manual test scripts under `test/manual/` and refresh test documentation so that CI or local test runners validate the current behavior (audio dual-output, speech queue, MPV zone manager behaviors).


---

## Issue 7 — Regression: Background audio ducking not restored after short speech
Summary: Background audio is being ducked when a short speech clip plays, but the background volume is not being restored (unducked) after the speech completes. This used to work and appears to be a recent regression.

Observed behavior:
- When `playSpeech` is issued while background music is playing, the zone publishes an event showing `ducking_applied` and a `duck_id` (duck applied). However, after the speech file completes (very short clip), the background music volume remains reduced and no `unducked` event is emitted.
- Manual smoke test using `test/manual/test-all.sh` playSpeech steps reproduces the issue with short files.

Reproduction steps:
1. Ensure background music is playing in Zone 1:
	mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"playBackground","audio":"music/Classic_hip-hop_beat.mp3","loop":true,"volume":80}'
2. Play a short speech clip:
	mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"playSpeech","audio":"general/Welcome_ParadoxFX.mp3","volume":80}'
3. Observe `paradox/zone1/events` and `/status` topics and logs. The `ducking_applied` event appears but background volume does not return to previous level.

Likely causes / areas to inspect:
- Race condition in `AudioManager.playSpeech` / MPV IPC where the EOF property/event is not reliably observed for very short files, causing the `await` that triggers duck removal to be skipped or delayed.
- `_baseBackgroundVolume` not set correctly before ducking (e.g., background not marked as playing) so the restore logic in `BaseZone._updateBackgroundVolume` doesn't restore correctly.
- Multiple active duck IDs left in `_activeDucks` due to duck id mismatch or removal path not executed on error.

Severity: Medium — audio remains ducked disrupting user experience; reproducible with short speech files.

Suggested next steps:
1. Add observability: publish an explicit `unducked` event when `_removeDucking()` runs (small code change in `lib/zones/base-zone.js`). This will make it trivial to confirm unduck actions in MQTT and logs.
2. Harden speech completion detection in `AudioManager` (ensure `_monitorProperty` reliably detects `eof-reached` for short files or add a fallback timeout that resolves the speech promise and triggers duck removal).
3. Add a unit/integration test that plays an artificially short speech file and asserts that ducking is applied and then removed within a short timeout.
4. Audit recent commits touching `audio-manager`, `base-zone`, or MPV IPC code for possible regressions.

If useful, I can implement step 1 (add `unducked` event publish) as a small patch and re-run the audio wrapper test to show the new event. I'll wait for your go-ahead before changing code.

If you'd like, I can:
- Add file/line references for each code snippet that demonstrates the current implementation.
- Draft proposed spec edits or a migration plan for any of the issues above.
- Create issues in the repository tracker (if you want PR/issue automation).
