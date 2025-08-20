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



If you'd like, I can:
- Add file/line references for each code snippet that demonstrates the current implementation.
- Draft proposed spec edits or a migration plan for any of the issues above.
- Create issues in the repository tracker (if you want PR/issue automation).
