#!/bin/bash

# Seamless Transition Test Script
# Demonstrates: Image → Video → Image with overlapping processes
# Compatible with both X11 and Wayland environments

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_MEDIA_DIR="$SCRIPT_DIR/../fixtures/test-media"
IMAGE1_FILE="$TEST_MEDIA_DIR/houdini_picture_24bit.png"
VIDEO_FILE="$TEST_MEDIA_DIR/default.mp4"
IMAGE2_FILE="$TEST_MEDIA_DIR/houdini_picture_24bit.png"

# Timing configuration (in seconds) - Increased for proper audio sync
IMAGE1_DISPLAY_TIME=6
VIDEO_PLAY_TIME=12  # Let video play longer
IMAGE_SWITCH_DELAY=4  # Wait longer before switching
FINAL_IMAGE_TIME=5

# Check session type
SESSION_TYPE="${XDG_SESSION_TYPE:-unknown}"
echo "🖥️  Detected session type: $SESSION_TYPE"

# Choose appropriate image viewer
if [ "$SESSION_TYPE" = "wayland" ]; then
    IMAGE_VIEWER="imv-wayland"
    IMAGE_ARGS="-f"
    echo "🎯 Using Wayland-compatible viewer: $IMAGE_VIEWER"
else
    IMAGE_VIEWER="feh"
    IMAGE_ARGS="--fullscreen --hide-pointer"
    echo "🎯 Using X11 viewer: $IMAGE_VIEWER"
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

# Verify media players are available
echo "🔧 Checking media players..."
if ! command -v "$IMAGE_VIEWER" &> /dev/null; then
    echo "❌ Image viewer not found: $IMAGE_VIEWER"
    if [ "$SESSION_TYPE" = "wayland" ]; then
        echo "💡 Install with: sudo apt install imv"
    else
        echo "💡 Install with: sudo apt install feh"
    fi
    exit 1
fi

if ! command -v mpv &> /dev/null; then
    echo "❌ Video player not found: mpv"
    echo "💡 Install with: sudo apt install mpv"
    exit 1
fi
echo "✅ All media players available"

echo ""
echo "🎬 Starting seamless transition demonstration..."
echo "🎯 Sequence: Image₁ → Video (overlay) → Image₂ (background switch) → Video ends → Image₂"
echo "✨ Processes will overlap for seamless transitions"
echo ""

# Function to cleanup processes
cleanup() {
    echo ""
    echo "🧹 Cleaning up processes..."
    
    if [ ! -z "$IMAGE1_PID" ] && kill -0 "$IMAGE1_PID" 2>/dev/null; then
        kill "$IMAGE1_PID" 2>/dev/null
        echo "   ⏹️  Image1 process stopped"
    fi
    
    if [ ! -z "$VIDEO_PID" ] && kill -0 "$VIDEO_PID" 2>/dev/null; then
        kill "$VIDEO_PID" 2>/dev/null
        echo "   ⏹️  Video process stopped"
    fi
    
    if [ ! -z "$IMAGE2_PID" ] && kill -0 "$IMAGE2_PID" 2>/dev/null; then
        kill "$IMAGE2_PID" 2>/dev/null
        echo "   ⏹️  Image2 process stopped"
    fi
    
    echo "   ✅ Cleanup complete"
}

# Set trap for cleanup on script exit
trap cleanup EXIT

# Step 1: Start first image and leave it running
echo "▶️  Step 1: Starting background image (persistent)"
echo "   Command: $IMAGE_VIEWER $IMAGE_ARGS"

$IMAGE_VIEWER $IMAGE_ARGS "$IMAGE1_FILE" &
IMAGE1_PID=$!

echo "   ✅ Background image started (PID: $IMAGE1_PID)"
echo ""

# Wait for image to establish
echo "⏱️  Waiting ${IMAGE1_DISPLAY_TIME}s for image to fully establish..."
sleep "$IMAGE1_DISPLAY_TIME"

# Step 2: Start video (should appear on top)
echo "▶️  Step 2: Starting video overlay (should appear on top)"
echo "   Command: mpv --fullscreen --no-terminal --volume=60"

mpv \
    --fullscreen \
    --no-terminal \
    --volume=80 \
    --osd-level=0 \
    --cursor-autohide=always \
    --no-keepaspect-window \
    --video-zoom=0 \
    --video-pan-x=0 \
    --video-pan-y=0 \
    --no-border \
    --ontop \
    --hwdec=auto \
    --vo=gpu \
    --speed=1.0 \
    --video-aspect-override=no \
    --interpolation=no \
    --blend-subtitles=no \
    --sharpen=0 \
    --deband=no \
    --audio-delay=0 \
    --video-latency-hacks=yes \
    --opengl-swapinterval=0 \
    --no-resume-playback \
    --start=+0 \
    --force-seekable=yes \
    "$VIDEO_FILE" &

VIDEO_PID=$!
echo "   ✅ Video started (PID: $VIDEO_PID)"
echo ""

# Step 3: Wait, then switch background image while video plays
echo "⏱️  Waiting ${IMAGE_SWITCH_DELAY}s after video start before switching background..."
sleep "$IMAGE_SWITCH_DELAY"

echo "▶️  Step 3: Switching background image (while video plays on top)"

# Kill first image
if kill -0 "$IMAGE1_PID" 2>/dev/null; then
    kill "$IMAGE1_PID"
    echo "   ⏹️  First image process stopped"
fi

# Start second image
echo "   Command: $IMAGE_VIEWER $IMAGE_ARGS"
$IMAGE_VIEWER $IMAGE_ARGS "$IMAGE2_FILE" &
IMAGE2_PID=$!

echo "   ✅ Background switched to second image (PID: $IMAGE2_PID)"
echo "   📺 Video still playing on top..."
echo ""

# Step 4: Wait for video to finish
echo "⏱️  Waiting for video to complete naturally..."

# Wait for video process to finish
wait "$VIDEO_PID" 2>/dev/null || true
echo "   ✅ Video completed - second image should now be visible"
echo ""

# Step 5: Display final image
echo "▶️  Step 4: Final image display (${FINAL_IMAGE_TIME}s)"
echo "   📸 Second image visible with video overlay gone"

sleep "$FINAL_IMAGE_TIME"

echo ""
echo "✨ Seamless transition demonstration complete!"
echo ""
echo "🎯 Evaluation checklist:"
echo "   ✓ First image appeared immediately"
echo "   ✓ Video started playing on top (no flicker)"
echo "   ✓ Background image switched during video (unnoticeable)"
echo "   ✓ Video ended revealing second image (seamless)"
echo "   ✓ No cursor visible throughout sequence"
echo ""
echo "🔍 Expected behavior:"
echo "   • No zoom effects during transitions"
echo "   • No flicker or black screens between media"
echo "   • Smooth overlay of video on top of images"
echo "   • Audio synchronized with video throughout"
echo ""
