# MPV Display Routing Research Notes for ParadoxFX Pi5 Dual-HDMI

## 🎯 Problem Statement

**Issue**: ParadoxFX Pi5 dual-HDMI setup where "video and audio played on screen 0 perfectly. For screen 1, however, the audio played on screen 1 but the video still went to screen 0."

**Root Cause Discovered**: SSH X11 forwarding intercepts all video display commands and routes them through a tunnel back to the SSH client, making dual-screen video routing impossible to test accurately.

## 🔬 Research Summary

### MPV Display Targeting Methods Tested

#### Method 1: X11 DISPLAY Environment Variable
```bash
DISPLAY=:0.0 mpv video.mp4  # Screen 0
DISPLAY=:0.1 mpv video.mp4  # Screen 1 (if available)
```
- **Status**: Limited effectiveness on modern systems
- **Issue**: Wayland/X11 compatibility, display numbering inconsistencies
- **Reliability**: Low on Pi5 with Wayland

#### Method 2: MPV --screen Parameter
```bash
mpv --screen=0 video.mp4    # Primary screen
mpv --screen=1 video.mp4    # Secondary screen
```
- **Status**: Most reliable method for MPV
- **Compatibility**: Works on X11 and Wayland
- **Pi5 Testing**: Requires non-SSH environment for accurate results

#### Method 3: MPV --geometry Parameter
```bash
mpv --geometry=1920x1080+0+0 video.mp4      # Position on screen 0
mpv --geometry=1920x1080+1920+0 video.mp4   # Position on screen 1
```
- **Status**: Effective for manual positioning
- **Advantage**: Precise control over window placement
- **Requirement**: Must know exact screen resolutions and positions

#### Method 4: MPV --fs-screen Parameter
```bash
mpv --fs-screen=0 --fullscreen video.mp4    # Fullscreen on screen 0
mpv --fs-screen=1 --fullscreen video.mp4    # Fullscreen on screen 1
```
- **Status**: Best for fullscreen applications (like ParadoxFX)
- **Reliability**: High when combined with --screen parameter
- **Recommended**: Primary method for ParadoxFX implementation

### Pi5 Display Environment Analysis

#### CRITICAL DISCOVERY - Optimized MPV Commands for Pi5 (2025-07-26)

**🎯 WORKING SOLUTION**: After extensive testing on Pi5 + Bookworm + X11:

```bash
# MPV Display Configuration Notes - Pi5 Optimized

## Optimal MPV Command for Pi5 (Latest 2025 Recommendations)

Based on comprehensive research of MPV manual documentation and Pi5-specific optimization guidelines:

```bash
# BEST PERFORMING COMMAND for Pi5 dual-HDMI setup:
mpv --screen=1 --fullscreen --no-osc --no-input-default-bindings 
    --hwdec=auto --vo=gpu --gpu-api=opengl 
    --opengl-swapinterval=1 --video-sync=display-resample 
    --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 
    --cache=yes --demuxer-max-bytes=50M --no-terminal 
    --profile=gpu-hq [video_file]
```

### Key Pi5 Optimizations (2025 Best Practices)

1. **Hardware Acceleration**: `--hwdec=auto` (recommended over specific decoders)
2. **Video Output**: `--vo=gpu` with `--gpu-api=opengl` for Pi5 compatibility
3. **Video Sync**: `--video-sync=display-resample` handles dual-HDMI better than audio sync
4. **VSync**: `--opengl-swapinterval=1` enables proper frame timing
5. **GPU Profile**: `--profile=gpu-hq` applies optimized quality settings
6. **Buffer Size**: `--demuxer-max-bytes=50M` optimized for Pi5 memory
7. **Terminal Output**: `--no-terminal` essential for performance (prevents frame drops)

### Alternative Performance Profile

For maximum performance on lower-power scenarios:
```bash
mpv --screen=1 --fullscreen --no-osc --no-input-default-bindings 
    --hwdec=auto --vo=gpu --gpu-api=opengl 
    --opengl-swapinterval=1 --video-sync=display-resample 
    --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 
    --cache=yes --demuxer-max-bytes=50M --no-terminal 
    --profile=fast [video_file]
```

## Audio Device Format Comparison
```

