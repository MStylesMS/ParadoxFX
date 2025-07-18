# ParadoxFX Multi-Platform Media Control System

## Overview

ParadoxFX (formerly ImageSwitcher) is a comprehensive Node.js application designed to control multi-zone media playback, lighting, and automation devices via MQTT commands. Originally designed for Raspberry Pi single-screen installations, it has evolved to support multiple hardware platforms with advanced multi-zone audio/video capabilities for interactive installations, escape rooms, theaters, and immersive experiences.

## Terminology

- **Physical Device**: The actual hardware running the application (e.g., Raspberry Pi 4, Linux PC)
- **Soft Device/Zone**: Individual controllable endpoints within a physical device (e.g., HDMI-0 port, HDMI-1 port, headphone jack)
- **Multi-Zone**: Multiple independent soft devices operating simultaneously on one physical device
- **Enhanced Audio System**: Three-subsystem architecture (Background Music, Sound Effects, Speech/Narration)

## Supported Hardware Platforms

ParadoxFX supports multiple hardware platforms with optimized configurations for each:

- **Raspberry Pi 3 Model B/B+**: Single HDMI plus headphone jack
- **Raspberry Pi Zero W**: Mini HDMI only
- **Raspberry Pi 4 Model B**: Dual HDMI plus headphone jack
- **Raspberry Pi 5**: Dual HDMI (no analog audio)
- **Generic Linux Machines**: Scalable multi-display configurations

