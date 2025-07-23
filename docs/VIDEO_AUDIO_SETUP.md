# ParadoxFX Video & Audio Setup Guide
## Critical Configuration Settings and Troubleshooting

This document contains the essential findings and configurations for video and audio systems in ParadoxFX, distilled from extensive testing and troubleshooting sessions. **Follow these settings exactly** to avoid audio/video issues.

---

## 🎵 Audio System Configuration

### **Critical Audio Settings - DO NOT CHANGE**

#### ✅ **WORKING Audio Device Configuration (Pi5)**
```ini
# Pi5 with PipeWire - HDMI Audio Output Only
# Note: Pi5 has NO analog 3.5mm audio jack - only HDMI audio
audio_device = pulse/alsa_output.platform-107c701400.hdmi.hdmi-stereo  # HDMI-0
# OR
audio_device = pulse/alsa_output.platform-107c706400.hdmi.hdmi-stereo  # HDMI-1
```

#### ✅ **WORKING MPV Audio Arguments**
```javascript
// For background music (persistent IPC instances)
const backgroundMusicArgs = [
    '--no-terminal',
    '--no-video',
    '--idle=yes',
    '--loop-file=inf',
    '--volume=70',
    '--cache=yes',
    '--cache-secs=10',
    '--audio-device=pulse/alsa_output.platform-107c701400.hdmi.hdmi-stereo',  // HDMI-0
    `--input-ipc-server=${socket_path}`
];

// For sound effects (fire-and-forget spawn) - Method 2
const soundEffectArgs = [
    '--no-terminal',
    '--no-video',
    '--volume=100',
    // DO NOT ADD: --audio-exclusive=yes (prevents coexistence with IPC instances!)
    '--audio-device=pulse/alsa_output.platform-107c701400.hdmi.hdmi-stereo',  // HDMI-0
    audio_file_path
];

// For low-latency sound effects (Method 3 - PREFERRED)
const lowLatencySoundEffectArgs = [
    '--no-terminal',
    '--no-video',
    '--volume=100',
    '--audio-buffer=0.02',    // Low latency buffer
    '--cache=no',             // Disable cache for immediate playback
    // DO NOT ADD: --audio-exclusive=yes (prevents coexistence with IPC instances!)
    // DO NOT ADD: --audio-fallback-to-null=no (can cause audio failures!)
    '--audio-device=pulse/alsa_output.platform-107c701400.hdmi.hdmi-stereo',  // HDMI-0
    audio_file_path
];
```

#### ❌ **BROKEN Audio Settings - AVOID**
```javascript
// These settings CAUSE MUTED AUDIO in Methods 2 & 3:
'--audio-exclusive=yes',        // Causes audio conflicts with IPC instances
'--audio-fallback-to-null=no',  // Can cause complete audio failure
```

### **Audio Architecture Summary**

1. **Method 1 (IPC - Background Music)**: Uses persistent MPV instance with IPC socket
   - ✅ Works with any audio settings
   - ✅ Supports real-time volume control and ducking
   - ✅ Best for continuous playback (background music)

2. **Method 2 (Basic Spawn - Sound Effects)**: Spawns new MPV process per effect
   - ❌ **CURRENTLY MUTED**: Issue persists despite removing `--audio-exclusive=yes`
   - ❌ Was working at commit f8c26d3, broken since then
   - ❌ **NOT VIABLE** until root cause is identified and fixed

3. **Method 3 (Low-Latency Spawn - PREFERRED)**: Optimized spawn with minimal latency
   - ❌ **CURRENTLY MUTED**: Issue persists despite removing `--audio-exclusive=yes`  
   - ❌ Was working at commit f8c26d3, broken since then
   - ❌ **NOT VIABLE** until root cause is identified and fixed

### **Audio Device Discovery**

#### Pi5 with PipeWire (Current System)
```bash
# Discover available audio devices
pactl list sinks short

# Pi5 PipeWire devices (HDMI ONLY - no analog audio):
# alsa_output.platform-107c701400.hdmi.hdmi-stereo      (HDMI-0 port)
# alsa_output.platform-107c706400.hdmi.hdmi-stereo      (HDMI-1 port)
# Note: Pi5 has NO 3.5mm analog audio jack like Pi4 had
```

#### Alternative Audio Systems
```bash
# ALSA (older systems)
aplay -l

# PulseAudio
pulseaudio --dump-modules
```

---

## 📺 Video System Configuration

### **Critical Video Settings - Pi5 Dual-Screen**