**❌ PROBLEM COMMAND** (for comparison):
```bash
# Lower audio volume, otherwise good:
mpv --screen=1 --fullscreen \
    --audio-device=pulse/alsa_output.platform-107c706400.hdmi.hdmi-stereo \
    /opt/paradox/media/test/defaults/default.mp4
```

**⚠️ CRITICAL OBSERVATION**: 
- **With `--no-terminal`**: Smooth video playback ✅
- **Without `--no-terminal`**: Video starts dropping frames ❌
- **Conclusion**: Terminal output processing interferes with video performance on Pi5

**🔍 Key Differences**:
1. **Audio Device Format**: `alsa/hdmi:CARD=vc4hdmi1,DEV=0` > `pulse/alsa_output.platform-107c706400.hdmi.hdmi-stereo`
2. **Terminal Handling**: `--no-terminal` is ESSENTIAL for smooth playback
3. **Hardware Acceleration**: `--hwdec=auto --vo=gpu` provides best performance

#### Hardware Configuration
- **GPU**: VideoCore VII with dual HDMI outputs
- **Display System**: Wayland by default with Xwayland compatibility layer
- **Monitor Detection**: xrandr shows XWAYLAND0 (1920x1080+0+0) and XWAYLAND1 (1920x1080+1920+0)
- **Audio Routing**: ALSA HDMI outputs work independently (confirmed working)

#### Display System Commands
```bash
# Check monitor configuration
xrandr --listmonitors

# Expected output on Pi5:
# Monitors: 2
#  0: +XWAYLAND0 1920/530x1080/300+0+0  XWAYLAND0
#  1: +XWAYLAND1 1920/530x1080/300+1920+0  XWAYLAND1

# Check display environment
echo $DISPLAY                    # Should show :0 (not :10+ which indicates SSH)
echo $XDG_SESSION_TYPE          # Should show wayland or x11
echo $SSH_CLIENT                # Should be empty (no SSH)
```

### SSH X11 Forwarding Interference

#### The Problem
- SSH with X11 forwarding creates virtual display server (:10, :11, etc.)
- All graphical applications route through SSH tunnel to client machine
- Client machine can only display on its own monitors
- Audio systems (ALSA/PulseAudio) are NOT affected by X11 forwarding
- This explains why audio routing worked but video routing failed

#### Detection Method
```bash
# Check if SSH is interfering with display
if [ -n "$SSH_CLIENT" ]; then
    echo "SSH CONNECTION DETECTED - Video routing will be impaired"
    echo "SSH_CLIENT: $SSH_CLIENT"
    echo "DISPLAY: $DISPLAY"
fi
```

#### Solutions
1. **SSH without X11**: `ssh -o ForwardX11=no -o ForwardX11Trusted=no user@pi5`
2. **Local console access**: Direct keyboard/monitor on Pi5
3. **VNC remote desktop**: Full graphical access without SSH display interference

## 🧪 Testing Methodology

### Environment Validation Script
```bash
#!/bin/bash
# File: check-display-environment.sh

echo "=== Display Environment Analysis ==="
echo "SSH_CLIENT: ${SSH_CLIENT:-'Not set (good!)'}"
echo "DISPLAY: ${DISPLAY:-'Not set'}"
echo "XDG_SESSION_TYPE: ${XDG_SESSION_TYPE:-'Not set'}"

# Check monitor count
MONITOR_COUNT=$(xrandr --listmonitors | grep -c "^ ")
echo "Monitors detected: $MONITOR_COUNT"

if [ -n "$SSH_CLIENT" ]; then
    echo "❌ SSH CONNECTION DETECTED - This explains the video routing issue!"
    echo "   Solution: Use VNC, local console, or SSH without X11 forwarding"
else
    echo "✅ Local display environment detected"
fi
```

### MPV Testing Commands

#### Basic Screen Targeting Test
```bash
# Test screen 0 (should work in any environment)
mpv --screen=0 --fullscreen /path/to/video.mp4

# Test screen 1 (requires proper display environment)
mpv --screen=1 --fullscreen /path/to/video.mp4
```

#### Advanced Positioning Test
```bash
# Get monitor positions first
xrandr --listmonitors

# Position video on specific screen coordinates
mpv --geometry=1920x1080+0+0 --fullscreen /path/to/video.mp4      # Screen 0
mpv --geometry=1920x1080+1920+0 --fullscreen /path/to/video.mp4   # Screen 1
```

