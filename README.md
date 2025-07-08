# Paradox Effects (PxFx)

A Node.js multi-modal media and effect controller for screens, lights, and relays via MQTT.

## Overview

PxFx is a comprehensive system for controlling various devices through MQTT messaging. It supports:

- **Screens**: Video/audio playback via media players (mpv, vlc, fbi, etc.)
- **Lights**: Philips Hue, WiZ, and other smart lighting systems
- **Relays**: Zigbee and Z-Wave devices for automation

All configuration is managed through a `pxfx.ini` file (or a custom file via `--config`) with device-specific sections.

## Test Configuration

For testing, you can use a separate configuration file (e.g. `pxfx-test.ini`) to point to test media and settings. To run with a test config:

```sh
node pxfx.js --config pxfx-test.ini
```

If no `--config` or `-c` argument is provided, the application defaults to `pxfx.ini` in the project root.

**Example `pxfx-test.ini`:**

```ini
[global]
media_root=./test/fixtures/test-media
mqtt_broker=mqtt://localhost:1883

[ScreenA]
display=0
default_image=TestPattern_1920x1080.png
video_volume=70
audio_volume=70
videoQueueMax=5
audioQueueMax=5
```

## Architecture

```text
pxfx/
├── pxfx.js              # Main entry point
├── pxfx.ini             # Configuration file
├── package.json         # Dependencies and scripts
├── lib/
│   ├── core/            # Core system components
│   │   ├── config-loader.js    # INI configuration parser
│   │   ├── mqtt-client.js      # MQTT connection manager
│   │   ├── device-manager.js   # Device registry and lifecycle
│   │   └── message-router.js   # MQTT message routing
│   ├── devices/         # Device implementations
│   │   ├── screen-device.js      # Screen/media device control
│   │   ├── light-device.js       # Individual light control
│   │   ├── light-group-device.js # Light group control
│   │   └── relay-device.js       # Relay/switch control
│   ├── media/           # Media player framework
│   │   ├── media-player-factory.js # Player creation and management
│   │   ├── process-manager.js      # Process lifecycle management
│   │   └── players/              # Media player implementations
│   │       ├── base-player.js    # Base player interface
│   │       ├── fbi-player.js     # FBI framebuffer player
│   │       ├── mpv-player.js     # MPV video player
│   │       └── cvlc-player.js    # VLC video player
│   ├── controllers/     # External system controllers
│   │   ├── hue-controller.js     # Philips Hue integration
│   │   ├── wiz-controller.js     # WiZ lighting integration
│   │   ├── zigbee-controller.js  # Zigbee device integration
│   │   └── zwave-controller.js   # Z-Wave device integration
│   ├── effects/         # Effect macro system
│   │   └── effect-engine.js      # Effect sequence management
│   └── utils/           # Utility modules
│       ├── logger.js             # Logging system
│       └── utils.js              # Common utilities
└── test/                # Test suite
    ├── unit/            # Unit tests
    ├── integration/     # Integration tests
    └── fixtures/        # Test data and media
```

## Getting Started

### Prerequisites

- Node.js >= 16.0
- Media players (mpv, vlc, fbi) in PATH
- MQTT broker accessible on network

### Setup

```bash
npm install
cp pxfx.ini.example pxfx.ini
# Edit pxfx.ini with your configuration
npm start
```

## Configuration

Edit `pxfx.ini` to configure your devices and MQTT connection:

```ini
[mqtt]
broker = localhost
port = 1883
username = 
password = 
client_id = pxfx-01

[screen:living-room]
topic = paradox/living-room/screen
media_path = /opt/media
player_type = mpv

[light:hue-group-1]
type = hue
topic = paradox/living-room/lights
controller = hue
bridge_ip = 192.168.1.100

[relay:bedroom-switch]
type = relay
topic = paradox/bedroom/switch
controller = zigbee
```

## Updated Configuration

### Screen Settings

- `DEFAULT_IMAGE`: Default image to display when no media is queued. Defaults to `default.png`.

- `VIDEO_VOLUME`: Base volume for video playback, used as 100% reference.

### Audio Settings

- `AUDIO_VOLUME`: Base volume for audio playback, used as 100% reference.

- `AUDIOFX_MAX_POLY`: Maximum number of polyphonic audio FX files allowed.

## MQTT Commands

### Video Commands

- `playVideo`: Play a video file. Parameters: `Video`, `Volume` (optional).

- `setImage`: Set an image file.

- `transition`: Transition from an image to a video. Parameters: `Image`, `Video`.

