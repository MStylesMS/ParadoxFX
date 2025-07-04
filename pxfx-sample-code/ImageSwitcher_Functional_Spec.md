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

### 4. Configuration (using .ini files)

For mapping MQTT topics to devices, .ini format files will be used:

- All variables used by the program, such as MQTT topics, directories, strings, and numerical values, are stored in `.ini` files using section-based format with `#` for comments.
- The same `.ini` format is used for audio device/channel settings, replacing previous environment variable or shell script approaches.
- Each device or controller gets its own section in brackets, allowing multiple devices to be configured in a single file without unique variable names.
- Example:

#### screens_mqtt.ini

```ini
[global]
MQTT_SERVER=localhost
HEARTBEAT=Paradox/Devices

[ScreenA]
MQTT_SERVER=default
DISPLAY=:0
BASE_TOPIC=Paradox/Room/ScreenA
STATUS_TOPIC=Paradox/Room/ScreenA/Status
AUDIO_CHANNEL_MAP=Default DEVICE=default CHMASK=6
HEARTBEAT=default

[ScreenB]
MQTT_SERVER=default
DISPLAY=:1
BASE_TOPIC=Paradox/Room/ScreenB
STATUS_TOPIC=Paradox/Room/ScreenB/Status
AUDIO_CHANNEL_MAP=Default DEVICE=default CHMASK=6
HEARTBEAT=default
```

#### lights_mqtt.ini

```ini
[global]
MQTT_SERVER=localhost
HEARTBEAT=Paradox/Devices

[Light1]
DEVICE=AX30F2
BASE_TOPIC=Paradox/Room/Light1
STATUS_TOPIC=Paradox/Room/Light1/Status

[LightGroup1]
DEVICE_LIST=AX30F2,AX3E4,3D44FF
BASE_TOPIC=Paradox/Room/LightGroup1
STATUS_TOPIC=Paradox/Room/LightGroup1/Status
```

#### relays_mqtt.ini

```ini
[global]
MQTT_SERVER=localhost
HEARTBEAT=Paradox/Devices

[Relay1]
DEVICE=FF03F1
BASE_TOPIC=Paradox/Room/Relay1
STATUS_TOPIC=Paradox/Room/Relay1/Status
```

### 5. Example Commands

#### Screen Commands

- `{"Command":"playVideo","Video":"FileName.mp4"}` - plays immediately or when another video is currently playing queues video file: `FileName.mp4`.
- `{"Command":"setImage","Image":"Picture1.png"}` - displays image: `Picture1.png`.
- `{"Command":"transition","Image":"EndFrame.png","Video":"Transition.mp4"}` - plays immediately or when another video is currently playing queues video file: `Transition.mp4` and when the requested video starts playing sets the displayed image to the `EndFrame.png` file, so the image becomes visible when the video ends.
- `{"Command":"playAudio","Audio":"FileName.mp3"}` - plays immediately or when another audio file is currently playing queues audio file: `FileName.mp3`.
- `{"Command":"playAudioFx","Audio":"SoundFx1.wav"}` - immediately plays audio file: `SoundFx1.wav`.
- `{"Command":"stopVideo"}` - immediately stops the video playback and removes all queued video.
- `{"Command":"stopAudio"}` - immediately stops the audio playback and removes all queued audio clips.
- `{"Command":"stopAllAudioFx"}` - immediately stops all the audio-fx playbacks.
- `{"Command":"stopAll"}` - immediately stops all video, audio and audio-fx playbacks, removes all queued media.
- `{"Command":"getConfig"}` - sends current configuration to the reply topic.
- `{"Command":"videoQueue"}` - sends the names of the currently playing and queued video files to the reply topic.
- `{"Command":"audioQueue"}` - sends the names of the currently playing and queued audio files to the reply topic.
- `{"Command":"displayOff"}` - turns off the display.
- `{"Command":"displayOn"}` - turns on the display.
- `{"Command":"reboot"}` - reboots the host.
- `{"Command":"shutdown"}` - shutdowns the host.

#### Light Commands

(Future upgrade.)

#### Relay Commands

(Future upgrade.)

### 6. System Control

- **Display Power:**
  - Can turn the display on/off via shell commands.
- **Reboot/Shutdown:**
  - Can reboot or shut down the host via shell commands.

### 7. Extensibility

- **Media Players:**
  - External utilities for image, video, and audio playback can be configured or replaced.
- **Platform Support:**
  - Designed to run on Raspberry Pi (Raspbian) but can be tested on Ubuntu or other Linux systems.

### 8. Packaging

- **Node Package:**
  - The application is designed to be published and used as a Node.js package named `Paradox-FX` (short name: `pxfx`).
  - The package can be installed via npm and used as a library or standalone application.

## External Dependencies

- Node.js (>= v15.1)
- MQTT broker (e.g., Mosquitto)
- External media utilities: `fbi`, `cvlc`, `omxplayer`, etc.
- Optional: `riv` for image display

## Security and Permissions

- Passwordless sudo may be required for some commands (e.g., `fbi`, reboot, shutdown).
- Environment variables and shell scripts are used for configuration and startup.

## Testing

- Includes a test script to exercise all main features using default media files.
- Can be tested on Ubuntu or Raspberry Pi.

## Extending or Reusing

- Utility functions (e.g., for parsing channel maps) are in `lib/utils.js`.
- Media player commands and arguments are in `lib/media_players.js`.
- Main application logic is in `index.js`.

---

**This specification can be edited to add, remove, or change features for your new application.**
