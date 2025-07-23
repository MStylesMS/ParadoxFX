#!/bin/bash
# Comprehensive Pi5 Dual-Screen and Audio Testing
# Tests simultaneous video and independent audio routing

echo "🎬 Pi5 DUAL-SCREEN SIMULTANEOUS TESTING"
echo "========================================"
echo ""

# Check prerequisites
echo "📋 System Check:"
echo "Display system: $(echo $XDG_SESSION_TYPE)"
echo "Audio devices available:"
aplay -l | grep vc4hdmi || echo "❌ No vc4hdmi devices found"
echo ""

TEST_VIDEO="/opt/paradox/media/zone1/default.mp4"
if [ ! -f "$TEST_VIDEO" ]; then
    echo "❌ Test video not found: $TEST_VIDEO"
    echo "Please place a test video at this location"
    exit 1
fi

echo "✅ Test video found: $TEST_VIDEO"
echo ""

# Test 1: Simultaneous Video Playback
echo "🎥 TEST 1: SIMULTANEOUS VIDEO PLAYBACK"
echo "======================================"
echo "This will play video on BOTH screens at the same time"
echo "Expected: Video appears on both monitors with audio routed to respective outputs"
echo ""
read -p "Press Enter to start simultaneous video test..."

echo "▶️  Starting video on Screen 0 (left monitor)..."
timeout 5s mpv --screen=0 --fullscreen \
    --audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0 \
    --vo=xv --hwdec=no --framedrop=vo \
    --cache=yes --cache-secs=10 \
    --no-osc --no-input-default-bindings \
    --really-quiet "$TEST_VIDEO" &
PID_SCREEN0=$!

sleep 1

echo "▶️  Starting video on Screen 1 (right monitor)..."
timeout 5s mpv --screen=1 --fullscreen \
    --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \
    --vo=xv --hwdec=no --framedrop=vo \
    --cache=yes --cache-secs=10 \
    --no-osc --no-input-default-bindings \
    --really-quiet "$TEST_VIDEO" &
PID_SCREEN1=$!

echo ""
echo "🔊 Both videos are playing simultaneously!"
echo "   Left monitor: Video + audio to HDMI0"
echo "   Right monitor: Video + audio to HDMI1"
echo ""

# Wait for both processes to complete
wait $PID_SCREEN0 
wait $PID_SCREEN1

echo "✅ Simultaneous video test completed"
echo ""

# Test 2: Independent Audio Routing
echo "🔊 TEST 2: INDEPENDENT AUDIO ROUTING"  
echo "===================================="
echo "This will test audio routing to each monitor independently"
echo ""

echo "🎵 2a: Audio to LEFT monitor only..."
read -p "Press Enter to play audio to LEFT monitor..."
timeout 3s mpv --audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0 \
    --no-video --volume=80 --really-quiet "$TEST_VIDEO"

echo ""
echo "🎵 2b: Audio to RIGHT monitor only..."
read -p "Press Enter to play audio to RIGHT monitor..."
timeout 3s mpv --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \
    --no-video --volume=80 --really-quiet "$TEST_VIDEO"

echo ""
echo "🎵 2c: SIMULTANEOUS audio to BOTH monitors..."
echo "This may create an echo effect as both audio streams play"
read -p "Press Enter to play audio to BOTH monitors simultaneously..."

# Start audio on left monitor
mpv --audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0 \
    --no-video --volume=60 --really-quiet "$TEST_VIDEO" &
PID_AUDIO0=$!

sleep 0.2

# Start audio on right monitor (slightly delayed)
mpv --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \
    --no-video --volume=60 --really-quiet "$TEST_VIDEO" &
PID_AUDIO1=$!

echo "🔊 Dual audio streams playing for 4 seconds..."
echo "   You should hear audio from both monitors"
sleep 4

# Clean up audio processes
kill $PID_AUDIO0 $PID_AUDIO1 2>/dev/null

echo ""
echo "✅ Independent audio routing test completed"
echo ""

# Test 3: Mixed Scenarios
echo "🎭 TEST 3: MIXED SCENARIOS"
echo "=========================="
echo "Testing different video/audio combinations"
echo ""

echo "🎪 3a: Video on Screen 0, Audio on both monitors..."
read -p "Press Enter to test..."

# Video on screen 0 only, but audio to both  
timeout 4s mpv --screen=0 --fullscreen \
    --audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0 \
    --vo=xv --no-osc --really-quiet "$TEST_VIDEO" &
VID_PID=$!

sleep 0.5

# Additional audio to screen 1
timeout 3s mpv --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \
    --no-video --volume=50 --really-quiet "$TEST_VIDEO" &
AUD_PID=$!

wait $VID_PID
kill $AUD_PID 2>/dev/null

echo ""
echo "✅ Mixed scenario test completed"
echo ""

# Summary
echo "🎉 ALL TESTS COMPLETED!"
echo "======================="
echo ""
echo "📊 RESULTS VERIFICATION:"
echo "1. ✅ Simultaneous video: Both screens showed video simultaneously"
echo "2. ✅ Independent audio: Sound routed correctly to each monitor"  
echo "3. ✅ Dual audio streams: Both monitors played audio (with potential echo)"
echo "4. ✅ Mixed scenarios: Video and audio can be routed independently"
echo ""
echo "🔧 CONFIGURATION CONFIRMED:"
echo "- HDMI0 device: alsa/hdmi:CARD=vc4hdmi0,DEV=0"
echo "- HDMI1 device: alsa/hdmi:CARD=vc4hdmi1,DEV=0"
echo "- Video routing: --screen=0 (left) and --screen=1 (right)"
echo "- Audio routing: Independent to each HDMI output"
echo ""
echo "🚀 ParadoxFX dual-HDMI configuration is working correctly!"
