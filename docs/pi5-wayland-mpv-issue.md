# Pi5 Wayland Dual-HDMI Video Routing Issue with MPV

## 🎯 Issue Summary

**Problem**: On Raspberry Pi 5 with dual HDMI outputs under Wayland, MPV cannot route video to the second HDMI display despite correct audio routing and proper display detection.

**Expected Behavior**: `mpv --screen=1` should display video on the second HDMI output
**Actual Behavior**: Video always appears on the first HDMI output (screen 0), regardless of `--screen` parameter
**Audio Behavior**: Audio routing works correctly - can successfully route to either HDMI output

## 🔧 System Configuration

- **Hardware**: Raspberry Pi 5 (8GB)
- **OS**: Raspberry Pi OS (64-bit, Bookworm)
- **Display System**: Wayland (Labwc compositor) with Xwayland
- **MPV Version**: 0.35.1
- **Displays**: Dual 1920x1080 HDMI monitors
- **Testing Environment**: Local console (no SSH X11 forwarding)

## 🧪 Testing Details

### Working Commands
```bash
# Screen 0 (works correctly)
mpv --screen=0 --fullscreen --audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0 video.mp4
# Result: Video on screen 0 ✅, Audio on HDMI 0 ✅

# Screen 1 (video routing fails)
mpv --screen=1 --fullscreen --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 video.mp4  
# Result: Video on screen 0 ❌, Audio on HDMI 1 ✅
```

### Display Detection
```bash
$ xrandr --listmonitors
Monitors: 2
 0: +XWAYLAND0 1920/530x1080/300+0+0  XWAYLAND0
 1: +XWAYLAND1 1920/530x1080/300+1920+0  XWAYLAND1

$ echo $XDG_SESSION_TYPE
wayland
```

### Audio Devices (Working Correctly)
```bash
$ aplay -l
card 0: vc4hdmi0 [vc4-hdmi-0], device 0: MAI PCM i2s-hifi-0
card 1: vc4hdmi1 [vc4-hdmi-1], device 0: MAI PCM i2s-hifi-0
```

### Failed Workarounds Tested
- `mpv --screen=1 --fs-screen=1` (combined parameters)
- `mpv --geometry=1920x1080+1920+0` (positioning)
- `DISPLAY=:0.1 mpv` (X11 display targeting)
- `mpv --vo=wayland` (Wayland video output)
- `mpv --vo=x11` (X11 video output under Xwayland)

## 📊 Key Observations

1. **Audio routing is independent and works perfectly** - confirms hardware is functional
2. **Display detection is correct** - both monitors properly identified
3. **MPV executes without errors** - no crashes or obvious failures
4. **Issue is specific to video routing under Wayland** - same commands should work under X11

## 🔍 Root Cause Analysis

This appears to be a **Wayland compositor limitation** where:
- Applications cannot directly target specific Wayland outputs
- Xwayland translation layer doesn't properly handle multi-monitor video routing
- Audio subsystem (ALSA) operates independently and works correctly

## 💡 Current Workaround

**Switch Pi5 from Wayland to X11:**
```bash
sudo raspi-config
# Advanced Options -> Wayland -> X11
sudo reboot
```

After switching to X11, the same MPV commands work correctly for dual-screen video routing.

## 📢 Where to Report This

### 1. Raspberry Pi Foundation
**Forum**: https://forums.raspberrypi.com/
**Category**: Raspberry Pi OS
**Title**: "Pi5 Wayland: MPV cannot route video to second HDMI display"
**Focus**: This is a Pi5-specific Wayland configuration issue affecting multimedia applications

### 2. MPV Development Team  
**GitHub**: https://github.com/mpv-player/mpv/issues
**Title**: "Wayland dual-monitor support: --screen parameter ineffective on Pi5/Xwayland"
**Focus**: MPV's screen targeting parameters don't work properly under Xwayland on Pi5

### 3. Wayland/Weston Community
**GitLab**: https://gitlab.freedesktop.org/wayland/weston/-/issues
**Title**: "Multi-monitor application window placement limitations on Pi5"
**Focus**: Wayland compositor limitations for application-controlled window placement

### 4. Reddit Communities
**r/raspberry_pi**: For Pi-specific hardware discussion
**r/wayland**: For Wayland-specific technical discussion
**r/linux**: For broader Linux multimedia/display issues

## 🎯 What Each Community Needs

### For Raspberry Pi Foundation:
"The Pi5's default Wayland setup has limitations for professional multimedia applications requiring precise display control. Many users will need to switch to X11 for dual-screen video applications."

### For MPV Developers:
"The --screen parameter doesn't function correctly under Xwayland on Pi5. This affects users trying to build multimedia systems with dedicated screen targeting."

### For Wayland Developers:
"Applications need a reliable way to target specific outputs for fullscreen video content. Current compositor behavior makes dual-screen multimedia applications difficult to implement."

## 🔧 Technical Details for Developers

### Environment Variables During Testing
```bash
DISPLAY=:0
XDG_SESSION_TYPE=wayland
WAYLAND_DISPLAY=wayland-0
```

### MPV Debug Output
```
VO: [gpu] 1920x1080 yuv420p
# Video consistently goes to first output regardless of --screen value
```

### Xwayland Display Configuration
```bash
# Both displays detected but video routing ineffective
XWAYLAND0: 1920x1080+0+0 (primary)
XWAYLAND1: 1920x1080+1920+0 (secondary) 
```

## 🎯 Impact

This issue affects:
- **Digital signage systems** requiring specific screen targeting
- **Multimedia installations** with multiple displays  
- **Professional AV applications** on Pi5 hardware
- **Any application** needing reliable dual-screen video routing

## 🏁 Resolution

**Immediate**: Switch to X11 for reliable dual-screen video routing
**Long-term**: Wayland compositor improvements for application-controlled display targeting

---

*This issue has been thoroughly tested and documented. The hardware is functional (audio routing proves this), and X11 provides a working solution. The problem is specifically with Wayland's handling of application display targeting on Pi5 dual-HDMI configurations.*
