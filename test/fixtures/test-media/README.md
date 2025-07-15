# Test Media Files

This directory contains media files used for testing the ParadoxFX media player functionality.

## Available Files

This directory contains media files used for testing the ParadoxFX media player functionality.

### Image Files (Generated from default.png)

- `default.jpg` - JPEG image test (214KB)
- `default.png` - PNG image test (1.1MB, original)
- `default.gif` - GIF image test (773KB)
- `default.bmp` - BMP image test (6.2MB, uncompressed)
- `default.tiff` - TIFF image test (1.2MB)
- `default.webp` - WebP image test (47KB, modern format)
- `default_hq.jpg` - High-quality JPEG (95% quality)
- `default_lq.jpg` - Low-quality JPEG (50% quality)
- `houdini_picture_24bit.png` - 24-bit PNG test image (additional test case)

### Video Files

- `default.mp4` - MP4 video test (2.5MB)
- `intro_short.mp4` - Short video for transition testing (2.5MB)

### Audio Files (Generated from default.wav)

- `default.wav` - WAV audio test (189KB, 16-bit PCM, original)
- `default.mp3` - MP3 audio test (18KB, 128 kbps)
- `default_hq.mp3` - High-quality MP3 (44KB, 320 kbps)
- `default_lq.mp3` - Low-quality MP3 (8.9KB, 64 kbps)
- `default.ogg` - OGG Vorbis audio test (17KB, ~128 kbps)
- `default.aac` - AAC audio test (18KB, 128 kbps)
- `default.flac` - FLAC audio test (60KB, lossless compression)
- `default.opus` - Opus audio test (12KB, 96 kbps, modern codec)
- `default_fx.wav` - Additional WAV audio test (189KB)

## File Generation

Most test media files were generated from source files using conversion tools:

### Image Formats (from default.png)

```bash
convert default.png default.jpg                    # JPEG
convert default.png default.gif                    # GIF  
convert default.png default.bmp                    # BMP
convert default.png default.tiff                   # TIFF
convert default.png default.webp                   # WebP
convert default.png -quality 95 default_hq.jpg     # High-quality JPEG
convert default.png -quality 50 default_lq.jpg     # Low-quality JPEG
```

### Audio Formats (from default.wav)

```bash
ffmpeg -i default.wav -codec:a libmp3lame -b:a 128k default.mp3     # MP3 (128k)
ffmpeg -i default.wav -codec:a libmp3lame -b:a 320k default_hq.mp3  # MP3 (320k)
ffmpeg -i default.wav -codec:a libmp3lame -b:a 64k default_lq.mp3   # MP3 (64k)
ffmpeg -i default.wav -codec:a libvorbis -q:a 4 default.ogg         # OGG Vorbis
ffmpeg -i default.wav -codec:a aac -b:a 128k default.aac            # AAC
ffmpeg -i default.wav -codec:a flac default.flac                    # FLAC (lossless)
ffmpeg -i default.wav -codec:a libopus -b:a 96k default.opus        # Opus
```

## File Usage in Tests

- **Unit Tests**: Media format detection and player selection
- **Integration Tests**: Actual media playback and transitions
- **Performance Tests**: Loading times and resource usage
- **Transition Tests**: Smooth switching between media types

## Notes

- Keep file sizes reasonable for fast test execution
- Ensure files are in common formats for broad compatibility
- Test files should be short duration (< 10 seconds for video/audio)
