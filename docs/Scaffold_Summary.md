# ParadoxFX Scaffold Summary

## Completed Implementation

### ✅ Core Architecture

- **Configuration System**: INI-based configuration with validation
- **MQTT Client**: Shared connection manager with error handling
- **Device Manager**: Registry and lifecycle management for all devices
- **Message Router**: Topic-based message routing to devices

### ✅ Device Framework

- **Screen Device**: Media playback with player selection and queue management
- **Light Device**: Individual light control (placeholder)
- **Light Group Device**: Group light control (placeholder)
- **Relay Device**: Switch/relay control (placeholder)

### ✅ Media Player System

- **Media Player Factory**: Dynamic player creation based on file type
- **Process Manager**: Subprocess lifecycle management
- **Player Implementations**:
  - FBI Player: Framebuffer image display
  - MPV Player: Video/audio playback
  - CVLC Player: VLC media player

### ✅ Multi-Zone Audio Architecture

- **Zone-Based Audio Management**: Independent audio content per physical output
  - **Zone 'screen0'**: HDMI 1 output (alsa/plughw:0)
  - **Zone 'screen1'**: HDMI 2 output (alsa/plughw:1)
  - **Zone 'headphones'**: Analog output (pulse/alsa_output.platform-fe00b840.mailbox.stereo-fallback)
- **Audio Type Separation**: Each zone supports 3 independent audio types:
  - **Background Music**: Persistent MPV instances with volume control and ducking
  - **Sound Effects**: Fire-and-forget spawn method with <50ms latency
  - **Speech/Narration**: Queue-based system with background music coordination
- **MQTT Integration Pattern**: Topic routing structure (pfx/{zone}/{type}/{action})
- **Parallel Audio Streams**: Simultaneous multi-zone audio without interference
- **Performance Validated**: 9 MPV instances (3 zones × 3 audio types) running concurrently

**Phase 8–9 Enhancements** (current branch)
- Unified volume resolver (precedence: command `volume` > command `adjustVolume` > zone base).
- Single non-stacking background ducking via `ducking_adjust` (negative percent) applied only while speech / other duck triggers active.
- Telemetry fields (`effective_volume`, `pre_duck_volume`, `ducked`) added to playback outcome & background recompute events (events only; not added to steady status payloads).

### ✅ External Controllers

- **Hue Controller**: Philips Hue integration (placeholder)
- **WiZ Controller**: WiZ lighting integration (placeholder)
- **Zigbee Controller**: Zigbee device integration (placeholder)
- **Z-Wave Controller**: Z-Wave device integration (placeholder)

### ✅ Effect System

- **Effect Engine**: Macro sequence management framework

### ✅ Utilities

- **Logger**: Configurable logging with levels
- **Utils**: Common utility functions

### ✅ Test Framework

- **Unit Tests**: Unit test suite exists and covers core components (run with `npm test`)
- **Integration Tests**: Integration test scaffolding present; some tests require an MQTT broker or real media playback and may be skipped in CI.
- **Media Tests**: Manual and automated media tests are provided under `test/manual/` for format and playback verification.
- **Audio Testing**: Scripts and manual tests target multi-zone and low-latency audio scenarios.
- **Coverage & Mocks**: Jest config and mock helpers are included for test development.

### ✅ Configuration & Documentation

- **Example Configuration**: Complete pfx.ini.example
- **README**: Comprehensive project documentation
- **Package.json**: Dependencies and scripts
- **License**: MIT license
- **Gitignore**: Node.js and project-specific exclusions

## Test Results

```
# Test notes

Test results vary by environment. Some integration tests require an MQTT broker and X11/Audio hardware; run unit tests locally with `npm test` and use `npm run test:manual` for manual media/audio validations.
```

## File Structure (high-level)

The runtime and source layout is under the `pfx/` application folder. Core items include:

- `package.json` — project dependencies and scripts
- `pfx.js`, `start.js` — application entry and startup helpers
- `pfx.ini` / `pfx.ini.example` — runtime configuration examples
- `lib/` — application source (core, devices, media, controllers, utils)
- `test/` — unit/integration/manual test scripts and helpers
- `media/` — media assets used for testing and samples

Refer to the repo root and `docs/` for detailed guides and examples.

## Next Steps

### High Priority

1. **Media Library Complete**: Comprehensive media files now available in media/test/ directory
2. **Fix MQTT Client Unit Test**: Update test to work with private properties  
3. **Implement Device Placeholders**: Add actual logic for light and relay devices
4. **Media Player Integration**: Complete process management and error handling
5. **Controller Implementations**: Add real API integration for Hue, WiZ, etc.

### Medium Priority

1. **Effect System**: Implement effect sequence execution
2. **Error Recovery**: Add robust error handling and recovery
3. **Logging Enhancement**: Add log rotation and remote logging
4. **Performance**: Add monitoring and optimization

### Low Priority

1. **Web Interface**: Add web-based configuration and monitoring
2. **Plugin System**: Allow external device and effect plugins
3. **Documentation**: Add API documentation and tutorials
4. **Deployment**: Add Docker and systemd service files

## Usage

```bash
# Install dependencies
npm install

# Copy and edit configuration
cp pfx.ini.example pfx.ini
# Edit pfx.ini with your settings

# Run the application
npm start

# Run tests (unit only, skips integration)
npm run test:ci

# Run with custom config
node start.js /path/to/custom.ini
```

The scaffold provides a solid foundation for the ParadoxFX system with a clean architecture, comprehensive testing, and room for extension.
