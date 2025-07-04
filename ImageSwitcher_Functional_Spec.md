# ImageSwitcher Functional Specification

## Overview

ImageSwitcher is a Node.js module designed to control the playback of images, videos, and audio on a remote Raspberry Pi (or similar device) via MQTT commands. It is intended for use in interactive installations, escape rooms, or similar environments where remote control of media playback and and other special effects are required.

## Features

### 1. Media Playback

- **Image Display:**
  - Display still images full-screen using external utilities (e.g., `fbi`).
- **Video Playback:**
  - Play video files full-screen using external players (e.g., `mov`, `cvlc`, `omxplayer`).
- **Audio Playback:**
  - Play audio files using external players (e.g., `mpv`, `cvlc`, `omxplayer`).
- **Audio FX:**
  - Play short audio effects (FX) immediately, possibly overlapping with other audio.

#### Special notes on video transitions

- To make the transition from an image to a video seamless (i.e. no visable screen blanking) it can be assumed that the image being displayed and the first frame of the video are an exact match.  Then both the app displaying the image (i.e. fbi or similar) and the video player (i.e. mpv or similar) should be set to display in full screen mode.
- To make the transition from video to an image seamless, it can likewise be assumed that the last frame of the video and the image are an exact match.  In addition to both apps being set to full screen mode, the program displaying the image should change it to the ending image in the background while the video is playing.  

### 2. Media Queuing and Control

- **Queueing:**
  - Video and audio commands are queued (FIFO). When the queue is full, the oldest item is dropped.
  - Duplicate media (by name) is not added to the queue. Audio effects (FX) are played immediately.
- **Stop Commands:**
  - `stopVideo`, `stopAudio`, `stopAllAudioFx`, and `stopAll` commands immediately stop playback and clear queues as appropriate.
- **Transition Command:**
  - `transition` command plays a video and, when finished, displays a specified image.

### 3. MQTT Integration

- **Command Reception:**
  - Listens for JSON commands on a configurable MQTT topic.
- **Reply/Status:**
  - Sends replies and status updates to configurable MQTT topics.
- **Heartbeat:**
  - Periodically publishes a heartbeat message to a configured topic.

### 4. Configuration (using single pxfx.ini file)

All device configurations are stored in a single `pxfx.ini` file using section-based format:

- Single INI file contains all device types (screens, lights, relays)
- Each device gets its own section in brackets
- All devices share a single MQTT broker connection
- Base MQTT topics are configurable per device
- Global settings are defined in a `[global]` section

```ini
[global]
MQTT_SERVER=localhost
HEARTBEAT_TOPIC=Paradox/Devices

[ScreenA]
DEVICE_TYPE=screen
DISPLAY=:0
BASE_TOPIC=Paradox/Room/ScreenA
STATUS_TOPIC=Paradox/Room/ScreenA/Status
MEDIA_DIR=/opt/paradox/media
AUDIO_CHANNEL_MAP=Default DEVICE=default CHMASK=6

[ScreenB]
DEVICE_TYPE=screen
DISPLAY=:1
BASE_TOPIC=Paradox/Room/ScreenB
STATUS_TOPIC=Paradox/Room/ScreenB/Status
MEDIA_DIR=/opt/paradox/media
AUDIO_CHANNEL_MAP=Default DEVICE=default CHMASK=6

[Light1]
DEVICE_TYPE=light
CONTROLLER=hue
DEVICE_ID=AX30F2
BASE_TOPIC=Paradox/Room/Light1
STATUS_TOPIC=Paradox/Room/Light1/Status

[LightGroup1]
DEVICE_TYPE=light_group
CONTROLLER=hue
DEVICE_LIST=AX30F2,AX3E4,3D44FF
BASE_TOPIC=Paradox/Room/LightGroup1
STATUS_TOPIC=Paradox/Room/LightGroup1/Status

[Relay1]
DEVICE_TYPE=relay
CONTROLLER=zwave
DEVICE_ID=FF03F1
BASE_TOPIC=Paradox/Room/Relay1
STATUS_TOPIC=Paradox/Room/Relay1/Status
```

