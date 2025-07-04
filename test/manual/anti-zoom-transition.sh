#!/bin/bash

# Anti-Zoom Seamless Transition Test Script
# Specialized approach to eliminate MPV zoom effects
# Uses pre-loading and synchronization techniques

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_MEDIA_DIR="$SCRIPT_DIR/../fixtures/test-media"
IMAGE1_FILE="$TEST_MEDIA_DIR/houdini_picture_24bit.png"
VIDEO_FILE="$TEST_MEDIA_DIR/default.mp4"
IMAGE2_FILE="$TEST_MEDIA_DIR/houdini_picture_24bit.png"

# Extended timing for proper audio sync
IMAGE1_DISPLAY_TIME=6
VIDEO_REVEAL_DELAY=4
IMAGE_SWITCH_DELAY=6
FINAL_IMAGE_TIME=5

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

# Verify files exist
echo "📁 Checking media files..."
for file in "$IMAGE1_FILE" "$VIDEO_FILE" "$IMAGE2_FILE"; do
    if [ ! -f "$file" ]; then
        echo "❌ File not found: $file"
        exit 1
    fi
done
echo "✅ All media files found"

# Verify players available
for cmd in "$IMAGE_VIEWER" mpv; do
    if ! command -v "$cmd" &> /dev/null; then
        echo "❌ Player not found: $cmd"
        exit 1
    fi
done
echo "✅ All media players available"

echo ""
echo "🎬 Starting ANTI-ZOOM seamless transition test..."
echo "🎯 Approach: Pre-load video, control visibility with window management"
echo "✨ Extended timing for proper audio synchronization"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "🧹 Cleaning up processes..."
    pkill -f "mpv.*$VIDEO_FILE" 2>/dev/null || true
    pkill -f "imv.*$IMAGE1_FILE" 2>/dev/null || true
    pkill -f "imv.*$IMAGE2_FILE" 2>/dev/null || true
    pkill -f "feh.*$IMAGE1_FILE" 2>/dev/null || true
    pkill -f "feh.*$IMAGE2_FILE" 2>/dev/null || true
    sleep 0.5
    echo "   ✅ Cleanup complete"
}
trap cleanup EXIT

echo "▶️  Step 1: Starting background image"
echo "   Command: $IMAGE_VIEWER $IMAGE_ARGS"

$IMAGE_VIEWER $IMAGE_ARGS "$IMAGE1_FILE" &
IMAGE1_PID=$!

echo "   ✅ Image started (PID: $IMAGE1_PID)"
echo ""

echo "⏱️  Waiting ${IMAGE1_DISPLAY_TIME}s for image to establish..."
sleep "$IMAGE1_DISPLAY_TIME"

echo "▶️  Step 2: Pre-loading video (paused, minimized)"
echo "   Strategy: Start video paused and minimize to avoid zoom effect"

# Start MPV paused and try to minimize/hide it initially
mpv \
    --pause \
    --fullscreen \
    --no-terminal \
    --volume=90 \
    --osd-level=0 \
    --cursor-autohide=always \
    --video-zoom=0 \
    --video-pan-x=0 \
    --video-pan-y=0 \
    --no-border \
    --hwdec=auto \
    --vo=gpu \
    --speed=1.0 \
    --video-aspect-override=no \
    --keepaspect=no \
    --no-keepaspect-window \
    --interpolation=no \
    --audio-delay=0 \
    --untimed \
    --framedrop=no \
    --video-latency-hacks=yes \
    --opengl-swapinterval=0 \
    --geometry=100%:100%+0+0 \
    --autofit=100%x100% \
    --force-window-position=yes \
    "$VIDEO_FILE" &

VIDEO_PID=$!
echo "   ✅ Video pre-loaded paused (PID: $VIDEO_PID)"

echo ""
echo "⏱️  Waiting ${VIDEO_REVEAL_DELAY}s before revealing video..."
sleep "$VIDEO_REVEAL_DELAY"

echo "▶️  Step 3: Revealing video (unpausing + bringing to front)"
echo "   Strategy: Video should appear without zoom since it's already loaded"

# Send commands to unpause and bring to front
echo 'set pause no' | socat - /tmp/mpvsocket 2>/dev/null || {
    # Fallback: kill and restart if socket control fails
    kill "$VIDEO_PID" 2>/dev/null || true
    sleep 0.5
    
    echo "   Fallback: Restarting video with immediate play..."
    mpv \
        --fullscreen \
        --no-terminal \
        --volume=90 \
        --osd-level=0 \
        --cursor-autohide=always \
        --video-zoom=0 \
        --video-pan-x=0 \
        --video-pan-y=0 \
        --no-border \
        --ontop \
        --hwdec=auto \
        --vo=gpu \
        --speed=1.0 \
        --video-aspect-override=no \
        --keepaspect=no \
        --no-keepaspect-window \
        --interpolation=no \
        --audio-delay=0 \
        --video-latency-hacks=yes \
        --opengl-swapinterval=0 \
        "$VIDEO_FILE" &
    
    VIDEO_PID=$!
}

echo "   ✅ Video revealed and playing"
echo ""

echo "⏱️  Waiting ${IMAGE_SWITCH_DELAY}s before switching background..."
sleep "$IMAGE_SWITCH_DELAY"

echo "▶️  Step 4: Switching background image (while video plays)"

# Kill first image
if kill -0 "$IMAGE1_PID" 2>/dev/null; then
    kill "$IMAGE1_PID" 2>/dev/null
    echo "   ⏹️  First image stopped"
fi

# Start second image
echo "   Command: $IMAGE_VIEWER $IMAGE_ARGS"
$IMAGE_VIEWER $IMAGE_ARGS "$IMAGE2_FILE" &
IMAGE2_PID=$!

echo "   ✅ Background switched to second image (PID: $IMAGE2_PID)"
echo "   📺 Video still playing on top..."
echo ""

echo "⏱️  Waiting for video to complete naturally..."

# Wait for video to finish
wait "$VIDEO_PID" 2>/dev/null || true
echo "   ✅ Video completed - second image should now be visible"
echo ""

echo "▶️  Step 5: Final image display (${FINAL_IMAGE_TIME}s)"
echo "   📸 Second image visible without video overlay"

sleep "$FINAL_IMAGE_TIME"

echo ""
echo "✨ Anti-zoom seamless transition test complete!"
echo ""
echo "🎯 Evaluation checklist:"
echo "   ✓ Video pre-loaded to avoid zoom on appearance"
echo "   ✓ Extended timing for proper audio synchronization"
echo "   ✓ Background image switching during video playback"
echo "   ✓ Smooth transitions without zoom effects"
echo "   ✓ Audio synchronized throughout"
echo ""
echo "❓ Results:"
echo "   • Did you hear audio synchronized with video?"
echo "   • Was there a zoom effect when video appeared?"
echo "   • Were transitions smooth and seamless?"
echo "   • Any flicker or black screens?"
echo ""
