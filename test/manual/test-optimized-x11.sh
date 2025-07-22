#!/bin/bash
# Optimized MPV Commands for Pi5 Dual-Screen Setup
# Hardware accelerated video playback with proper screen targeting

echo "🎬 Pi5 Optimized MPV Commands"
echo "============================"
echo ""
echo "SUCCESS: X11 enables proper dual-screen video routing!"
echo ""

# Test video file
TEST_VIDEO="/opt/paradox/media/zone1/default.mp4"
[ ! -f "$TEST_VIDEO" ] && TEST_VIDEO="/opt/paradox/media/zone1/default.avi"

echo "Testing optimized configurations..."

echo ""
echo "🖥️  SCREEN 0 - Optimized"
echo "========================"
echo "Command: mpv --screen=0 --hwdec=auto --vo=gpu --profile=fast"
read -p "Press Enter to test..."

timeout 8s mpv --screen=0 --fullscreen --no-osc --no-input-default-bindings \
    --hwdec=auto --vo=gpu --profile=fast \
    --audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0 \
    --cache=yes --demuxer-max-bytes=50M \
    --really-quiet --no-terminal "$TEST_VIDEO"

echo ""
echo "🖥️  SCREEN 1 - Optimized" 
echo "========================"
echo "Command: mpv --screen=1 --hwdec=auto --vo=gpu --profile=fast"
read -p "Press Enter to test..."

timeout 8s mpv --screen=1 --fullscreen --no-osc --no-input-default-bindings \
    --hwdec=auto --vo=gpu --profile=fast \
    --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \
    --cache=yes --demuxer-max-bytes=50M \
    --really-quiet --no-terminal "$TEST_VIDEO"

echo ""
echo "Was the video smoother with these optimized settings? (y/n)"
read -r smoother

if [ "$smoother" = "y" ]; then
    echo ""
    echo "✅ RECOMMENDED MPV CONFIGURATION FOR PARADOXFX:"
    echo "=============================================="
    echo ""
    echo "Screen 0:"
    echo "mpv --screen=0 --fullscreen --hwdec=auto --vo=gpu --profile=fast \\"
    echo "    --audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0 \\"
    echo "    --cache=yes --demuxer-max-bytes=50M \\"
    echo "    --no-osc --no-input-default-bindings [VIDEO_FILE]"
    echo ""
    echo "Screen 1:"
    echo "mpv --screen=1 --fullscreen --hwdec=auto --vo=gpu --profile=fast \\"
    echo "    --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \\"
    echo "    --cache=yes --demuxer-max-bytes=50M \\"
    echo "    --no-osc --no-input-default-bindings [VIDEO_FILE]"
    echo ""
    echo "These settings enable:"
    echo "- Hardware decode acceleration (--hwdec=auto)"
    echo "- GPU rendering (--vo=gpu)"
    echo "- Fast profile optimizations (--profile=fast)"
    echo "- Better caching for smooth playback"
else
    echo ""
    echo "Alternative configurations to try:"
    echo ""
    echo "1. Basic GPU rendering:"
    echo "   mpv --screen=N --vo=gpu --hwdec=no"
    echo ""
    echo "2. Software decode with XV output:"
    echo "   mpv --screen=N --vo=xv --hwdec=no"
    echo ""
    echo "3. Increase GPU memory (requires reboot):"
    echo "   echo 'gpu_mem=128' | sudo tee -a /boot/firmware/config.txt"
fi

echo ""
echo "📝 NEXT STEPS:"
echo "1. Update ParadoxFX configuration with working commands"
echo "2. Test with actual ParadoxFX application"
echo "3. Consider GPU memory increase if performance issues persist"
