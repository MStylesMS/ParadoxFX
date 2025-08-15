# MQTT API Reference

This document provides the complete MQTT API specification for ParadoxFX (Paradox Effects), including command formats, message structures, topic patterns, and response formats.

## Table of Contents

- [Overview](#overview)
- [Topic Structure](#topic-structure)
- [Message Formats](#message-formats)
- [Multi-Zone Audio](#multi-zone-audio)
- [Screen/Media Commands](#screenmedia-commands)
- [Multi-Zone Audio Commands](#multi-zone-audio-commands)
- [Light Commands](#light-commands)
- [Relay Commands](#relay-commands)
- [System Messages](#system-messages)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Overview

PFx uses MQTT for all device communication. Each device subscribes to a command topic and publishes status updates and responses. The system also provides heartbeat messages and error reporting.

### Base Architecture

- **Commands**: Sent to `{baseTopic}/commandss`
- **Status**: Published to `{baseTopic}/status`
- **Heartbeat**: Published to global heartbeat topic
- **Errors**: Published to both device status topic and global heartbeat topic

## Topic Structure

### Device Topics

Each device has a base topic configured in `pfx.ini`:

```
{baseTopic}/commandss   # Incoming commands
{baseTopic}/status     # Outgoing status updates
{baseTopic}/events     # Real-time events
{baseTopic}/warnings   # Warnings and errors
```

### Global Topics

```
{heartbeatTopic}       # System heartbeat and global messages
```

### Example Topic Structure

```
paradox/living-room/screen/commandss   # Commands to living room screen
paradox/living-room/screen/status     # Status from living room screen
paradox/living-room/screen/events     # Event notifications
paradox/living-room/screen/warnings   # Warnings and errors
paradox/living-room/lights/commandss   # Commands to living room lights
paradox/devices                       # Global heartbeat topic
```

## Message Formats

### Command Message Format

All commands must be valid JSON with a required `command` field:

```json
{
  "command": "commandName",
  "parameter1": "value1",
  "parameter2": "value2"
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
  "application": "pfx",
  "device_name": "media-controller-01",
  "ip_address": "192.168.1.150",
  "status": "online",
  "uptime": 3600.5
}
```

**Fields:**

- `timestamp`: ISO 8601 timestamp when heartbeat was generated
- `application`: Always "pfx"
- `device_name`: Device name from global DEVICE_NAME configuration
- `ip_address`: Current IP address of the system
- `status`: System status ("online", "offline", "error")
- `uptime`: System uptime in seconds

## Multi-Zone Audio

ParadoxFX supports independent audio content across multiple physical outputs, enabling true multi-zone audio experiences. Each zone can play different background music, sound effects, and speech simultaneously.

### Audio Zone Architecture

**Supported Zones:**
- **screen0**: HDMI 1 output (alsa/plughw:0)
- **screen1**: HDMI 2 output (alsa/plughw:1) 
- **headphones**: Analog output (pulse/alsa_output.platform-fe00b840.mailbox.stereo-fallback)

**Audio Types per Zone:**
- **background**: Continuous music with looping and volume control
- **effects**: Low-latency sound effects (<50ms response time)
- **speech**: Voice/narration with automatic background music ducking

### Multi-Zone Topic Structure

Multi-zone audio uses a hierarchical topic structure:

```
pfx/{zone}/{audioType}/{action}
```

**Examples:**
```
pfx/screen0/background/play     # Play background music on Screen 0
pfx/screen1/effects/trigger     # Trigger sound effect on Screen 1
pfx/headphones/speech/say       # Play speech on headphones
pfx/screen0/background/volume   # Adjust Screen 0 background volume
```

### Multi-Zone Commands

#### Background Music Control

**Play Background Music:**
```json
Topic: pfx/{zone}/background/play
Payload: {
  "file": "/path/to/background_music.mp3"
}
```

**Adjust Background Volume:**
```json
Topic: pfx/{zone}/background/volume
Payload: {
  "level": 70
}
```

**Stop Background Music:**
```json
Topic: pfx/{zone}/background/stop
Payload: {}
```

#### Sound Effects

**Trigger Sound Effect:**
```json
Topic: pfx/{zone}/effects/trigger
Payload: {
  "file": "/path/to/sound_effect.wav"
}
```

#### Speech/Narration

**Play Speech:**
```json
Topic: pfx/{zone}/speech/say
Payload: {
  "file": "/path/to/speech.mp3",
  "duckBackground": true,
  "duckLevel": 40
}
```

### Multi-Zone Examples

**Independent Background Music:**
```bash
# Different music on each zone
mosquitto_pub -t "pfx/screen0/background/play" -m '{"file": "/media/classical.mp3"}'
mosquitto_pub -t "pfx/screen1/background/play" -m '{"file": "/media/jazz.mp3"}'
mosquitto_pub -t "pfx/headphones/background/play" -m '{"file": "/media/ambient.mp3"}'

# Different volumes per zone
mosquitto_pub -t "pfx/screen0/background/volume" -m '{"level": 100}'
mosquitto_pub -t "pfx/screen1/background/volume" -m '{"level": 60}'
mosquitto_pub -t "pfx/headphones/background/volume" -m '{"level": 30}'
```

**Zone-Specific Sound Effects:**
```bash
# Button click on Screen 0
mosquitto_pub -t "pfx/screen0/effects/trigger" -m '{"file": "/media/button_click.wav"}'

# Alert sound on Screen 1
mosquitto_pub -t "pfx/screen1/effects/trigger" -m '{"file": "/media/alert.wav"}'

# Notification on headphones
mosquitto_pub -t "pfx/headphones/effects/trigger" -m '{"file": "/media/notification.wav"}'
```

**Speech with Background Ducking:**
```bash
# Speech on Screen 0 with background music ducking
mosquitto_pub -t "pfx/screen0/speech/say" -m '{"file": "/media/instructions.mp3", "duckBackground": true, "duckLevel": 20}'
```

## Screen/Media Commands

Screen devices handle image display, video playback, and audio playback.

### Queue Inspection

* `videoQueue`
  Return current video queue. Publishes an event with field `video_queue` (array of pending media filenames).

* `speechQueue`
  Return current speech queue. Publishes an event with field `speech_queue` (array of pending speech file paths).

### Screen Power Management

* `sleepScreen`
  Turn off the display (monitor goes to sleep). Publishes event `screen_sleep`.

* `wakeScreen`
  Wake the display (monitor on). Publishes event `screen_wake`.

### System Control

* `reboot`
  Reboot the host machine running PFX (requires sudo privileges). Publishes `command_completed` event.

* `shutdown`
  Shutdown the host machine running PFX immediately (requires sudo privileges). Publishes `command_completed` event.

* `killPfx`
  Gracefully terminate the PFX process via SIGTERM. Publishes `command_completed` event.

### Image Commands

#### setImage

Display an image on the screen.

**Format:**

```json
{
  "command": "setImage",
  "image": "image.jpg"
}
```

**Parameters:**

- `Image` (required): Filename or subdirectory path relative to device MEDIA_DIR
- Supported formats: JPEG, PNG, GIF, BMP, TIFF, WebP

**Examples:**

```json
{
  "command": "setImage",
  "image": "lobby.jpg"
}
```

```json
{
  "command": "setImage",
  "image": "backgrounds/lobby.jpg"
}
```

**Note:** Image paths are relative to the device's configured MEDIA_DIR. For example, if MEDIA_DIR is `/opt/media/room1/`, then "lobby.jpg" resolves to `/opt/media/room1/lobby.jpg` and "backgrounds/lobby.jpg" resolves to `/opt/media/room1/backgrounds/lobby.jpg`.

### Video Commands

#### playVideo

Play a video file with optional volume control and background ducking.

**Format:**

```json
{
  "command": "playVideo",
  "video": "intro.mp4",
  "volumeAdjust": -10,
  "ducking": -24
}
```

**Parameters:**

- `Video` (required): Filename or subdirectory path relative to device MEDIA_DIR
- `VolumeAdjust` (optional): Volume adjustment percentage (-100 to +100), applied to device base VOLUME setting
- `Channel` (optional): Audio channel routing
- `Ducking` (optional): Background music volume reduction in units. Use negative values only (e.g., -24 to reduce by 24 units). Default: -24 for videos, 0 for images. Positive values are ignored with warning.

**Supported formats:** MP4, AVI, MKV, MOV, WebM

**Examples:**

```json
{
  "command": "playVideo",
  "video": "intro.mp4"
}
```

```json
{
  "command": "playVideo",
  "video": "room1/intro.mp4",
  "volumeAdjust": 20,
  "ducking": -30
}
```

**Note:** Video paths are relative to the device's MEDIA_DIR. VolumeAdjust modifies the base VOLUME setting from the device configuration. For example, if device VOLUME is 80 and VolumeAdjust is -10, the effective volume will be 72 (80 * 0.90).

#### stopVideo

Stop current video playback.

**Format:**

```json
{
  "command": "stopVideo"
}
```

#### pauseVideo

Pause current video playback.

**Format:**

```json
{
  "command": "pauseVideo"
}
```

#### resumeVideo

Resume paused video playback.

**Format:**

```json
{
  "command": "resumeVideo"
}
```

#### skipVideo

Skip to next video in playlist while preserving paused state if needed.

**Format:**

```json
{
  "command": "skipVideo"
}
```

#### pauseAll

Pause all media playback (video and audio).

**Format:**

```json
{
  "command": "pauseAll"
}
```

#### resumeAll

Resume all paused media playback (video and audio).

### Browser/Clock Commands

Generic browser control to show/hide a Chromium-based UI (e.g., the clock at http://localhost/clock/). These commands are zone-aware and will target the screen zone’s display.

#### enableBrowser

Launch the browser on the target screen and optionally focus it.

Format:

```json
{
  "command": "enableBrowser",
  "url": "http://localhost/clock/",
  "screen": 1,
  "focus": true
}
```

Parameters:
- url (optional): Page to open. Default: http://localhost/clock/
- screen (optional): Screen index or identifier; if omitted, use zone’s configured screen.
- focus (optional): Bring window to front. Default: true.

#### disableBrowser

Terminate the browser instance managed by this zone.

Format:

```json
{ "command": "disableBrowser" }
```

#### showBrowser

Bring the browser to the front. Optionally apply a fade effect via the page’s MQTT API.

Format:

```json
{
  "command": "showBrowser",
  "effect": "fade"
}
```

Parameters:
- effect (optional): "fade" | "instant" (default: "fade"). When "fade", publishes `{ "command": "fadeIn" }` to `paradox/houdini/clock/commands`.

#### hideBrowser

Hide the browser and return focus to MPV. Optionally apply a fade-out effect.

Format:

```json
{
  "command": "hideBrowser",
  "effect": "fade"
}
```

Parameters:
- effect (optional): "fade" | "instant" (default: "fade"). When "fade", publishes `{ "command": "fadeout" }` to `paradox/houdini/clock/commands` before switching back.

#### setBrowserUrl

Update the URL. If the browser is running, it will relaunch or navigate accordingly; otherwise it’s stored for the next `enableBrowser`.

Format:

```json
{
  "command": "setBrowserUrl",
  "url": "http://localhost/clock/?theme=dark"
}
```

#### setBrowserKeepAlive

Enable or disable auto-restart of the browser if it exits.

Format:

```json
{
  "command": "setBrowserKeepAlive",
  "enabled": true
}
```

#### browserStatus (optional)

Request current browser status. Zone publishes status to its status topic including fields like `running`, `url`, `windowClass`, and `keepAlive`.

Format:

```json
{ "command": "browserStatus" }
```

**Format:**

```json
{
  "command": "resumeAll"
}
```

### Screen Power Management Commands

ParadoxFX provides intelligent screen power management that balances energy efficiency with responsive operation.

#### sleepScreen

Put all connected displays into low-power sleep mode using DPMS (Display Power Management Signaling).

**Format:**

```json
{
  "command": "sleepScreen"
}
```

**Behavior:**
- **Screen zones only**: Sends DPMS sleep signal to the target monitor for this zone
- **Audio zones**: Command is ignored (no screen to control)
- **Video playback restriction**: Sleep commands are ignored while video is actively playing
- Sleep is only applied when video is paused or an image is displayed
- Maintains system state and media queues
- Display will show "No Signal" or enter standby mode

**Examples:**

```json
{
  "command": "sleepScreen"
}
```

#### wakeScreen

Wake the zone's display from sleep mode and restore default display state.

**Format:**

```json
{
  "command": "wakeScreen"
}
```

**Behavior:**
- **Screen zones only**: Sends DPMS wake signal to the target monitor for this zone
- **Audio zones**: Command is ignored (no screen to control)
- Display returns to active state immediately
- If no media is currently playing, display shows the configured default image

**Examples:**

```json
{
  "command": "wakeScreen"
}
```

**Note:** Most media commands (`setImage`, `playVideo`) automatically wake sleeping displays, making explicit `wakeScreen` commands typically unnecessary during normal operation. Sleep commands are ignored during active video playbook to prevent interruption.

### Browser Management Commands

ParadoxFX supports browser integration for displaying web content alongside multimedia. Browser management provides **pure window focus control** with **process lifecycle management**.

#### enableBrowser

⚠️ **Launch browser process in foreground**. Browser will be visible until manually hidden.

```json
{
  "command": "enableBrowser",
  "url": "http://localhost/clock/"
}
```

**Parameters:**
- `url` (optional): Initial URL to load (default: `http://localhost/clock/`)

**Behavior:** 
- Launches Chromium process with specified URL
- ⚠️ **Browser window appears in foreground initially**
- Must manually send `hideBrowser` after page loads (typically 10 seconds)
- Uses isolated profile: `/tmp/pfx-browser-{zoneName}/`

> **💡 Scheduling Tip**: To launch hidden, send `enableBrowser` followed by `hideBrowser` with a 10-second delay to allow page loading.

#### disableBrowser

Terminate browser process and clean up all resources.

```json
{
  "command": "disableBrowser"
}
```

**Behavior:**
- Terminates browser process completely
- Cleans up temporary profile directory
- Returns focus to MPV content

#### showBrowser

**Pure window management**: Bring browser window to front using window focus switching.

```json
{
  "command": "showBrowser"
}
```

**Behavior:**
- Uses `xdotool windowactivate` to bring browser to front
- MPV window is pushed behind browser
- **No fade effects or clock commands** - pure window layering
- Browser must be enabled first with `enableBrowser`

#### hideBrowser

**Pure window management**: Return focus to MPV by bringing MPV window to front.

```json
{
  "command": "hideBrowser"
}
```

**Behavior:**
- Uses `xdotool windowactivate` to bring MPV to front
- Browser window is pushed behind MPV (still running, just hidden)
- **No fade effects or clock commands** - pure window layering
- Browser process continues running in background

#### setBrowserUrl

Update browser URL (will relaunch browser if running).

```json
{
  "command": "setBrowserUrl",
  "url": "https://www.example.com"
}
```

**Parameters:**
- `url` (required): New URL to load

#### setBrowserKeepAlive

Enable/disable automatic browser restart on crash.

```json
{
  "command": "setBrowserKeepAlive",
  "enabled": true
}
```

**Parameters:**
- `enabled` (required): Boolean flag for keep-alive behavior

### Browser Window Management Architecture

Browser management provides **pure window focus control** with clear separation of concerns:

**Process Lifecycle:**
- `enableBrowser`: Launch browser process (⚠️ **visible in foreground initially**)
- `disableBrowser`: Terminate browser process completely

**Window Focus Control:**
- `showBrowser`: Bring browser window to front (pure window management)
- `hideBrowser`: Bring MPV window to front (pure window management)

**Key Design Principles:**
- **No automatic fade effects**: show/hide commands perform only window switching
- **⚠️ Foreground launch**: enableBrowser starts browser visible in foreground - manually hide after page loads
- **External fade control**: Clock fade effects managed separately via clock MQTT commands
- **Proven technique**: Uses Option 6 (`xdotool windowactivate`) for reliable window switching

> **📝 Note**: `enableBrowser` will launch the browser in front. If you want it hidden, you must send a `hideBrowser` command manually after the page has finished loading. Generally, 10 seconds should be more than enough for most pages if you want to schedule a `hideBrowser` command to be sent after the `enableBrowser` command.

**Clock Integration (Separate):**
If you want clock fade effects with browser switching, send separate commands:

```bash
# Manual fade sequence example
mosquitto_pub -t "paradox/houdini/clock/commands" -m '{"command": "fadeOut"}'
mosquitto_pub -t "paradox/zone1/commands" -m '{"command": "showBrowser"}'
mosquitto_pub -t "paradox/houdini/clock/commands" -m '{"command": "fadeIn"}'
```
4. Update zone status with focus and content tracking

**Clock MQTT Topic**: `paradox/houdini/clock/commands`

**Status Reporting**: Browser status is included in zone status updates:

```json
{
  "focus": "chromium",
  "content": "http://localhost/clock/",
  "browser": {
    "enabled": true,
    "url": "http://localhost/clock/",
    "process_id": 12345,
    "window_id": "0x123456"
  }
}
```

#### skip

Skip to next video in queue.

**Format:**

```json
{
  "command": "skip"
}
```

### Audio Commands

#### playAudio

Play an audio file with optional volume control.

**Format:**

```json
{
  "command": "playAudio",
  "audio": "background.mp3",
  "volumeAdjust": -20
}
```

**Parameters:**

- `Audio` (required): Filename or subdirectory path relative to device MEDIA_DIR
- `VolumeAdjust` (optional): Volume adjustment percentage (-100 to +100), applied to device base VOLUME setting
- `Channel` (optional): Audio channel routing

**Supported formats:** MP3, WAV, FLAC, OGG, AAC, OPUS

**Examples:**

```json
{
  "command": "playAudio",
  "audio": "ambient.mp3"
}
```

```json
{
  "command": "playAudio",
  "audio": "music/background.mp3",
  "volumeAdjust": 15
}
```

**Note:** Audio paths are relative to the device's MEDIA_DIR. VolumeAdjust modifies the base VOLUME setting from the device configuration.

#### playAudioFx

Play audio effects (supports polyphonic playback).

**Format:**

```json
{
  "command": "playAudioFx",
  "audio": "effects/explosion.wav",
  "type": "one-shot",
  "volumeAdjust": 10
}
```

**Parameters:**

- `Audio` (required): Filename or subdirectory path relative to device MEDIA_DIR
- `Type` (optional): Playback type ("one-shot", "loop"), default: "one-shot"
- `VolumeAdjust` (optional): Volume adjustment percentage (-100 to +100), applied to device base VOLUME setting

**Examples:**

```json
{
  "command": "playAudioFx",
  "audio": "doorbell.wav"
}
```

```json
{
  "command": "playAudioFx",
  "audio": "fx/ambient_loop.wav",
  "type": "loop",
  "volumeAdjust": -30
}
```

## Multi-Zone Audio Commands

Multi-zone audio devices support three distinct audio types with advanced management capabilities. Audio zones are configured with device aliases (hdmi, analog, etc.) and can output to multiple devices simultaneously.

### Topic Structure for Audio Zones

```
paradox/zone1/audio/commands    # Commands to audio zone 1
paradox/zone1/audio/status     # Status from audio zone 1
```

### Background Music Commands

#### playMusic

Start background music with automatic volume ducking during speech.

**Format:**

```json
{
  "command": "playMusic",
  "file": "ambient.mp3",
  "volume": 60,
  "loop": true
}
```

**Parameters:**

- `File` (required): Music file relative to zone's background_music_dir
- `Volume` (optional): Volume level 0-100, default: 70
- `Loop` (optional): Whether to loop the music, default: true
- `FadeIn` (optional): Fade-in duration in seconds, default: 2

#### stopMusic

Stop background music with optional fade-out.

**Format:**

```json
{
  "command": "stopMusic",
  "FadeOut": 3
}
```

**Parameters:**

- `FadeOut` (optional): Fade-out duration in seconds, default: 2

### Speech/Narration Commands

#### playSpeech

Play speech audio with automatic background music ducking.

**Format:**

```json
{
  "command": "playSpeech",
  "file": "hint1.wav",
  "volume": 85,
  "Priority": "high"
}
```

**Parameters:**

- `File` (required): Speech file relative to zone's speech_dir
- `Volume` (optional): Volume level 0-100, default: 80
- `Priority` (optional): Queue priority ("low", "normal", "high"), default: "normal"
- `DuckLevel` (optional): Background music duck level 0-100, default: 30

#### clearSpeechQueue

Clear all queued speech audio.

**Format:**

```json
{
  "command": "clearSpeechQueue"
}
```

### Sound Effects Commands

#### playEffect

Play fire-and-forget sound effect with low latency.

**Format:**

```json
{
  "command": "playEffect",
  "file": "click.wav",
  "volume": 75,
  "Preload": true
}
```

**Parameters:**

- `File` (required): Effect file relative to any configured media directory
- `Volume` (optional): Volume level 0-100, default: 80
- `Preload` (optional): Whether to use preloaded effect, default: false
- `Overlap` (optional): Allow overlapping with other effects, default: true

#### stopAllEffects

Stop all currently playing sound effects.

**Format:**

```json
{
  "command": "stopAllEffects"
}
```

### Zone Management Commands

#### setZoneVolume

Set master volume for the entire audio zone.

**Format:**

```json
{
  "command": "setZoneVolume",
  "volume": 70
}
```

**Parameters:**

- `Volume` (required): Master volume level 0-100

#### getZoneStatus

Request current status of the audio zone.

**Format:**

```json
{
  "command": "getZoneStatus"
}
```

**Response includes:**

- Background music status and current file
- Speech queue length and current item
- Active sound effects count
- Zone volume and device status
- Audio device availability and aliases
```

#### stopAudio

Stop all audio playback (background music and speech).

**Format:**

```json
{
  "command": "stopAudio"
}
```

#### pauseAudio

Pause all audio playback (background music and speech).

**Format:**

```json
{
  "command": "pauseAudio"
}
```

#### resumeAudio

Resume all paused audio playback (background music and speech).

**Format:**

```json
{
  "command": "resumeAudio"
}
```

#### stopAllAudioFx

Stop all audio effects playback.

**Format:**

```json
{
  "command": "stopAllAudioFx"
}
```

#### playBackground

Play background music with seamless looping and volume control.

**Format:**

```json
{
  "command": "playBackground",
  "audio": "ambient/forest.mp3",
  "volume": 70
}
```

**Parameters:**

- `Audio` (required): Filename or subdirectory path relative to device MEDIA_DIR
- `Volume` (optional): Volume level (0-100), defaults to device configuration

**Features:**
- Seamless looping for continuous playback
- Real-time volume control for ducking during speech
- Persistent playback instance for smooth audio experience

**Examples:**

```json
{
  "command": "playBackground",
  "audio": "ambient.mp3"
}
```

```json
{
  "command": "playBackground",
  "audio": "music/mystical.mp3",
  "volume": 60
}
```

#### pauseBackground

Pause background music playback.

**Format:**

```json
{
  "command": "pauseBackground"
}
```

#### resumeBackground

Resume background music playback.

**Format:**

```json
{
  "command": "resumeBackground"
}
```

#### stopBackground

Stop background music playback.

**Format:**

```json
{
  "command": "stopBackground"
}
```

#### setBackgroundMusicVolume

Set background music volume in real-time.

**Format:**

```json
{
  "command": "setBackgroundMusicVolume",
  "volume": 40
}
```

**Parameters:**

- `Volume` (required): Volume level (0-100)

**Use case:** Perfect for ducking background music during speech without stopping playback.

#### playSpeech

Play speech audio with automatic background music ducking.

**Format:**

```json
{
  "command": "playSpeech",
  "audio": "voice/instructions.mp3",
  "volume": 90,
  "ducking": -26
}
```

**Parameters:**

- `Audio` (required): Filename or subdirectory path relative to device MEDIA_DIR
- `Volume` (optional): Volume level (0-100), defaults to device configuration
- `Ducking` (optional): Background music volume reduction in units. Use negative values only (e.g., -26 to reduce by 26 units). Default: -26. Positive values are ignored with warning.

**Features:**
- Automatic background music ducking during speech
- Queue-based system for multiple speech items
- Automatic volume restoration after speech completion

**Examples:**

```json
{
  "command": "playSpeech",
  "audio": "hints/clue1.mp3"
}
```

```json
{
  "command": "playSpeech",
  "audio": "narration/intro.mp3",
  "volume": 95,
  "ducking": 70
}
```

#### clearSpeechQueue

Clear all queued speech audio and stop current speech.

**Format:**

```json
{
  "command": "clearSpeechQueue"
}
```

#### pauseSpeech

Pause current speech playback.

**Format:**

```json
{
  "command": "pauseSpeech"
}
```

#### resumeSpeech

Resume current speech playback.

**Format:**

```json
{
  "command": "resumeSpeech"
}
```

#### stopSpeech

Stop current speech (continue processing queue).

**Format:**

```json
{
  "command": "stopSpeech"
}
```

#### skipSpeech

Skip current speech and move to next in queue.

**Format:**

```json
{
  "command": "skipSpeech"
}
```

#### playSoundEffect

Play sound effects with ultra-low latency and parallel playback.

**Format:**

```json
{
  "command": "playSoundEffect",
  "audio": "effects/button_click.wav",
  "volume": 100
}
```

**Parameters:**

- `Audio` (required): Filename or subdirectory path relative to device MEDIA_DIR
- `Volume` (optional): Volume level (0-100), defaults to device configuration

**Features:**
- Sub-50ms latency for instant feedback
- Multiple effects can play simultaneously
- Fire-and-forget operation for maximum performance
- Optimized for button clicks, alerts, and UI feedback

**Examples:**

```json
{
  "command": "playSoundEffect",
  "audio": "fx/click.wav"
}
```

```json
{
  "command": "playSoundEffect",
  "audio": "feedback/success.wav",
  "volume": 80
}
```

### Advanced Commands

#### transition

Play a video followed by an image.

**Format:**

```json
{
  "command": "transition",
  "video": "transitions/intro.mp4",
  "image": "backgrounds/final.jpg",
  "channel": "default"
}
```

**Parameters:**

- `Video` (required): Video filename or subdirectory path relative to device MEDIA_DIR
- `Image` (required): Image filename or subdirectory path relative to device MEDIA_DIR
- `Channel` (optional): Audio channel routing

**Example:**

```json
{
  "command": "transition",
  "video": "intro.mp4",
  "image": "lobby.jpg"
}
```

#### stopAll

Stop all media playback (video, audio, effects).

**Format:**

```json
{
  "command": "stopAll"
}
```

### Queue Management

#### videoQueue

Get current video queue status.

**Format:**

```json
{
  "command": "videoQueue"
}
```

#### audioQueue

Get current audio queue status.

**Format:**

```json
{
  "command": "audioQueue"
}
```

#### clearQueue

Clear video or audio queue (context-dependent).

**Format:**

```json
{
  "command": "clearQueue"
}
```

### Configuration

#### getConfig

Get current device configuration.

**Format:**

```json
{
  "command": "getConfig"
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
  "command": "setColor",
  "color": "#FF6400",
  "brightness": 75
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
  "command": "on",
  "brightness": 100
}
```

#### off

Turn light off.

**Format:**

```json
{
  "command": "off"
}
```

### Light Group Control

#### setGroupColor

Set color for all lights in group.

**Format:**

```json
{
  "command": "setGroupColor",
  "color": {"r": 255, "g": 100, "b": 0},
  "brightness": 80,
  "lights": ["light1", "light2"]
}
```

#### fade

Fade lights to target brightness over time.

**Format:**

```json
{
  "command": "fade",
  "brightness": 50,
  "duration": 30000
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
  "command": "on"
}
```

#### off

Turn relay off.

**Format:**

```json
{
  "command": "off"
}
```

#### toggle

Toggle relay state.

**Format:**

```json
{
  "command": "toggle"
}
```

#### pulse

Pulse relay (on, then off after delay).

**Format:**

```json
{
  "command": "pulse",
  "duration": 5000
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
  "application": "pfx",
  "device_name": "media-controller-01",
  "ip_address": "192.168.1.150",
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
mosquitto_pub -h localhost -t "paradox/living-room/screen/commands" \
  -m '{"command": "setImage", "image": "background.jpg"}'
```

2. **Play intro video:**

```bash
mosquitto_pub -h localhost -t "paradox/living-room/screen/commands" \
  -m '{"command": "playVideo", "video": "intro.mp4", "volumeAdjust": -20}'
```

3. **Play background music:**

```bash
mosquitto_pub -h localhost -t "paradox/living-room/screen/commands" \
  -m '{"command": "playAudio", "audio": "ambient.mp3", "volumeAdjust": -40}'
```

4. **Stop all playback:**

```bash
mosquitto_pub -h localhost -t "paradox/living-room/screen/commands" \
  -m '{"command": "stopAll"}'
```

### Light Control Sequence

1. **Turn on lights:**

```bash
mosquitto_pub -h localhost -t "paradox/living-room/lights/commands" \
  -m '{"command": "on", "brightness": 100}'
```

2. **Set warm color:**

```bash
mosquitto_pub -h localhost -t "paradox/living-room/lights/commands" \
  -m '{"command": "setColor", "color": "#FF8C00", "brightness": 75}'
```

3. **Fade to dim:**

```bash
mosquitto_pub -h localhost -t "paradox/living-room/lights/commands" \
  -m '{"command": "fade", "brightness": 25, "duration": 10000}'
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

Device topics are configured in `pfx.ini`:

```ini
[global]
device_name = media-controller-01
heartbeat_topic = paradox/devices
heartbeat_interval = 30000

[screen:living-room]
type = screen
topic = paradox/living-room/screen
status_topic = paradox/living-room/screen/status
media_dir = /opt/media/living-room
volume = 80

[light:living-room-hue]
type = light
topic = paradox/living-room/lights
controller = hue
```

**Key Configuration Parameters:**

- `device_name`: Unique device identifier included in heartbeat messages
- `media_dir`: Base directory for media files (images, videos, audio)
- `volume`: Base volume level for the device (0-100)

For complete configuration options, see the [Configuration Guide](CONFIGURATION.md).
