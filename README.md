# ParadoxFX - Paradox Effects

A Node.js multi-modal media and effect controller for screens, lights, and relays via MQTT.

## Overview

ParadoxFX is a comprehensive system for controlling various devices through MQTT messaging. It supports:

- **Screens**: Video/audio playback via media players (mpv, vlc, fbi, etc.)
- **Lights**: Individual and group lighting control (Hue, WiZ, Zigbee, Z-Wave)  
- **Relays**: Switch and outlet control
- **Effects**: Coordinated device sequences and macros

### Platform Variants

- **PxFx (Main)**: Optimized for Raspberry Pi 4+ and modern systems
- **PxFx Pi3**: Specialized version for Raspberry Pi 3 with hardware acceleration

## Quick Start

### Standard Installation (Pi4+)

```bash
# Clone the repository
git clone <repository-url>
cd pfx

# Install dependencies
npm install

# Copy and edit configuration
cp pfx.ini.example pfx.ini
# Edit pfx.ini with your settings

# Run the application
npm start
```

### Raspberry Pi 5 Installation

**Pi5 requires specific setup for dual-HDMI functionality:**

```bash
# See detailed Pi5 setup guide
cat docs/PI5_SETUP_GUIDE.md

# Quick setup for Pi5 dual-HDMI:
cp config/pfx-pi5-hh.ini pfx.ini
# Edit pfx.ini for your MQTT broker and media paths
```

**Important**: Pi5 dual-screen requires X11 (not Wayland). Use `sudo raspi-config` to switch display systems.

### Raspberry Pi 3 Installation

```bash
# Clone the repository
git clone <repository-url>
cd pfx

# Install dependencies
npm install

# Configure for Pi3
node pfx-pi3.js config

# Copy Pi3 configuration
cp pfx-pi3.ini.example pfx-pi3.ini
# Edit pfx-pi3.ini with your settings

# Test hardware acceleration
node pfx-pi3.js test-screens

# Run Pi3-optimized version
node pfx-pi3.js start
```

### Basic Configuration

Edit `pfx.ini` to configure your devices and MQTT connection:

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

### Audio Testing

ParadoxFX includes comprehensive audio testing capabilities:

```bash
# Standard audio testing (single device)
node test/manual/test-audio.js

# Multi-zone audio testing (3 independent physical outputs)
node test/manual/test-audio-3devices.js

# Raspberry Pi audio configuration
node test/manual/config-pi-audio.js
```

**Multi-Zone Audio Architecture:**
- **Zone 'screen0'**: HDMI 1 output (alsa/plughw:0)
- **Zone 'screen1'**: HDMI 2 output (alsa/plughw:1)
- **Zone 'headphones'**: Analog output (pulse/alsa_output.platform-fe00b840.mailbox.stereo-fallback)

Each zone supports independent:
- Background music with looping and volume control
- Low-latency sound effects (<50ms)
- Speech/narration with background music ducking
- MQTT topic routing (pfx/{zone}/{type}/{action})

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
