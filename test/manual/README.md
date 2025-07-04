# Real Media Playback Tests

This directory contains tests that actually play media files, displaying images on screen, playing videos, and outputting audio through speakers.

## Purpose

While the main integration tests only verify that the correct media players are selected and configured, these manual tests actually execute the media players so you can:

- **Visually verify** that images display correctly
- **Hear audio** to confirm sound files work
- **Watch videos** to ensure video playback functions
- **Test media transitions** between different types

## Requirements

### System Requirements

- **X11 Display**: Required for image and video display
  - Linux desktop environment or X forwarding enabled
  - `DISPLAY` environment variable set (usually `:0`)
- **Audio System**: Required for audio playback
  - ALSA, PulseAudio, or other audio system configured
  - Speakers or headphones connected

### Required Media Players

- **feh**: For image display

  ```bash
  sudo apt install feh  # Ubuntu/Debian
  sudo yum install feh  # CentOS/RHEL
  ```

- **mpv**: For video and audio playback

  ```bash
  sudo apt install mpv  # Ubuntu/Debian
  sudo yum install mpv  # CentOS/RHEL
  ```

### Media Files

The test media files must be present in `test/fixtures/test-media/`. If they're missing, follow the instructions in `test/fixtures/test-media/README.md` to generate them.

## Usage

### Run All Real Playback Tests

```bash
npm run test:manual
```

### Run Specific Test Categories

```bash
# Image tests only
ENABLE_REAL_PLAYBACK=true npx jest test/manual/real-playback.test.js -t "Image Playback"

# Audio tests only
ENABLE_REAL_PLAYBACK=true npx jest test/manual/real-playback.test.js -t "Audio Playback"

# Video tests only
ENABLE_REAL_PLAYBACK=true npx jest test/manual/real-playback.test.js -t "Video Playback"

# Media transition demo
ENABLE_REAL_PLAYBACK=true npx jest test/manual/real-playback.test.js -t "Media Transition Demo"

# Seamless full-screen transition test
ENABLE_REAL_PLAYBACK=true npx jest test/manual/real-playback.test.js -t "Seamless Full-Screen"
```

### Skip Real Playback (Default Behavior)

```bash
# These will skip the real playback tests
npm test
npx jest test/manual/
```

## What to Expect

### Image Tests (9 tests)

Each image will be displayed for 3 seconds in a borderless window:

- **JPEG**: Standard, high quality, and low quality variants
- **PNG**: Standard and 24-bit variants  
- **GIF**: Animated image support
- **BMP**: Windows bitmap format
- **TIFF**: High quality format
- **WebP**: Modern web format

### Video Tests (2-4 tests)

Each video will play for 3 seconds with audio at 50% volume:

- **MP4**: Standard H.264 video
- **AVI**: Legacy video format (if available)
- **MKV**: Matroska container (if available)

### Audio Tests (10 tests)

Each audio file will play for 3 seconds at 50% volume:

- **MP3**: Standard, high quality (320kbps), low quality (128kbps)
- **WAV**: Lossless uncompressed
- **FLAC**: Lossless compressed
- **OGG**: Open source Vorbis codec
- **AAC**: Apple/modern standard
- **Opus**: Modern low-latency codec

### Media Transition Demo (1 test)

Demonstrates switching between media types:

1. Displays an image
2. Plays audio
3. Plays a video

### Seamless Full-Screen Transition Test (1 test)

**Professional-grade seamless transition testing** for production environments using **overlapping processes**:

**Sequence:**

1. **Background image** (houdini_picture_24bit.png) - starts and stays persistent
2. **Video overlay** (default.mp4) - plays on top for full 8 seconds
3. **Background switch** - image changes while video plays (invisible to user)
4. **Video ends** - reveals the new background image seamlessly

**Key Features:**

- **Overlapping processes**: Video plays "on top" of persistent background images
- **No transition gaps**: Background switches during video playback (invisible)
- **Full-screen mode**: No borders, menus, or window decorations
- **Hidden cursor**: Cursor completely hidden throughout sequence
- **Tunable timing**: Configurable delays for optimal seamlessness
- **Production-ready**: Tests real-world deployment scenarios

**Timing Configuration:**

- `VIDEO_START_DELAY`: 2000ms (wait after image1 before video)
- `IMAGE_SWITCH_AFTER_START`: 2500ms (switch background after video starts)
- `IMAGE_SWITCH_BEFORE_END`: 2000ms (ensure new image ready before video ends)
- `FINAL_DISPLAY_TIME`: 3000ms (show final result)

This test validates that the system can deliver **truly seamless transitions** with no visible gaps, suitable for professional live events, installations, and presentations where visual continuity is critical.

## Configuration

### Adjust Playback Duration

Edit `DISPLAY_TIME` in `real-playback.test.js`:

```javascript
const DISPLAY_TIME = 5000; // 5 seconds instead of 3
```

### Adjust Audio Volume

Edit the `--volume` parameter in the test file:

```javascript
'--volume=75', // 75% instead of 50%
```

### Change Window Positioning

Edit the `--geometry` parameters:

```javascript
'--geometry=1024x768+200+200', // size and position
```

## Troubleshooting

### No Display

```bash
# Check if X11 is running
echo $DISPLAY
xdpyinfo

# For SSH connections, enable X forwarding
ssh -X username@hostname
```

### No Audio

```bash
# Check audio devices
aplay -l
pactl list sinks

# Test audio system
speaker-test -t sine -f 1000 -l 1
```

### Media Player Not Found

```bash
# Check if players are installed
which feh
which mpv

# Install missing players
sudo apt install feh mpv
```

### Permission Issues

```bash
# Ensure user is in audio group
groups $USER
sudo usermod -a -G audio $USER
```

## Integration with CI/CD

These tests are designed for manual verification and should **not** be run in automated CI/CD pipelines. They require:

- Interactive display
- Audio hardware
- User interaction

For automated testing, use the regular integration tests:

```bash
npm run test:ci
```
