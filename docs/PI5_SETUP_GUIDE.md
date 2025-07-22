# Raspberry Pi 5 Setup Guide for ParadoxFX

This guide provides step-by-step instructions for setting up ParadoxFX on Raspberry Pi 5 with optimal dual-HDMI performance.

## Prerequisites

- **Raspberry Pi 5** (4GB or 8GB recommended)
- **Dual HDMI monitors** (1920x1080 or 4K)
- **Raspberry Pi OS (64-bit, Bookworm)** - latest version
- **Power supply**: 5V/5A (27W) official Pi 5 power adapter

## Step 1: Boot Configuration

Edit `/boot/firmware/config.txt` to add Pi5-specific optimizations:

```bash
sudo nano /boot/firmware/config.txt
```

Add these settings to the end of the file:

```ini
# Pi5 ParadoxFX Optimized Configuration
# =====================================

# GPU Memory allocation for dual-screen video
gpu_mem=256

# HDMI Configuration
hdmi_enable_4kp60=1
hdmi_drive=2
hdmi_force_hotplug=1
config_hdmi_boost=7

# Force HDMI0 to 1920x1080@60Hz (optional - prevents 4K auto-selection)
# Remove these lines if you want 4K on HDMI0
hdmi_group:0=1
hdmi_mode:0=16

# Enable DRM VC4 V3D driver (should already be present)
dtoverlay=vc4-kms-v3d
max_framebuffers=2
```

**Note**: The `hdmi_group:0=1` and `hdmi_mode:0=16` lines force HDMI0 to 1080p. Remove these if you want to use 4K on the primary display.

## Step 2: Switch to X11 Display System

Pi5 defaults to Wayland, but ParadoxFX requires X11 for reliable dual-screen video routing:

```bash
sudo raspi-config
```

Navigate to:
1. **Advanced Options**
2. **Wayland**
3. Select **X11**
4. **Finish** and reboot

```bash
sudo reboot
```

## Step 3: Verify Configuration

After reboot, verify the setup:

### Check Display System
```bash
echo $XDG_SESSION_TYPE
# Should output: x11
```

### Check Display Configuration
```bash
xrandr --query
# Should show both HDMI displays detected
```

### Check Audio Devices
```bash
aplay -l | grep vc4hdmi
# Should show:
# card 0: vc4hdmi0 [vc4-hdmi-0], device 0: MAI PCM i2s-hifi-0
# card 1: vc4hdmi1 [vc4-hdmi-1], device 0: MAI PCM i2s-hifi-0
```

## Step 4: Install ParadoxFX

```bash
# Clone the repository
git clone <repository-url> /opt/paradox/apps/pfx
cd /opt/paradox/apps/pfx

# Install dependencies
npm install

# Create media directories
sudo mkdir -p /opt/paradox/media/{zone1,zone2}
sudo chown -R $USER:$USER /opt/paradox/media
```

## Step 5: Configure ParadoxFX

Choose the appropriate configuration template:

### Single HDMI Setup
```bash
cp config/pfx-pi5-h.ini pfx.ini
```

### Dual HDMI Setup
```bash
cp config/pfx-pi5-hh.ini pfx.ini
```

### Edit Configuration
```bash
nano pfx.ini
```

Update the MQTT broker settings and media paths as needed.

## Step 6: Test the Setup

### Test Single Screen (HDMI0)
```bash
# Place a test video in /opt/paradox/media/zone1/
timeout 5s mpv --screen=0 --fullscreen \
    --audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0 \
    --vo=xv --hwdec=no --framedrop=vo \
    /opt/paradox/media/zone1/test.mp4
```

### Test Dual Screen (if configured)
```bash
# Test HDMI0
timeout 5s mpv --screen=0 --fullscreen \
    --audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0 \
    --vo=xv --hwdec=no --framedrop=vo \
    /opt/paradox/media/zone1/test.mp4

# Test HDMI1
timeout 5s mpv --screen=1 --fullscreen \
    --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \
    --vo=xv --hwdec=no --framedrop=vo \
    /opt/paradox/media/zone2/test.mp4
```

### Expected Results
- **Video**: Should appear on the correct screen (0 = left, 1 = right)
- **Audio**: Should come from the correct monitor's speakers/audio output
- **Performance**: Minimal dropped frames (< 5 for a short test)

## Step 7: Run ParadoxFX

```bash
npm start
```

## Troubleshooting

### Video Goes to Wrong Screen
- **Problem**: Video always appears on HDMI0 regardless of `--screen` parameter
- **Solution**: Ensure you're using X11 (not Wayland). Check with `echo $XDG_SESSION_TYPE`

### No Audio or Audio on Wrong Output
- **Problem**: Audio doesn't play or plays from wrong HDMI
- **Solution**: Verify ALSA device names with `aplay -l | grep vc4hdmi`

### Poor Video Performance
- **Problem**: Stuttering video or many dropped frames
- **Solutions**:
  - Ensure `gpu_mem=256` in `/boot/firmware/config.txt`
  - Consider forcing 1080p resolution (add hdmi_group/mode settings)
  - Check power supply is adequate (5V/5A)

### Display Detection Issues
- **Problem**: Second monitor not detected
- **Solutions**:
  - Ensure both monitors are powered on before boot
  - Check HDMI cables and connections
  - Try `sudo service lightdm restart` to refresh display manager

### ParadoxFX Service Issues
- **Problem**: ParadoxFX fails to start or control devices
- **Solutions**:
  - Check MQTT broker connectivity
  - Verify media directory permissions: `sudo chown -R $USER:$USER /opt/paradox/media`
  - Enable debug logging in `pfx.ini`: `log_level = debug`

## Performance Optimization

### Memory Settings
The Pi5 benefits from the 256MB GPU memory allocation for dual-screen video:
```ini
# In /boot/firmware/config.txt
gpu_mem=256
```

### Resolution Selection
- **4K**: Maximum quality but higher GPU load
- **1080p**: Optimal balance of quality and performance for multimedia

### MPV Performance
ParadoxFX automatically uses optimized MPV parameters:
- `--vo=xv`: Hardware-accelerated video output
- `--framedrop=vo`: Drop frames to maintain sync
- `--cache=yes --cache-secs=10`: Buffer for smooth playback

## Hardware Considerations

### Power Requirements
- **Minimum**: 5V/3A (Pi5 will throttle under heavy load)
- **Recommended**: 5V/5A (27W official adapter)
- **Dual 4K**: May require active cooling

### Storage Performance
- **Class 10 SD Card**: Minimum requirement
- **USB 3.0 SSD**: Recommended for best performance
- **NVMe SSD**: Optimal for professional installations

### Audio Considerations
- **HDMI Audio**: Both HDMI outputs provide stereo audio
- **Analog Audio**: Not available on Pi5 (HDMI only)
- **USB Audio**: Supported for additional audio outputs

## Production Deployment

For production environments:

1. **Use systemd service** for auto-start
2. **Mount media on external storage** for reliability
3. **Configure firewall** for MQTT security
4. **Set up monitoring** for system health
5. **Use redundant power supply** for critical installations

## Support

For issues specific to Pi5 setup:
1. Check this guide first
2. Review [CONFIGURATION.md](CONFIGURATION.md) for detailed settings
3. Check [pi5-wayland-mpv-issue.md](pi5-wayland-mpv-issue.md) for technical background
4. Enable debug logging for troubleshooting

---

*Last updated: July 2025 - Tested on Pi5 8GB with dual 1920x1080 HDMI displays*
