#!/bin/bash

# Alternative Seamless Transition Test Script
# Multiple approaches to eliminate zoom effects and achieve perfect transitions

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_MEDIA_DIR="$SCRIPT_DIR/../fixtures/test-media"
IMAGE1_FILE="$TEST_MEDIA_DIR/default_hq.jpg"
VIDEO_FILE="$TEST_MEDIA_DIR/default.mp4"
IMAGE2_FILE="$TEST_MEDIA_DIR/default_hq.jpg"

# Check session type
SESSION_TYPE="${XDG_SESSION_TYPE:-unknown}"
echo "🖥️  Session type: $SESSION_TYPE"

# Choose image viewer
if [ "$SESSION_TYPE" = "wayland" ]; then
    IMAGE_VIEWER="imv-wayland"
    IMAGE_ARGS="-f"
else
    IMAGE_VIEWER="feh"
    IMAGE_ARGS="--fullscreen --hide-pointer"
fi

# Verify files and players
for file in "$IMAGE1_FILE" "$VIDEO_FILE" "$IMAGE2_FILE"; do
    [ ! -f "$file" ] && echo "❌ Missing: $file" && exit 1
done

for cmd in "$IMAGE_VIEWER" mpv; do
    command -v "$cmd" >/dev/null || { echo "❌ Missing: $cmd"; exit 1; }
done

echo "✅ All files and players available"
echo ""

# Function to cleanup
cleanup() {
    echo "🧹 Cleaning up all media processes..."
    pkill -f "mpv.*$VIDEO_FILE" 2>/dev/null || true
    pkill -f "imv.*$IMAGE1_FILE" 2>/dev/null || true
    pkill -f "imv.*$IMAGE2_FILE" 2>/dev/null || true
    pkill -f "feh.*$IMAGE1_FILE" 2>/dev/null || true
    pkill -f "feh.*$IMAGE2_FILE" 2>/dev/null || true
    sleep 0.5
    echo "✅ Cleanup complete"
}
trap cleanup EXIT

echo "🎬 Testing multiple transition approaches..."
echo ""

# Approach 1: MPV with extreme anti-zoom settings
echo "🔬 Approach 1: MPV with maximum anti-zoom settings"
echo "▶️  Image 1..."
$IMAGE_VIEWER $IMAGE_ARGS "$IMAGE1_FILE" &
sleep 3

echo "▶️  Video (with extreme anti-zoom)..."
mpv \
    --fullscreen \
    --no-terminal \
    --volume=60 \
    --osd-level=0 \
    --cursor-autohide=always \
    --video-zoom=0 \
    --video-pan-x=0 \
    --video-pan-y=0 \
    --no-keepaspect-window \
    --video-aspect-override=no \
    --video-aspect-method=container \
    --geometry=100%:100% \
    --no-border \
    --ontop \
    --hwdec=auto \
    --vo=gpu \
    --opengl-swapinterval=0 \
    --video-sync=display-resample \
    --interpolation=no \
    --tscale=oversample \
    --scale=lanczos \
    --cscale=lanczos \
    --dscale=lanczos \
    --correct-downscaling=yes \
    --linear-downscaling=yes \
    --sigmoid-upscaling=yes \
    --deband=no \
    --sharpen=0 \
    --blend-subtitles=no \
    --sub-visibility=no \
    --osd-duration=0 \
    --no-osd-bar \
    --video-rotate=0 \
    --video-aspect=0 \
    --keepaspect=no \
    --no-window-dragging \
    --force-window-position=yes \
    --geometry=+0+0 \
    --autofit=100%x100% \
    --no-hidpi-window-scale \
    "$VIDEO_FILE"

echo "   ✅ Approach 1 complete"
cleanup
sleep 2

# Approach 2: Pre-sized MPV window
echo "🔬 Approach 2: Pre-sized MPV window method"
echo "▶️  Getting screen resolution..."
if command -v xrandr >/dev/null 2>&1; then
    RESOLUTION=$(xrandr | grep -E "^\s*[0-9]+x[0-9]+" | head -1 | awk '{print $1}')
    WIDTH=$(echo $RESOLUTION | cut -d'x' -f1)
    HEIGHT=$(echo $RESOLUTION | cut -d'x' -f2)
    echo "   📐 Screen: ${WIDTH}x${HEIGHT}"
else
    WIDTH=1920
    HEIGHT=1080
    echo "   📐 Assuming: ${WIDTH}x${HEIGHT}"
fi

echo "▶️  Image 1..."
$IMAGE_VIEWER $IMAGE_ARGS "$IMAGE1_FILE" &
sleep 3

echo "▶️  Video (pre-sized to exact resolution)..."
mpv \
    --fullscreen \
    --no-terminal \
    --volume=60 \
    --osd-level=0 \
    --cursor-autohide=always \
    --video-zoom=0 \
    --autofit-larger=${WIDTH}x${HEIGHT} \
    --autofit-smaller=${WIDTH}x${HEIGHT} \
    --geometry=${WIDTH}x${HEIGHT}+0+0 \
    --no-keepaspect-window \
    --ontop \
    --no-border \
    --force-window=yes \
    --vo=gpu \
    --hwdec=auto \
    "$VIDEO_FILE"

echo "   ✅ Approach 2 complete"
cleanup
sleep 2

# Approach 3: Using weston-terminal for Wayland (if available)
if [ "$SESSION_TYPE" = "wayland" ] && command -v weston-image >/dev/null 2>&1; then
    echo "🔬 Approach 3: Wayland-native image display with MPV"
    echo "▶️  Image 1 (weston-image)..."
    weston-image "$IMAGE1_FILE" &
    sleep 3
    
    echo "▶️  Video..."
    mpv --fullscreen --no-terminal --volume=60 "$VIDEO_FILE"
    
    echo "   ✅ Approach 3 complete"
    cleanup
    sleep 2
fi

echo ""
echo "🎯 Testing Summary:"
echo "   Approach 1: Maximum anti-zoom MPV settings"
echo "   Approach 2: Pre-sized window to exact screen resolution"
if [ "$SESSION_TYPE" = "wayland" ]; then
    echo "   Approach 3: Wayland-native tools (if available)"
fi
echo ""
echo "❓ Questions to evaluate:"
echo "   1. Which approach had the least zoom effect?"
echo "   2. Which had the smoothest transitions?"
echo "   3. Which had the best audio sync?"
echo "   4. Any flicker or black screens?"
echo ""
