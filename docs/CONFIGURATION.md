# Configuration Guide

This document provides detailed configuration instructions for ParadoxFX (Paradox Effects).

## Configuration File Structure

ParadoxFX uses INI format configuration files. Copy `pfx.ini.example` to `pfx.ini` and customize for your setup.

## Global Configuration

### [mqtt] Section

```ini
[mqtt]
broker = localhost          # MQTT broker hostname/IP
port = 1883                # MQTT broker port
username =                 # MQTT username (optional)
password =                 # MQTT password (optional)
client_id = pfx-01       # Unique client identifier
keepalive = 60            # Keep-alive interval in seconds
clean_session = true      # Clean session flag
```

### [global] Section

```ini
[global]
device_name = media-controller-01   # Unique device identifier for heartbeat messages
log_level = info                    # Logging level: debug, info, warn, error
media_base_path = /opt/media       # Base path for media files (deprecated - use device-specific media_dir)
heartbeat_interval = 30000         # Heartbeat interval in milliseconds
preferred_image_player = auto      # Image player preference
require_video_group = false       # Require video group membership
```

## Device Configuration

### Screen Devices

Screen devices handle image display, video playback, and audio output.

```ini
[screen:device-name]
type = screen
topic = paradox/room/screen
status_topic = paradox/room/screen/status
media_dir = /opt/media/room
volume = 80
player_type = mpv
audio_device = default
display = :0
xinerama_screen = 0
```

**Parameters:**

- `type`: Must be "screen"
- `topic`: Base MQTT topic for commands
- `status_topic`: Topic for status updates (optional)
- `media_dir`: Directory containing media files for this device (replaces media_path)
- `volume`: Base volume level (0-100) for audio and video playback
- `player_type`: Media player preference (mpv, vlc, fbi, auto)
- `audio_device`: ALSA audio device name
- `display`: X11 display target
- `xinerama_screen`: Xinerama screen index for multi-monitor

**Media File Handling:**

- All media commands use filenames relative to `media_dir`
- Subdirectories are supported (e.g., "music/background.mp3")
- Volume adjustments in commands are applied as percentages to the base `volume` setting

### Light Devices

Individual light control.

```ini
[light:device-name]
type = light
topic = paradox/room/light
controller = hue
controller_config = bridge_ip=192.168.1.100;username=api_key
```

**Parameters:**

- `type`: Must be "light"
- `topic`: Base MQTT topic for commands
- `controller`: Light controller type (hue, wiz, zigbee, zwave)
- `controller_config`: Controller-specific configuration

### Light Group Devices

Group light control.

```ini
[lightgroup:device-name]
type = lightgroup
topic = paradox/room/lights
controller = hue
lights = light1,light2,light3
```

**Parameters:**

- `lights`: Comma-separated list of light IDs in the group

### Relay Devices

Switch and relay control.

```ini
[relay:device-name]
type = relay
topic = paradox/room/switch
controller = zwave
node_id = 5
```

**Parameters:**

- `controller`: Relay controller type (zwave, zigbee, gpio)
- `node_id`: Controller-specific node/device identifier

## Controller Configuration

### Philips Hue Controller

```ini
controller = hue
controller_config = bridge_ip=192.168.1.100;username=your_api_key
```

### WiZ Controller

```ini
controller = wiz
controller_config = light_ip=192.168.1.101
```

### Zigbee Controller

```ini
controller = zigbee
controller_config = coordinator_port=/dev/ttyUSB0
```

### Z-Wave Controller

```ini
controller = zwave
controller_config = controller_port=/dev/ttyACM0
```

## Audio Configuration

### Volume Settings

Each screen device has a base `volume` setting (0-100) that serves as the reference level for all audio and video playback. Volume adjustments in MQTT commands are applied as percentage changes to this base level.

**Volume Calculation:**

```
Effective Volume = Base Volume × (1 + VolumeAdjust/100)
```

**Examples:**

- Base volume: 80, VolumeAdjust: -10 → Effective volume: 72 (80 × 0.90)
- Base volume: 60, VolumeAdjust: +20 → Effective volume: 72 (60 × 1.20)
- Base volume: 50, VolumeAdjust: -50 → Effective volume: 25 (50 × 0.50)