For detailed hardware specifications, performance characteristics, and use cases, see [Appendix A: Hardware Platform Details](#appendix-a-hardware-platform-details).

## Features

### 1. Enhanced Multi-Zone Audio System

ParadoxFX features a comprehensive three-subsystem audio architecture designed for professional installations:

#### **Background Music Subsystem**
- **Purpose**: Continuous ambient audio with seamless looping
- **Management**: Persistent MPV instance with IPC control
- **Features**: Real-time volume control, automatic ducking during speech
- **Latency**: Optimized for smooth transitions and volume changes
- **Use Cases**: Ambient soundscapes, atmospheric music, environmental audio

#### **Sound Effects Subsystem**  
- **Purpose**: Short-duration responsive effects
- **Management**: Fire-and-forget MPV instances for parallel playback
- **Features**: <50ms latency, overlapping effects, instant triggering
- **Performance**: Optimized with --audio-buffer=0.02 --cache=no
- **Use Cases**: Button clicks, alerts, feedback sounds, impact effects

#### **Speech/Narration Subsystem**
- **Purpose**: Voice instructions, hints, and narration
- **Management**: Queue-based system with automatic background music coordination
- **Features**: Automatic ducking, queue management, priority handling
- **Integration**: Coordinates with background music for seamless audio experience
- **Use Cases**: Guided instructions, hints, character voices, announcements

### 2. Multi-Platform Media Playback

- **Image Display:**
  - Full-screen image display using MPV exclusively
  - Hardware-accelerated rendering with platform-specific optimizations
  - Seamless integration with video playback through single MPV instance per zone
- **Video Playback:**
  - Hardware-accelerated video using MPV with platform-specific optimizations
  - Multi-zone support on Pi4/Pi5 with independent video streams per soft device
  - Single MPV instance per zone for seamless media transitions
- **Audio Routing:**
  - Independent audio device targeting per zone using PipeWire (default) or PulseAudio
  - Simultaneous multi-zone audio with different content per soft device
  - Platform-specific device identifiers optimized for PipeWire/PulseAudio compatibility

### 3. Platform Configuration Templates

Pre-configured .ini templates for each supported platform:

- **pfx-pi3.ini**: Single-zone Pi3 optimized configuration
- **pfx-pi0w.ini**: Low-power Pi Zero W configuration  
- **pfx-pi4.ini**: Dual-zone Pi4 with all audio options
- **pfx-pi5.ini**: Enhanced Pi5 dual-zone configuration
- **pfx-linux.ini**: Generic Linux multi-zone setup

#### **Seamless Media Transitions**

ParadoxFX provides professional-grade seamless transitions using a single MPV instance per zone with IPC control:

- **Image-to-Video Transitions:**
  - Single MPV instance loads image and pauses on first frame
  - IPC commands seamlessly switch to video playback without application restart
  - Hardware-accelerated transitions minimize visible interruption
  - Zone-specific control allows independent transitions per soft device

- **Video-to-Image Transitions:**
  - Video automatically pauses on last frame using `--keep-open=yes`
  - IPC commands load next image while maintaining MPV session
  - Smart queue management determines whether to pause or continue to next media
  - Multi-zone support allows independent media flows per soft device

- **Audio Coordination:**
  - Background music subsystem continues seamlessly during visual transitions
  - Sound effects can trigger precisely with visual changes via IPC timing
  - Speech subsystem coordinates with media transitions for narrative flow

### 4. Advanced Media Queuing and Control

- **Queueing:**
  - Video and audio commands are queued (FIFO). When the queue is full, the oldest item is dropped.
  - Duplicate media (by name) is not added to the queue. Audio effects (FX) are played immediately.
- **Stop Commands:**
  - `stopVideo`, `stopAudio`, `stopAllAudioFx`, and `stopAll` commands immediately stop playback and clear queues as appropriate.
- **Transition Behavior:**
  - Videos automatically pause on the last frame using MPV's `--keep-open=yes` option
  - If no additional media is queued, video remains paused on final frame
  - If media is queued, seamless transition occurs via IPC commands
  - Queue management determines whether to hold final frame or continue playback flow

### 5. Enhanced MQTT Integration

- **Multi-Zone Command Routing:**
  - Zone-specific topic structures for independent control
  - Broadcast commands for synchronized multi-zone operations
  - Device-specific command validation and routing

- **Advanced Audio Commands:**
  - `playBackgroundMusic`: Start background music with volume control
  - `playSoundEffect`: Trigger low-latency sound effects  
  - `playSpeech`: Queue speech with automatic background music ducking
  - `setBackgroundMusicVolume`: Real-time volume adjustment
  - `clearSpeechQueue`: Immediate speech queue management

- **Enhanced Status Reporting:**
  - Real-time audio subsystem status (background music, effects, speech queue)
  - Multi-zone device health and performance monitoring
  - Audio latency and performance metrics
  - Platform-specific hardware status reporting

- **Configuration Management:**
  - Runtime configuration updates via MQTT
  - Device discovery and capability reporting
  - Remote logging and debugging capabilities

### 6. Comprehensive Device Configuration

Platform-optimized configurations are provided as templates for each supported hardware platform. All device configurations are stored in a single `pfx.ini` file using section-based format:

- Single INI file contains all device types (screens, lights, relays, audio zones)
- Each device gets its own section with platform-specific optimizations
- All devices share a single MQTT broker connection with intelligent routing
- Enhanced audio system configuration with three-subsystem architecture

#### **Example: Raspberry Pi 4 Dual-Zone Configuration**

```ini
[mqtt]
broker = localhost
port = 1883
client_id = pfx-pi4-01

[global]
log_level = info
media_base_path = /opt/media
max_concurrent_videos = 2
enable_hardware_acceleration = true

# Zone 1 - HDMI-0 with enhanced audio
[screen:zone1-hdmi0]
type = screen
topic = paradox/zone1/screen
display = :0
xinerama_screen = 0
audio_device = pulse/alsa_output.platform-fef00700.hdmi.hdmi-stereo
background_music_volume = 70
effects_volume = 100
speech_volume = 90
mpv_video_options = --hwdec=auto --vo=gpu --profile=gpu-hq

# Zone 2 - HDMI-1 with independent audio
[screen:zone2-hdmi1] 
type = screen
topic = paradox/zone2/screen
display = :0
xinerama_screen = 1
audio_device = pulse/alsa_output.platform-fef05700.hdmi.hdmi-stereo
background_music_volume = 70
effects_volume = 100
speech_volume = 90

# Lighting integration
[light:zone1-main]
type = light
topic = paradox/zone1/lights/main
controller = hue
bridge_ip = 192.168.1.100

[controller:hue]
type = hue
bridge_ip = 192.168.1.100
bridge_username = your-hue-username
```

### 7. Enhanced Architecture

- **Multi-Platform Application**: Adapts to hardware capabilities across Pi3, Pi4, Pi5, and Linux
- **Shared MQTT Broker**: All devices and zones use intelligent connection multiplexing  
- **Enhanced Audio Manager**: Three-subsystem audio architecture with MPV-based playback
- **Hardware Optimization**: Platform-specific performance tuning and hardware acceleration
- **Modular Device System**: Extensible framework for screens, lights, relays, and custom devices
- **Real-time Coordination**: Subsystem coordination for seamless multi-zone experiences
- **Device Routing**: Commands are automatically routed to correct device handlers based on MQTT topic
- **Audio Integration**: Audio effects are tied to specific screen devices
- **External API Placeholders**: Framework includes placeholders for Hue, WiZ, Zigbee, and Z-Wave controllers

### 6. Status and Error Reporting

**Soft Device (Zone) Reporting**: Each soft device listens for commands on its configured MQTT command topic and publishes two types of messages to its status topic:

1. **State Updates**: Published whenever soft device state changes

   ```json
   {
     "timestamp": "2025-07-03T10:30:00Z",
     "device": "zone1-hdmi0",
     "type": "state",
     "status": "playing_video",
     "current_media": "video1.mp4",
     "queue_length": 2
   }
   ```

2. **Problem Reports**: Published when warnings or errors occur specific to that soft device

   ```json
   {
     "timestamp": "2025-07-03T10:30:00Z",
     "device": "zone1-hdmi0", 
     "type": "error",
     "error_code": "MEDIA_NOT_FOUND",
     "message": "File video1.mp4 not found in media directory",
     "source_topic": "paradox/zone1/screen/command"
   }
   ```

**Physical Device Heartbeat**: The physical device publishes comprehensive status to a heartbeat topic:

```json
{
  "timestamp": "2025-07-03T10:30:00Z",
  "device_name": "pi4-controller-01", 
  "hostname": "paradox-pi4",
  "ip_address": "192.168.1.100",
  "uptime": 86400000,
  "cpu_usage": 15.2,
  "gpu_usage": 8.5,
  "memory_usage": 45.8,
  "gpu_temp": 42.1,
  "cpu_temp": 38.7,
  "state": "running",
  "zones_active": 2,
  "zones_idle": 0
}
```

### 7. Framework Provisions

- **Effect Macros**: Framework structure for lighting effects (FADE, BLINK, etc.) to be implemented later
- **Process Managers**: Framework for managing external media player instances (up to 8 concurrent) to be implemented later
- **External Controllers**: Placeholder classes for Hue, WiZ, Zigbee, and Z-Wave integrations

### 8. Media Player Support

ParadoxFX uses MPV exclusively for all media playback:

- **MPV Integration**: Single media player for images, video, and audio
- **IPC Control**: JSON-based socket communication for real-time control
- **Hardware Acceleration**: Platform-specific optimization (GPU decode, etc.)
- **Audio System Integration**: PipeWire (default) and PulseAudio support
- **Multi-Instance**: Independent MPV process per soft device/zone

### 9. Testing

- **Unit Tests**: Included with actual MQTT message testing against localhost broker
- **Integration Tests**: Test external media player wrappers with mock implementations
- **Configuration Tests**: Validate INI file parsing and device initialization

For detailed project structure and file organization, see [Appendix B: Project Structure](#appendix-b-project-structure).

---

## Appendix A: Hardware Platform Details

### **Raspberry Pi 3 Model B/B+**
- **Video Output**: Single HDMI (1920x1080@60fps)
- **Audio Output**: HDMI audio, 3.5mm headphone jack
- **Performance**: Single zone, hardware-accelerated H.264 playback
- **Memory**: 1GB RAM (GPU: 64MB recommended)
- **Use Case**: Single-screen installations with basic audio

### **Raspberry Pi Zero W**
- **Video Output**: Mini HDMI (1920x1080@30fps)  
- **Audio Output**: HDMI audio only
- **Performance**: Lightweight single zone, optimized for low power
- **Memory**: 512MB RAM (GPU: 64MB maximum)
- **Use Case**: Compact installations, digital signage

### **Raspberry Pi 4 Model B (2GB/4GB/8GB)**
- **Video Output**: Dual HDMI (HDMI-0, HDMI-1) up to 4K@60fps each
- **Audio Output**: Independent HDMI audio per port, 3.5mm headphone jack
- **Performance**: Dual-zone with hardware acceleration
- **Memory**: 2-8GB RAM (GPU: 128-256MB recommended)
- **Use Case**: Multi-zone installations, escape rooms with multiple screens

### **Raspberry Pi 5 (4GB/8GB)**
- **Video Output**: Dual HDMI (HDMI-0, HDMI-1) up to 4K@60fps each
- **Audio Output**: Independent HDMI audio per port (no analog audio)
- **Performance**: Enhanced dual-zone with improved GPU
- **Memory**: 4-8GB RAM (GPU: 256-512MB recommended) 
- **Use Case**: High-performance multi-zone installations

### **Generic Linux Machines**
- **Video Output**: Multiple displays via GPU configuration
- **Audio Output**: System audio devices (PulseAudio/PipeWire)
- **Performance**: Scalable based on hardware specifications
- **Memory**: 4GB+ RAM recommended
- **Use Case**: Large installations, server-based deployments

## Appendix B: Project Structure

```
/opt/paradox/apps/pfx/
├── pfx.js                          # Main application entry point
├── pfx.ini                         # Active configuration file
├── pfx-pi3.ini                     # Pi3 single-zone configuration
├── pfx-pi0w.ini                    # Pi Zero W configuration  
├── pfx-pi4.ini                     # Pi4 dual-zone configuration
├── pfx-pi5.ini                     # Pi5 enhanced dual-zone configuration
├── pfx-linux.ini                   # Generic Linux configuration
├── package.json
├── lib/
│   ├── core/
│   │   ├── device-manager.js       # Multi-zone device registry and router
│   │   ├── config-loader.js        # Enhanced INI parser with platform detection
│   │   ├── mqtt-client.js          # Intelligent MQTT connection management
│   │   └── message-router.js       # Multi-zone command routing
│   ├── devices/
│   │   ├── screen-device.js        # Enhanced screen device with AudioManager
│   │   ├── light-device.js         # Hue/WiZ/Zigbee light control
│   │   ├── light-group-device.js   # Synchronized light group management
│   │   └── relay-device.js         # Z-Wave/Zigbee relay control
│   ├── media/
│   │   ├── audio-manager.js        # Three-subsystem audio architecture
│   │   ├── media-player-factory.js # Platform-optimized player selection
│   │   ├── process-manager.js      # Multi-zone process coordination
│   │   ├── video-player.js         # Hardware-accelerated video playback
│   │   └── players/
│   │       ├── base-player.js      # Base class for all media players
│   │       └── mpv-player.js       # Primary MPV media player (images, video, audio)
│   ├── controllers/
│   │   ├── hue-controller.js       # Philips Hue bridge integration
│   │   ├── wiz-controller.js       # WiZ smart lighting
│   │   ├── zigbee-controller.js    # Zigbee coordinator management
│   │   └── zwave-controller.js     # Z-Wave network management
│   ├── effects/
│   │   └── effect-engine.js        # Multi-zone effect coordination
│   └── utils/
│       ├── logger.js               # Enhanced multi-zone logging
│       └── utils.js                # Platform detection and optimization
└── test/
    ├── unit/                       # Unit tests for individual components
    ├── integration/                # Multi-zone integration testing
    │   ├── audio-manager-auto.test.js     # Automated audio system tests
    │   ├── audio-manager.test.js          # Interactive audio system tests  
    │   ├── media-playback.test.js         # Media player integration tests
    │   └── mqtt-integration.test.js       # MQTT system integration tests
    ├── manual/                     # Platform-specific manual testing
    │   ├── config-pi-audio.js             # Pi audio configuration utility
    │   ├── test-audio.js                  # Comprehensive audio validation
    │   ├── test-dual-hdmi.js              # Pi4/Pi5 dual-HDMI validation
    │   ├── test-screens.js                # Multi-zone screen testing
    │   └── real-playback.test.js          # Real media playback validation
    ├── fixtures/
    │   └── test-media/             # Test audio/video/image files
    └── utils/
        └── loadTestConfig.js       # Test configuration management
```
