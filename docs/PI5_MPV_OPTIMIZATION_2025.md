# Pi5 MPV Optimization Guide - 2025 Best Practices

## Overview

This document compiles the latest MPV optimization recommendations for Raspberry Pi 5 + Bookworm systems, based on comprehensive research of official MPV documentation and ParadoxFX testing results.

## Optimal MPV Configuration

### Primary Recommendation (High Quality)

```bash
mpv --screen=1 --fullscreen --no-osc --no-input-default-bindings \
    --hwdec=auto --vo=gpu --gpu-api=opengl \
    --opengl-swapinterval=1 --video-sync=display-resample \
    --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \
    --cache=yes --demuxer-max-bytes=50M --no-terminal \
    --profile=gpu-hq [video_file]
```

### Performance Alternative (Maximum Speed)

```bash
mpv --screen=1 --fullscreen --no-osc --no-input-default-bindings \
    --hwdec=auto --vo=gpu --gpu-api=opengl \
    --opengl-swapinterval=1 --video-sync=display-resample \
    --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \
    --cache=yes --demuxer-max-bytes=50M --no-terminal \
    --profile=fast [video_file]
```

## Key Optimization Explained

### Hardware Acceleration
- **`--hwdec=auto`**: Recommended over specific decoders (nvdec, vaapi, etc.)
- Automatically selects best available hardware decoding for Pi5
- Provides fallback to software decoding if hardware fails

### Video Output Driver
- **`--vo=gpu`**: Primary recommendation for Pi5 systems
- **`--gpu-api=opengl`**: Explicit OpenGL API selection for Pi5 compatibility
- Better performance than software renderers (x11, wayland)

### Display Synchronization
- **`--video-sync=display-resample`**: Superior to default audio sync
- Handles dual-HDMI refresh rate mismatches better
- Reduces judder and frame drops

### VSync and Frame Timing
- **`--opengl-swapinterval=1`**: Enables proper VSync
- Synchronizes frame presentation with display refresh
- Critical for smooth playback on Pi5

### GPU Profiles
- **`--profile=gpu-hq`**: High-quality rendering optimizations
- **`--profile=fast`**: Maximum performance mode
- Built-in MPV profiles optimize multiple settings simultaneously

### Memory and Buffering
- **`--demuxer-max-bytes=50M`**: Optimized buffer size for Pi5
- Balances performance with memory constraints
- Prevents buffer underruns during high-bitrate content

### Critical Performance Settings
- **`--no-terminal`**: Essential for smooth playback
- Terminal output processing interferes with video rendering
- Can cause significant frame drops if omitted

## Audio Configuration

### HDMI Audio Routing
```bash
# HDMI0 (Primary)
--audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0

# HDMI1 (Secondary) 
--audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0
```

### Format Comparison
- **ALSA format**: Direct hardware access, better volume control
- **PulseAudio format**: System integration, potential latency
- Recommendation: Use ALSA for dedicated media systems

## Pi5-Specific Considerations

### GPU Memory Configuration
```bash
# In /boot/firmware/config.txt
gpu_mem=256
```

### Display System
- **X11**: Mature, stable, recommended for dual-HDMI
- **Wayland**: Default on Bookworm, may have dual-screen limitations

### Wayland Compatibility
If using Wayland, modify MPV args:
```bash
--vo=gpu --gpu-context=wayland
```

## ParadoxFX Integration

### Updated MPV Zone Manager
The `mpv-zone-manager.js` has been updated with Pi5 optimizations:

- Automatic Pi5-optimized parameter selection
- Hardware acceleration detection
- Display system compatibility
- Optimized buffering and caching

### Configuration Files
Update `pfx.ini` to ensure proper Pi5 settings:
```ini
[zone2]
type=screen
display=:0
xinerama_screen=1
audio_device=alsa/hdmi:CARD=vc4hdmi1,DEV=0
mpv_video_options=--profile=gpu-hq --video-sync=display-resample
```

## Performance Monitoring

### MPV Performance Stats
Enable real-time performance monitoring:
```bash
mpv --osd-level=3 [other_options] [video_file]
```

Key metrics to monitor:
- Frame drops (should be 0)
- A/V sync offset (should be <0.1s)
- GPU decoder usage
- Audio buffer health

### System Resources
Monitor Pi5 system resources:
```bash
# GPU temperature and frequency
vcgencmd measure_temp
vcgencmd measure_clock gpu

# Memory usage
free -h

# CPU usage during playback
htop
```

## Troubleshooting Common Issues

### Frame Drops
1. Verify `--no-terminal` is enabled
2. Check GPU memory allocation (gpu_mem=256)
3. Ensure hardware acceleration is active
4. Monitor CPU/GPU temperature

### Audio Issues
1. Verify ALSA device names: `aplay -l`
2. Test audio routing: `speaker-test -D [device]`
3. Check PulseAudio conflicts
4. Validate HDMI audio enable in config.txt

### Display Problems
1. Confirm X11 vs Wayland detection
2. Verify Xinerama screen numbering
3. Test display resolution support
4. Check HDMI cable quality

## References

- [MPV Manual (Stable)](https://mpv.io/manual/stable/)
- [Raspberry Pi 5 Documentation](https://www.raspberrypi.org/documentation/)
- [ParadoxFX MPV Testing Results](/test/manual/mpv-display-notes.md)

## Changelog

- **2025-01**: Comprehensive research of latest MPV documentation
- **2024-12**: Initial Pi5 testing and optimization
- **2024-11**: ParadoxFX system deployment

---

*Last updated: January 2025*
