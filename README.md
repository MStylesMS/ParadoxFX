# PxFx - Paradox Effects

A Node.js multi-modal media and effect controller for screens, lights, and relays via MQTT.

## Overview

PxFx is a comprehensive system for controlling various devices through MQTT messaging. It supports:

- **Screens**: Video/audio playback via media players (mpv, vlc, fbi, etc.)
- **Lights**: Individual and group lighting control (Hue, WiZ, Zigbee, Z-Wave)  
- **Relays**: Switch and outlet control
- **Effects**: Coordinated device sequences and macros

## Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd pxfx

# Install dependencies
npm install

# Copy and edit configuration
cp pxfx.ini.example pxfx.ini
# Edit pxfx.ini with your settings

# Run the application
npm start
```

### Basic Configuration

Edit `pxfx.ini` to configure your devices and MQTT connection:

```ini
[mqtt]
broker = localhost
port = 1883

[screen:living-room]
type = screen
topic = paradox/living-room/screen
media_path = /opt/media

[light:living-room-hue]
type = light
topic = paradox/living-room/lights
controller = hue
```

### Send Commands

```bash
# Display an image
mosquitto_pub -h localhost -t "paradox/living-room/screen/command" \
  -m '{"Command": "setImage", "Image": "/media/background.jpg"}'

# Play a video
mosquitto_pub -h localhost -t "paradox/living-room/screen/command" \
  -m '{"Command": "playVideo", "Video": "/media/intro.mp4", "Volume": 80}'

# Control lights
mosquitto_pub -h localhost -t "paradox/living-room/lights/command" \
  -m '{"Command": "setColor", "Color": "#FF6400", "Brightness": 75}'
```

## Documentation

- **[MQTT API Reference](docs/MQTT_API.md)** - Complete command reference and message formats
- **[Configuration Guide](docs/CONFIGURATION.md)** - Detailed setup and configuration instructions
- **[Project Architecture](docs/SCAFFOLD_SUMMARY.md)** - Technical implementation details
- **[Media Format Testing](docs/MEDIA_FORMAT_TEST_SUMMARY.md)** - Supported media formats and testing

## Requirements

- Node.js 16+ and npm
- MQTT broker accessible on network
- Media players: mpv, vlc, fbi (for respective media types)
- Audio system: ALSA or PulseAudio

## Development

### Running Tests

```bash
npm test                # Run all tests (unit + integration)
npm run test:ci         # Unit tests only (faster, no external dependencies)
npm run test:manual     # Real media playback tests
```

### Project Structure

- **lib/core/**: System initialization, configuration, MQTT, and device management
- **lib/devices/**: Device-specific implementations for screens, lights, and relays
- **lib/media/**: Media player framework with support for multiple player types
- **lib/controllers/**: Integration with external systems (Hue, WiZ, Zigbee, Z-Wave)
- **lib/effects/**: Macro system for complex device sequences
- **test/**: Comprehensive test suite with unit, integration, and manual tests

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or contributions, please refer to the documentation in the `docs/` directory or create an issue in the project repository.