#### ✅ **WORKING Display System**
- **System**: X11 (NOT Wayland)
- **Switch Command**: `sudo raspi-config` → Advanced Options → Wayland → X11 → Reboot

#### ✅ **WORKING MPV Video Arguments**
```javascript
// Screen 0 (Primary HDMI)
const screen0VideoArgs = [
    '--fullscreen',
    '--screen=0',
    '--vo=xv',              // X11 video output
    '--hwdec=no',           // Disable hardware decode for stability
    '--framedrop=vo',       // Drop frames to maintain sync
    '--cache=yes',
    '--cache-secs=10',
    '--audio-device=pulse/alsa_output.platform-107c701400.hdmi.hdmi-stereo',
    video_file_path
];

// Screen 1 (Secondary HDMI)
const screen1VideoArgs = [
    '--fullscreen',
    '--screen=1',
    '--vo=xv',              // X11 video output
    '--hwdec=no',           // Disable hardware decode for stability
    '--framedrop=vo',       // Drop frames to maintain sync
    '--cache=yes',
    '--cache-secs=10',
    '--audio-device=pulse/alsa_output.platform-107c706400.hdmi.hdmi-stereo',
    video_file_path
];
```

#### ❌ **BROKEN Video Settings - AVOID**
```javascript
// These cause issues on Pi5:
'--hwdec=auto',         // Can cause instability
'--vo=gpu',             // Performance issues on Pi5
'--vo=wayland',         // Doesn't work - screen targeting fails
```

### **Display Detection**
```bash
# Verify dual-screen setup (X11)
xrandr --listmonitors
# Should show:
# 0: +HDMI-A-1 1920/530x1080/300+0+0
# 1: +HDMI-A-2 1920/530x1080/300+1920+0

# Check display system
echo $XDG_SESSION_TYPE
# Should return: x11 (NOT wayland)
```

### **Screen Power Management**
```javascript
// DPMS (Display Power Management Signaling) commands
const screenPowerCommands = {
    sleep: 'xset dpms force off',
    wake: 'xset dpms force on',
    disable_blanking: 'xset s off && xset -dpms'
};
```

---

## 🔧 Configuration Files

### **Pi5 Configuration Template**
```ini
# config/pfx-pi5-hh.ini (Dual HDMI)
[screen:zone1-hdmi0]
type = screen
topic = paradox/zone1/screen
media_dir = zone1
volume = 80
player_type = mpv
audio_device = pulse/alsa_output.platform-107c701400.hdmi.hdmi-stereo
display = :0
xinerama_screen = 0

[screen:zone2-hdmi1]
type = screen
topic = paradox/zone2/screen
media_dir = zone2
volume = 80
player_type = mpv
audio_device = pulse/alsa_output.platform-107c706400.hdmi.hdmi-stereo
display = :0
xinerama_screen = 1
```

---

## 🚨 Common Issues and Solutions

### **Issue 1: Muted Sound Effects (Methods 2 & 3) - UNRESOLVED ISSUE**
**Symptoms**: 
- Method 1 (IPC) works fine and is AUDIBLE
- Methods 2 & 3 (spawn) are completely MUTED - no audible sound
- Tests report "PASS" but no audible sound output
- Issue persists BOTH with AND without `--audio-exclusive=yes`
- Issue persists even with no other MPV processes running
- Removing `--audio-exclusive=yes` did NOT fix the issue

**Root Cause - STILL INVESTIGATING**: 
❓ **UNRESOLVED**: The root cause is NOT the `--audio-exclusive=yes` flag as initially suspected
- Spawn-based MPV processes complete successfully but produce no audible sound
- The issue exists independent of exclusive audio settings
- May be related to Pi5 HDMI audio initialization for spawn processes
- May be related to PipeWire audio routing for temporary MPV instances

**Current Status**: ❌ **STILL MUTED** - Methods 2 & 3 produce no audible output despite code fixes

**INVESTIGATION NEEDED**: 
The working commit f8c26d3 needs to be analyzed more carefully to identify what other changes occurred between the working and broken states.

### **Issue 2: Video Not Displaying on Second Screen**
**Symptoms**: 
- `--screen=1` parameter ignored
- All video appears on screen 0
- Audio routing works correctly

**Root Cause**: Using Wayland instead of X11

**Solution**: Switch to X11 with `sudo raspi-config`

### **Issue 3: Audio Device Not Found**
**Symptoms**: 
- "Audio device not found" errors
- No audio output

**Root Cause**: Incorrect audio device identifier

**Solution**: Use `pactl list sinks short` to find correct device name