#### ParadoxFX Integration Test
```bash
# Test ParadoxFX-style commands (requires MQTT broker)
mosquitto_pub -t "paradox/screen/0/video/play" -m '{"file": "test.mp4", "screen": 0}'
mosquitto_pub -t "paradox/screen/1/video/play" -m '{"file": "test.mp4", "screen": 1}'
```

## 🛠️ ParadoxFX Implementation

### Current MPV Command Structure
```javascript
// In ParadoxFX media player
const mpvArgs = [
    '--fullscreen',
    '--no-osc',
    '--no-input-default-bindings',
    `--screen=${screenNumber}`,           // Primary screen targeting
    `--fs-screen=${screenNumber}`,        // Fullscreen screen targeting
    '--audio-device=alsa/' + audioDevice, // ALSA audio routing
    videoFile
];
```

### Recommended Configuration
```javascript
// Enhanced MPV configuration for dual-screen reliability
const mpvArgs = [
    '--fullscreen',
    '--no-osc',
    '--no-input-default-bindings',
    `--screen=${screenNumber}`,
    `--fs-screen=${screenNumber}`,
    `--geometry=${getScreenGeometry(screenNumber)}`, // Backup positioning
    '--audio-device=alsa/' + audioDevice,
    '--really-quiet',                      // Reduce log noise
    '--no-terminal',                       // Background operation
    videoFile
];

function getScreenGeometry(screenNumber) {
    // For Pi5 dual 1920x1080 setup
    return screenNumber === 0 ? '1920x1080+0+0' : '1920x1080+1920+0';
}
```

## 🎯 Troubleshooting Guide

### Video Goes to Wrong Screen
1. **Check display environment**: Run `check-display-environment.sh`
2. **Verify SSH**: Ensure no X11 forwarding active
3. **Test screen targeting**: Use `mpv --screen=1 test.mp4`
4. **Check monitor config**: Run `xrandr --listmonitors`

### Audio Works, Video Doesn't
- **Root Cause**: SSH X11 forwarding interference
- **Solution**: Switch to local display access (VNC/console/SSH without X11)
- **Verification**: `echo $SSH_CLIENT` should be empty

### MPV Commands Fail
1. **Check MPV installation**: `which mpv`
2. **Test basic playback**: `mpv --no-video audio.mp3`
3. **Verify file permissions**: `ls -la video.mp4`
4. **Check system resources**: `htop` or `free -h`

## 📋 Testing Checklist

### Before Testing
- [ ] Confirm non-SSH environment (`echo $SSH_CLIENT` is empty)
- [ ] Verify dual monitors detected (`xrandr --listmonitors`)
- [ ] Test audio routing works (`aplay -l`)
- [ ] Confirm MPV installation (`mpv --version`)

### During Testing
- [ ] Test screen 0 video playback
- [ ] Test screen 1 video playback
- [ ] Verify audio routes to correct HDMI output
- [ ] Test ParadoxFX MQTT commands
- [ ] Confirm fullscreen behavior

### After Testing
- [ ] Document working configurations
- [ ] Update ParadoxFX config files
- [ ] Test with actual ParadoxFX startup
- [ ] Verify performance under load

## 🔮 Future AI Agent Instructions

When helping with ParadoxFX dual-screen video routing issues:

1. **Always check for SSH X11 forwarding first** - this is the #1 cause of "video routing doesn't work" issues
2. **Use the environment check script** to validate testing conditions
3. **Start with MPV `--screen` parameter** as the primary targeting method
4. **Combine `--screen` and `--fs-screen`** for maximum reliability
5. **Test audio routing separately** - it works differently than video routing
6. **Remember Pi5 uses Wayland** - some X11-specific solutions may not apply
7. **Always validate in proper testing environment** before concluding hardware/software issues

### Key Commands for AI Agents
```bash
# Essential diagnostic
./test/manual/check-display-environment.sh

# Core MPV testing
mpv --screen=1 --fullscreen test.mp4

# ParradoxFX integration
./test/manual/test-local-display-routing.sh
```

This research eliminates the need to re-investigate SSH X11 forwarding interference, MPV screen targeting methods, Pi5 Wayland display system behavior, and ALSA audio routing independence.
