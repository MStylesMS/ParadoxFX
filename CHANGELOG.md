# Changelog

## [1.0.4] - 2025-08-29
### Changed
- Standardize audio effect command to canonical `playAudioFX` across zones (removed mixed `playAudioFx` variants in code/docs/tests).
- Unified inbound command payload key usage to prefer `file` while still accepting legacy `audio` / `image` for backward compatibility.
- Updated tests and docs to reflect `playAudioFX` command name.

## [0.9.0] - 2025-08-22
### Changed
- Hide mouse cursor on X displays using `unclutter` when PFX starts (if `unclutter` is available on PATH).
- Fixed browser-to-screen mapping so enableBrowser commands target the configured `target_monitor` deterministically (sorted by display X position).

### Notes
- Currently only one browser instance should be enabled across all screens to avoid command routing confusion; running multiple simultaneous browser instances can cause control messages (show/hide/enable/disable) to be misrouted.