### 5. Architecture

- **Single Application**: All device types run in one Node.js process
- **Shared MQTT Broker**: All devices use the same MQTT broker connection
- **Device Routing**: Commands are automatically routed to correct device handlers based on MQTT topic
- **Audio Integration**: Audio effects are tied to specific screen devices
- **External API Placeholders**: Framework includes placeholders for Hue, WiZ, Zigbee, and Z-Wave controllers

### 6. Status and Error Reporting

Each device publishes two types of messages to its STATUS_TOPIC:

1. **State Updates**: Published whenever device state changes

   ```json
   {
     "timestamp": "2025-07-03T10:30:00Z",
     "device": "ScreenA",
     "type": "state",
     "status": "playing_video",
     "current_media": "video1.mp4",
     "queue_length": 2
   }
   ```

2. **Error Messages**: Published when errors occur, also sent to global HEARTBEAT_TOPIC

   ```json
   {
     "timestamp": "2025-07-03T10:30:00Z",
     "device": "ScreenA", 
     "type": "error",
     "error_code": "MEDIA_NOT_FOUND",
     "message": "File video1.mp4 not found in media directory",
     "source_topic": "Paradox/Room/ScreenA"
   }
   ```

### 7. Framework Provisions

- **Effect Macros**: Framework structure for lighting effects (FADE, BLINK, etc.) to be implemented later
- **Process Managers**: Framework for managing external media player instances (up to 8 concurrent) to be implemented later
- **External Controllers**: Placeholder classes for Hue, WiZ, Zigbee, and Z-Wave integrations

### 8. Media Player Support

The application includes wrappers for multiple external media players:

- **Image Display**: `fbi`, `feh`, `riv`
- **Video Playback**: `mpv`, `cvlc`, `omxplayer`, `mov`
- **Audio Playback**: `mpv`, `cvlc`, `omxplayer`
- **Extensible**: Framework allows additional players to be added

### 9. Testing

- **Unit Tests**: Included with actual MQTT message testing against localhost broker
- **Integration Tests**: Test external media player wrappers with mock implementations
- **Configuration Tests**: Validate INI file parsing and device initialization

## Proposed Scaffold Structure

/opt/paradox/apps/pxfx/
├── pxfx.js                 # Main application entry point
├── pxfx.ini                # Single configuration file
├── package.json
├── lib/
│   ├── core/
│   │   ├── device-manager.js    # Central device registry and router
│   │   ├── config-loader.js     # INI file parser
│   │   ├── mqtt-client.js       # Shared MQTT connection
│   │   └── message-router.js    # Routes commands to correct devices
│   ├── devices/
│   │   ├── screen-device.js     # Screen device implementation
│   │   ├── light-device.js      # Light device placeholder
│   │   ├── light-group-device.js # Light group placeholder  
│   │   └── relay-device.js      # Relay device placeholder
│   ├── media/
│   │   ├── media-player-factory.js # Creates appropriate media players
│   │   ├── players/
│   │   │   ├── fbi-player.js
│   │   │   ├── mpv-player.js
│   │   │   ├── cvlc-player.js
│   │   │   └── base-player.js   # Base class for all players
│   │   └── process-manager.js   # Framework for managing player instances
│   ├── controllers/
│   │   ├── hue-controller.js      # Placeholder
│   │   ├── wiz-controller.js      # Placeholder
│   │   ├── zigbee-controller.js   # Placeholder
│   │   └── zwave-controller.js    # Placeholder
│   ├── effects/
│   │   └── effect-engine.js     # Framework for effect macros
│   └── utils/
│       ├── logger.js
│       └── utils.js
└── test/
    ├── unit/
    ├── integration/
    └── fixtures/
        └── test-media/