- `clearQueue`: Clear the video queue.

- `pause`: Pause the current video.

- `resume`: Resume the paused video.

- `skip`: Skip to the next video in the queue.

- `stopAll`: Stop all video playback and clear the queue.

### Audio Commands

- `playAudio`: Play an audio file. Parameters: `Audio`, `Volume` (optional).

- `playAudioFX`: Play an audio FX file. Parameters: `Audio`, `Type` (optional, default: `one-shot`), `Volume` (optional).

- `clearQueue`: Clear the audio queue.

- `pause`: Pause the current audio.

- `resume`: Resume the paused audio.

- `skip`: Skip to the next audio in the queue.

- `stopAll`: Stop all audio playback and clear the queue.

## Error Handling

### Status Messages

- `Type`: `event` or `warning`.

- `Description`: Detailed information about the event or warning.

## Development

### Setting Up Test Media

To run the complete test suite, copy media files to the test fixtures directory:

```bash
# Create test media directory (if not exists)
mkdir -p test/fixtures/test-media

# Copy test media files from your media collection
cp /opt/paradox/media/default.* test/fixtures/test-media/
cp /opt/paradox/media/houdini_picture_24bit.png test/fixtures/test-media/
cp /opt/paradox/media/intro_short.mp4 test/fixtures/test-media/

# Verify files are copied
ls -la test/fixtures/test-media/
```

The tests require various media formats:

- **Images**: JPEG, PNG, GIF, BMP
- **Video**: MP4, AVI, MKV
- **Audio**: MP3, WAV, OGG

### Running Tests

```bash
npm test                # Run all tests (unit + integration)
npm run test:ci         # Unit tests only (faster, no external dependencies)
npm run test:manual     # Real media playback tests (you will see/hear media!)
npm run check-media     # Check available test media files
```

**Real Media Playback Tests**: Set `ENABLE_REAL_PLAYBACK=true` to actually display images, play videos, and output audio during testing. Requires X11 display and audio system. See `test/manual/README.md` for details.

**Note**: Integration tests will skip missing media files with warnings.

### Project Structure

- **Core**: System initialization, configuration, MQTT, and device management
- **Devices**: Device-specific implementations for screens, lights, and relays
- **Media**: Media player framework with support for multiple player types
- **Controllers**: Integration with external systems (Hue, WiZ, Zigbee, Z-Wave)
- **Effects**: Macro system for complex device sequences
- **Utils**: Logging and common utilities

### Adding New Devices

1. Create device class in `lib/devices/`
2. Implement required methods from base device interface
3. Add device configuration section to `pxfx.ini`
4. Register device type in `device-manager.js`
5. Add unit tests in `test/unit/`

### Adding New Controllers

1. Create controller class in `lib/controllers/`
2. Implement controller interface for external system communication
3. Add configuration options to device sections
4. Test integration with actual hardware

## Media Players

Supported media players:

- **mpv**: Full-featured video player with JSON IPC
- **vlc**: VLC media player with RC interface
- **fbi**: Framebuffer image viewer for static images

Players are automatically selected based on file type and configuration.

## Effect System

The effect engine supports complex device sequences:

```javascript
// Example effect definition
{
  "name": "sunrise",
  "devices": ["light:bedroom"],
  "steps": [
    {"command": "on", "brightness": 1, "color": {"r": 255, "g": 100, "b": 0}},
    {"command": "fade", "brightness": 100, "duration": 30000}
  ]
}
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Run test suite
5. Submit pull request

## Support

- Create an issue for bugs or feature requests
- Check existing issues before creating new ones
- Provide configuration and log files when reporting issues

If you have ideas for releases in the future, it is a good idea to list them in the README.

## Contributing

State if you are open to contributions and what your requirements are for accepting them.

For people who want to make changes to your project, it's helpful to have some documentation on how to get started. Perhaps there is a script that they should run or some environment variables that they need to set. Make these steps explicit. These instructions could also be useful to your future self.

You can also document commands to lint the code or run tests. These steps help to ensure high code quality and reduce the likelihood that the changes inadvertently break something. Having instructions for running tests is especially helpful if it requires external setup, such as starting a Selenium server for testing in a browser.

## Authors and acknowledgment

Show your appreciation to those who have contributed to the project.

## License

For open source projects, say how it is licensed.

## Project status

If you have run out of energy or time for your project, put a note at the top of the README saying that development has slowed down or stopped completely. Someone may choose to fork your project or volunteer to step in as a maintainer or owner, allowing your project to keep going. You can also make an explicit request for maintainers.