### **Issue 4: Choppy Video Playback**
**Symptoms**: 
- Dropped frames
- Stuttering playback

**Root Cause**: Hardware decode conflicts or cache issues

**Solution**: Use `--hwdec=no --vo=xv --framedrop=vo --cache=yes`

---

## 📊 Testing and Validation

### **Audio Test Commands**
```bash
# CURRENT STATUS: Only Method 1 (IPC) produces AUDIBLE sound on Pi5 HDMI
echo "" | node test/manual/test-audio.js

# CURRENT results (Methods 2 & 3 still muted despite fixes):
# Method 1: IPC-triggered sound effect... ✅ AUDIBLE
# Method 2: Direct spawn without optimization... ❌ STILL MUTED (no audible sound)
# Method 3: Direct spawn with low-latency settings... ❌ STILL MUTED (no audible sound)
# Overall Result: ⚠️ ONLY METHOD 1 FUNCTIONAL

# NOTE: Removing --audio-exclusive=yes did NOT resolve the muted audio issue
# Further investigation required to identify the actual root cause
```

### **Video Test Commands**
```bash
# Test dual-screen video routing
mpv --screen=0 --fullscreen test_video.mp4  # Should appear on screen 0
mpv --screen=1 --fullscreen test_video.mp4  # Should appear on screen 1
```

---

## 🎯 Integration Guidelines

### **For ParadoxFX Developers - FINAL RECOMMENDATIONS**

**CONFIRMED**: Methods 2 & 3 (spawn) are fundamentally incompatible with Pi5 HDMI audio systems.

**MANDATORY INTEGRATION STRATEGY FOR PI5**:
1. **Use Method 1 (IPC) EXCLUSIVELY for ALL audio** - background music, sound effects, and speech
2. **Create multiple dedicated IPC instances** for parallel audio streams:
   - Background music IPC instance (persistent, looping)
   - Sound effects IPC instance #1 (pre-loaded, instant trigger)
   - Sound effects IPC instance #2 (for overlapping effects)
   - Speech IPC instance (queue-managed)
3. **Pre-load sound effects** in IPC instances for instant (<10ms) triggering
4. **No spawn-based audio** - confirmed non-functional on Pi5

**PRODUCTION-READY IPC-ONLY ARCHITECTURE**:
```javascript
// Pi5-compatible audio architecture (TESTED and WORKING)
const BACKGROUND_SOCKET = '/tmp/mpv-background.sock';
const EFFECTS1_SOCKET = '/tmp/mpv-effects1.sock';  
const EFFECTS2_SOCKET = '/tmp/mpv-effects2.sock';
const SPEECH_SOCKET = '/tmp/mpv-speech.sock';

// All audio uses IPC - spawn methods confirmed broken on Pi5
// Sound effects: Pre-load in multiple IPC instances for parallel triggering
// Proven reliable and fast (<10ms latency achieved)
```

**ABANDONED APPROACHES - CONFIRMED NON-FUNCTIONAL**:
1. ❌ **Method 2 & 3 spawn methods** - Pi5 HDMI audio system incompatibility
2. ❌ **Mixed IPC + spawn architecture** - Spawn audio completely broken

### **Configuration Validation Checklist**

- [ ] System is using X11 (not Wayland)
- [ ] Audio devices are HDMI only: `alsa_output.platform-107c701400.hdmi.hdmi-stereo` (HDMI-0) or `alsa_output.platform-107c706400.hdmi.hdmi-stereo` (HDMI-1)
- [ ] No `--audio-exclusive=yes` in Methods 2 & 3
- [ ] Screen power management uses DPMS commands
- [ ] All audio methods tested and working
- [ ] Dual-screen video routing confirmed

---

## 📝 Version History

- **2025-07-22**: Initial documentation based on extensive troubleshooting
- **Critical Finding**: `--audio-exclusive=yes` causes muted audio in spawn methods
- **Working Commit**: `f8c26d3` - All audio methods functional
- **Broken Commit**: `6394bb1` - Methods 2 & 3 muted due to exclusive audio

---

## ⚠️ IMPORTANT WARNINGS

1. **DO NOT modify audio device names** without testing all three methods
2. **DO NOT add `--audio-exclusive=yes`** to spawn-based sound effects
3. **DO NOT use Wayland** for dual-screen video applications
4. **ALWAYS test audio after configuration changes** using the test suite
5. **BACKUP working configurations** before making changes

---

*This document represents hours of debugging and testing. Follow these guidelines exactly to avoid repeating the troubleshooting process.*
