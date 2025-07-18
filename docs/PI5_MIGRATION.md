# Raspberry Pi 5 Migration Guide

## Hardware Differences: Pi4 vs Pi5

### Key Changes in Pi5
- **CPU**: Broadcom BCM2712 quad-core Cortex-A76 @ 2.4GHz (vs BCM2711 Cortex-A72 @ 1.8GHz)
- **GPU**: VideoCore VII (vs VideoCore VI)
- **Memory**: Up to 8GB LPDDR4X-4267 (vs up to 8GB LPDDR4-3200)
- **Video**: Dual 4Kp60 HDMI outputs with HDR support
- **Audio**: I2S, analog stereo output + dual HDMI audio
- **Power**: Higher power requirements (5V/5A recommended vs 5V/3A)

### Configuration Changes Required

#### 1. Audio Configuration
Pi5 has updated audio hardware that may require different ALSA device mappings:

**Current Pi4 mapping:**
- `alsa/plughw:0` - Headphones/analog output
- `alsa/plughw:1` - HDMI 0 output  
- `alsa/plughw:2` - HDMI 1 output

**Expected Pi5 mapping (may need verification):**
- Similar structure but device indices may differ
- Check with: `cat /proc/asound/cards` after boot

#### 2. GPU Memory Split
Pi5 has more efficient memory management and may not need explicit GPU memory configuration.

**Pi4 recommendations:**
- For 2GB models: `gpu_mem=128` (current setup)
- For 4GB+ models: `gpu_mem=256` or higher

**Pi5 recommendations:**
- Default memory management is more efficient
- May not need explicit `gpu_mem` setting
- If needed: `gpu_mem=256` for 8GB model

#### 3. Video Acceleration
Pi5 has enhanced video capabilities:

**New capabilities:**
- Hardware H.265/HEVC decode
- Enhanced H.264 performance
- Dual 4K output support
- Better HDR support

### Required Config.txt Changes

Add Pi5-specific settings to `/boot/firmware/config.txt`:

```ini
# Pi5-specific optimizations
[pi5]
# Enable all performance features
arm_boost=1

# GPU memory (adjust as needed for video performance)
gpu_mem=256

# Enhanced video capabilities
dtoverlay=vc4-kms-v3d
max_framebuffers=2

# Enable enhanced audio
dtparam=audio=on
audio_pwm_mode=1

# HDMI audio optimization
hdmi_drive=2
hdmi_force_hotplug=1

# Performance tuning for 8GB model
[pi5]
arm_freq=2400
gpu_freq=800
over_voltage=2
```

### Audio Device Testing Script

After Pi5 boot, run this to verify audio device mapping:

```bash
#!/bin/bash
echo "=== Pi5 Audio Device Discovery ==="
echo "Audio cards:"
cat /proc/asound/cards
echo ""
echo "ALSA devices:"
aplay -l
echo ""
echo "PulseAudio devices:"
pactl list sinks short
```

### Migration Checklist

#### Before Shutdown (Pi4):
- [x] Commit all code changes
- [x] Update documentation
- [x] Create Pi5 migration guide
- [x] Update config.txt with Pi5 settings
- [x] Push to remote repository

#### After Pi5 Boot:
- [ ] Verify audio device mapping with discovery script
- [ ] Update AUDIO_DEVICE_MAP in test-audio-3devices.js if needed
- [ ] Test single-device audio: `node test/manual/test-audio.js`
- [ ] Test multi-zone audio: `node test/manual/test-audio-3devices.js`
- [ ] Update device mappings in documentation if changed
- [ ] Commit any device mapping corrections

#### Performance Verification:
- [ ] Test 9 concurrent MPV instances (3 zones × 3 types)
- [ ] Verify <50ms sound effect latency
- [ ] Test dual 4K video output (if available)
- [ ] Monitor memory usage with 8GB vs 2GB
- [ ] Validate MQTT integration performance

### Potential Issues & Solutions

#### Audio Device Changes
**Issue**: ALSA device indices may differ on Pi5
**Solution**: Update AUDIO_DEVICE_MAP after discovery

#### GPU Memory Requirements  
**Issue**: Video performance with multiple streams
**Solution**: Adjust gpu_mem setting if needed

#### Power Requirements
**Issue**: Pi5 needs more power (5V/5A vs 5V/3A)
**Solution**: Ensure adequate power supply

#### New Audio Hardware
**Issue**: Pi5 audio subsystem differences
**Solution**: Test and adjust audio parameters

### Expected Performance Improvements

With Pi5's enhanced hardware:
- **Better audio latency**: Potentially <30ms for sound effects
- **Enhanced video**: Dual 4K streams with hardware acceleration
- **More memory**: 8GB enables larger media caching
- **Faster CPU**: Better multi-zone coordination performance
- **Improved GPU**: Better graphics and video acceleration

### Rollback Plan

If issues occur:
1. Boot from Pi4 SD card backup
2. Address issues in development
3. Re-test migration steps
4. Create new Pi5-ready SD card image

### Files to Monitor After Migration

Critical files that may need updates:
- `test/manual/test-audio-3devices.js` - Device mapping
- `docs/MQTT_API.md` - Audio zone documentation  
- `README.md` - Audio zone specifications
- Any config files with hardcoded device paths

## Status: Ready for Pi5 Migration ✅
