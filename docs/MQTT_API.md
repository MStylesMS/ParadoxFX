# MQTT API Reference

This document provides the complete MQTT API specification for PxFx (Paradox Effects), including command formats, message structures, topic patterns, and response formats.

## Table of Contents

- [Overview](#overview)
- [Topic Structure](#topic-structure)
- [Message Formats](#message-formats)
- [Screen/Media Commands](#screenmedia-commands)
- [Light Commands](#light-commands)
- [Relay Commands](#relay-commands)
- [System Messages](#system-messages)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Overview

PxFx uses MQTT for all device communication. Each device subscribes to a command topic and publishes status updates and responses. The system also provides heartbeat messages and error reporting.

### Base Architecture

- **Commands**: Sent to `{baseTopic}/command`
- **Status**: Published to `{baseTopic}/status`
- **Heartbeat**: Published to global heartbeat topic
- **Errors**: Published to both device status topic and global heartbeat topic

## Topic Structure

### Device Topics

Each device has a base topic configured in `pxfx.ini`:

```
{baseTopic}/command    # Incoming commands
{baseTopic}/status     # Outgoing status updates
```

### Global Topics

```
{heartbeatTopic}       # System heartbeat and global messages
```

### Example Topic Structure

```
paradox/living-room/screen/command    # Commands to living room screen
paradox/living-room/screen/status     # Status from living room screen
paradox/living-room/lights/command    # Commands to living room lights
paradox/devices                       # Global heartbeat topic
```

## Message Formats

### Command Message Format

All commands must be valid JSON with a required `Command` field:

```json
{
  "Command": "commandName",
  "Parameter1": "value1",
  "Parameter2": "value2"
}
```

### Status Message Format

Status messages include device state and operational information:

```json
{
  "timestamp": "2025-07-12T10:30:00.000Z",
  "device": "living-room-screen",
  "status": "playing_video",
  "currentImage": null,
  "currentVideo": "/media/intro.mp4",
  "currentAudio": null,
  "videoQueueLength": 2,
  "audioQueueLength": 0
}
```

### Heartbeat Message Format

System heartbeat messages:

```json
{
  "timestamp": "2025-07-12T10:30:00.000Z",
  "application": "pxfx",
  "status": "online",
  "uptime": 3600.5
}
```

## Screen/Media Commands

Screen devices handle image display, video playback, and audio playback.

### Image Commands

#### setImage

Display an image on the screen.

**Format:**

```json
{
  "Command": "setImage",
  "Image": "/path/to/image.jpg"
}
```

**Parameters:**

- `Image` (required): Full path to image file
- Supported formats: JPEG, PNG, GIF, BMP, TIFF, WebP

**Example:**

```json
{
  "Command": "setImage",
  "Image": "/opt/media/backgrounds/lobby.jpg"
}
```

### Video Commands

#### playVideo

Play a video file with optional volume control.

**Format:**

```json
{
  "Command": "playVideo",
  "Video": "/path/to/video.mp4",
  "Volume": 75
}
```

**Parameters:**

- `Video` (required): Full path to video file
- `Volume` (optional): Volume level 0-100, defaults to device default
- `Channel` (optional): Audio channel routing

**Supported formats:** MP4, AVI, MKV, MOV, WebM

#### stopVideo

Stop current video playback.

**Format:**

```json
{
  "Command": "stopVideo"
}
```

#### pause

Pause current video playback.

**Format:**

```json
{
  "Command": "pause"
}
```

#### resume

Resume paused video playback.

**Format:**

```json
{
  "Command": "resume"
}
```

#### skip

Skip to next video in queue.

**Format:**

```json
{
  "Command": "skip"
}
```

### Audio Commands

#### playAudio

Play an audio file with optional volume control.

**Format:**

```json
{
  "Command": "playAudio",
  "Audio": "/path/to/audio.mp3",
  "Volume": 80
}
```

**Parameters:**

- `Audio` (required): Full path to audio file
- `Volume` (optional): Volume level 0-100
- `Channel` (optional): Audio channel routing

**Supported formats:** MP3, WAV, FLAC, OGG, AAC, OPUS

#### playAudioFx

Play audio effects (supports polyphonic playback).

**Format:**

```json
{
  "Command": "playAudioFx",
  "Audio": "/path/to/effect.wav",
  "Type": "one-shot",
  "Volume": 90
}
```

**Parameters:**

- `Audio` (required): Full path to audio file
- `Type` (optional): Playback type ("one-shot", "loop"), default: "one-shot"
- `Volume` (optional): Volume level 0-100

#### stopAudio

Stop current audio playback.

**Format:**

```json
{
  "Command": "stopAudio"
}
```

#### stopAllAudioFx

Stop all audio effects playback.

**Format:**

```json
{
  "Command": "stopAllAudioFx"
}
```

### Advanced Commands

#### transition

Play a video followed by an image.

**Format:**

```json
{
  "Command": "transition",
  "Video": "/path/to/transition.mp4",
  "Image": "/path/to/final.jpg",
  "Channel": "default"
}
```

#### stopAll

Stop all media playback (video, audio, effects).

**Format:**

```json
{
  "Command": "stopAll"
}
```

### Queue Management

#### videoQueue

Get current video queue status.

**Format:**

```json
{
  "Command": "videoQueue"
}
```

#### audioQueue

Get current audio queue status.

**Format:**

```json
{
  "Command": "audioQueue"
}
```

#### clearQueue

Clear video or audio queue (context-dependent).

**Format:**

```json
{
  "Command": "clearQueue"
}
```

### Configuration

#### getConfig

Get current device configuration.

**Format:**

```json
{
  "Command": "getConfig"
}
```

## Light Commands

Light devices control individual lights and light groups.

### Basic Light Control

#### setColor

Set light color and brightness.

**Format:**

```json
{
  "Command": "setColor",
  "Color": "#FF6400",
  "Brightness": 75
}
```

**Parameters:**

- `Color` (required): Hex color code or RGB object
- `Brightness` (optional): Brightness level 0-100

#### on

Turn light on.

**Format:**

```json
{
  "Command": "on",
  "Brightness": 100
}
```

#### off

Turn light off.

**Format:**

```json
{
  "Command": "off"
}
```

### Light Group Control

#### setGroupColor

Set color for all lights in group.

**Format:**

```json
{
  "Command": "setGroupColor",
  "Color": {"r": 255, "g": 100, "b": 0},
  "Brightness": 80,
  "Lights": ["light1", "light2"]
}
```

#### fade

Fade lights to target brightness over time.

**Format:**

```json
{
  "Command": "fade",
  "Brightness": 50,
  "Duration": 30000
}
```

**Parameters:**

- `Brightness` (required): Target brightness 0-100
- `Duration` (required): Fade duration in milliseconds

## Relay Commands

Relay devices control switches, outlets, and other on/off devices.

#### on

Turn relay on.

**Format:**

```json
{
  "Command": "on"
}
```

#### off

Turn relay off.

**Format:**

```json
{
  "Command": "off"
}
```

#### toggle

Toggle relay state.

**Format:**

```json
{
  "Command": "toggle"
}
```

#### pulse

Pulse relay (on, then off after delay).

**Format:**

```json
{
  "Command": "pulse",
  "Duration": 5000
}
```

**Parameters:**

- `Duration` (optional): Pulse duration in milliseconds, default: 1000

## System Messages

### Heartbeat Messages

Published periodically to the global heartbeat topic:

```json
{
  "timestamp": "2025-07-12T10:30:00.000Z",
  "application": "pxfx",
  "status": "online",
  "uptime": 3600.5
}
```

### Event Messages

Published for significant system events:

```json
{
  "timestamp": "2025-07-12T10:30:00.000Z",
  "device": "living-room-screen",
  "type": "event",
  "event_code": "MEDIA_STARTED",
  "message": "Video playback started: intro.mp4",
  "source_topic": "paradox/living-room/screen"
}
```

### Status Updates

Published when device state changes:

```json
{
  "timestamp": "2025-07-12T10:30:00.000Z",
  "device": "living-room-screen",
  "status": "playing_video",
  "currentImage": null,
  "currentVideo": "/media/intro.mp4",
  "currentAudio": null,
  "videoQueueLength": 1,
  "audioQueueLength": 0
}
```

## Error Handling

### Error Message Format

Errors are published to both device status topics and the global heartbeat topic:

```json
{
  "timestamp": "2025-07-12T10:30:00.000Z",
  "device": "living-room-screen",
  "type": "error",
  "error_code": "COMMAND_FAILED",
  "message": "playVideo: File not found: /missing/video.mp4",
  "source_topic": "paradox/living-room/screen"
}
```

### Common Error Codes

- `INVALID_MESSAGE_FORMAT`: Message is not valid JSON or missing Command field
- `COMMAND_FAILED`: Command execution failed
- `FILE_NOT_FOUND`: Media file does not exist
- `UNSUPPORTED_FORMAT`: Media format not supported
- `DEVICE_BUSY`: Device is busy and cannot process command
- `CONFIGURATION_ERROR`: Device configuration is invalid
- `PLAYER_ERROR`: Media player error
- `NETWORK_ERROR`: Network communication error

### Warning Messages

Non-fatal issues are reported as warnings:

```json
{
  "timestamp": "2025-07-12T10:30:00.000Z",
  "device": "living-room-screen",
  "type": "warning",
  "warning_code": "QUEUE_FULL",
  "message": "Video queue is full, removing oldest entry",
  "source_topic": "paradox/living-room/screen"
}
```

## Examples

### Complete Media Playback Sequence

1. **Set background image:**

```bash
mosquitto_pub -h localhost -t "paradox/living-room/screen/command" \
  -m '{"Command": "setImage", "Image": "/media/background.jpg"}'
```

2. **Play intro video:**

```bash
mosquitto_pub -h localhost -t "paradox/living-room/screen/command" \
  -m '{"Command": "playVideo", "Video": "/media/intro.mp4", "Volume": 80}'
```

3. **Play background music:**

```bash
mosquitto_pub -h localhost -t "paradox/living-room/screen/command" \
  -m '{"Command": "playAudio", "Audio": "/media/ambient.mp3", "Volume": 40}'
```

4. **Stop all playback:**

```bash
mosquitto_pub -h localhost -t "paradox/living-room/screen/command" \
  -m '{"Command": "stopAll"}'
```

### Light Control Sequence

1. **Turn on lights:**

```bash
mosquitto_pub -h localhost -t "paradox/living-room/lights/command" \
  -m '{"Command": "on", "Brightness": 100}'
```

2. **Set warm color:**

```bash
mosquitto_pub -h localhost -t "paradox/living-room/lights/command" \
  -m '{"Command": "setColor", "Color": "#FF8C00", "Brightness": 75}'
```

3. **Fade to dim:**

```bash
mosquitto_pub -h localhost -t "paradox/living-room/lights/command" \
  -m '{"Command": "fade", "Brightness": 25, "Duration": 10000}'
```

### Monitoring Status Updates

Subscribe to device status:

```bash
mosquitto_sub -h localhost -t "paradox/+/+/status"
```

Subscribe to all system messages:

```bash
mosquitto_sub -h localhost -t "paradox/devices"
```

## Configuration Reference

Device topics are configured in `pxfx.ini`:

```ini
[screen:living-room]
type = screen
topic = paradox/living-room/screen
status_topic = paradox/living-room/screen/status

[light:living-room-hue]
type = light
topic = paradox/living-room/lights
controller = hue

[global]
heartbeat_topic = paradox/devices
heartbeat_interval = 30000
```

For complete configuration options, see the [Configuration Guide](CONFIGURATION.md).