### ALSA Device Names

Common ALSA device configurations:

```ini
audio_device = default              # System default
audio_device = hw:0,0              # Hardware device 0, subdevice 0
audio_device = plughw:1,0          # Hardware device 1 with format conversion
audio_device = pulse               # PulseAudio
```

### Multi-Channel Audio

For systems with multiple audio outputs:

```ini
[screen:hdmi1]
audio_device = hw:0,3              # HDMI output 1

[screen:hdmi2]
audio_device = hw:0,7              # HDMI output 2
```

## Display Configuration

### Single Monitor

```ini
display = :0                       # Default X11 display
xinerama_screen = 0               # Primary screen
```

### Multi-Monitor Setup

```ini
[screen:monitor1]
display = :0
xinerama_screen = 0               # Left monitor

[screen:monitor2]
display = :0
xinerama_screen = 1               # Right monitor
```

### Custom Geometry

For precise positioning:

```ini
monitor_geometry = 1920x1080+1920+0    # width x height + x_offset + y_offset
```

## Media Players

### Player Selection

PxFx automatically selects appropriate players for media types:

- **Images**: fbi, feh, imagemagick
- **Video**: mpv, vlc
- **Audio**: mpv, vlc, aplay

### Player Preferences

```ini
preferred_image_player = fbi       # For framebuffer systems
preferred_image_player = feh       # For X11 systems
preferred_image_player = auto      # Automatic selection
```

## Example Configurations

### Basic Single Screen Setup

```ini
[mqtt]
broker = localhost
port = 1883

[global]
device_name = main-controller
log_level = info
heartbeat_interval = 30000

[screen:main]
type = screen
topic = paradox/main/screen
media_dir = /opt/media
volume = 75
player_type = auto
audio_device = default
display = :0
```

### Multi-Room Entertainment System

```ini
[mqtt]
broker = 192.168.1.10
port = 1883

[global]
device_name = entertainment-system
log_level = info
heartbeat_interval = 30000

[screen:living-room]
type = screen
topic = paradox/living-room/screen
media_dir = /opt/media/living-room
volume = 85
audio_device = hw:0,3
display = :0

[screen:bedroom]
type = screen
topic = paradox/bedroom/screen
media_dir = /opt/media/bedroom
volume = 70
audio_device = hw:1,0
display = :0.1

[light:living-room-hue]
type = light
topic = paradox/living-room/lights
controller = hue
controller_config = bridge_ip=192.168.1.100;username=api_key

[relay:living-room-outlet]
type = relay
topic = paradox/living-room/outlet
controller = zwave
node_id = 5
```

### Raspberry Pi Framebuffer Setup

```ini
[mqtt]
broker = localhost
port = 1883

[global]
device_name = raspberry-pi-display
log_level = info
preferred_image_player = fbi
require_video_group = true

[screen:pi-display]
type = screen
topic = paradox/pi/screen
media_dir = /opt/media
volume = 60
player_type = mpv
audio_device = hw:0,1
display = /dev/fb0
```

## Troubleshooting

### Common Issues

#### MQTT Connection Failed

- Verify broker hostname and port
- Check network connectivity
- Verify credentials if authentication is enabled

#### Media Files Not Playing

- Check file paths are absolute
- Verify file permissions
- Ensure media players are installed
- Check audio device configuration

#### Permission Denied

- Add user to `video` group for framebuffer access
- Add user to `audio` group for audio device access
- Verify file ownership and permissions

#### Display Issues

- Verify X11 display is accessible
- Check Xinerama configuration for multi-monitor
- Ensure proper graphics drivers are installed

### Validation

Test your configuration:

```bash
# Test MQTT connectivity
mosquitto_pub -h your_broker -t test -m "hello"

# Test media players
mpv --version
vlc --version
fbi --help

# Test audio devices
aplay -l
pactl list sinks

# Test display access
echo $DISPLAY
xrandr
```

### Logging

Enable debug logging for troubleshooting:

```ini
[global]
log_level = debug
```

Check logs for detailed error information and device status updates.
