# MPV / Chromium Z-order switching — Option 6 (xdotool windowactivate) and Option 3 (wmctrl -i -a)

## Purpose
Document how Option 6 (xdotool windowactivate) behaved during testing, and how Option 3 (wmctrl -i -a) behaved. Record backups and notes about failed attempts and restore operations.

## Environment
- Raspberry Pi OS Bookworm, X11/Openbox
- MPV used with IPC and borderless geometry on secondary display
- Chromium launched in app mode on the same display
- Tools: wmctrl, xdotool

## Option 6 — xdotool windowactivate
- Command used to show a window: `xdotool windowactivate <winId>`
- Behavior observed: This performed a focus+raise operation and successfully brought the target window to the front during the test cycles.
- Result: WORKING — behaved similarly to `wmctrl -i -a` (both focus and raise are required)

## Option 3 — wmctrl activate/raise
- Command used to show a window: `wmctrl -i -a <winId>`
- Behavior observed: Reliable. Both MPV and Chromium were raised and became visible when activated.
- Result: WORKING — this was the first working approach used and is still a reliable fallback.

## Other attempts
- Option 1 / Option 2: Using `wmctrl -b add,above` and `-b add,below` states — unreliable; windows did not consistently restack.
- Option 4: `xdotool windowraise` — failed; browser never became visible.
- Option 5: `wmctrl` restack / geometry tweaks — failed as implemented; browser never became visible.

## Restore note
At one point several unsuccessful approaches were tried and then a prior checkpoint was restored to recover the working setup. This file records the working options (3 and 6) and notes that other approaches were attempted and did not succeed.

## Backups created
- `scripts/proof-mpv-chromium-option6.js` — placeholder backup created after Option 6
- `PROOF_TEST-option6.md` — snapshot of `PROOF_TEST.md` after Option 6
- `PROOF_TEST-option3.md` — snapshot intended to represent the `PROOF_TEST.md` state when Option 3 was used

## Next steps
- If desired, replace the option6 backup placeholder with a full copy of the script (or a git branch/commit tag) for archival.
- Continue testing other methods from `PROOF_TEST.md` if needed.
