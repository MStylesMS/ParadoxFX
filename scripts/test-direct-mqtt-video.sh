#!/bin/bash
# Simple MQTT Test Script (bypasses ParadoxFX device manager)
# This will test MQTT communication and video playback directly

echo "=================================================="
echo "Simple Pi5 MQTT Test (Direct MPV)"
echo "=================================================="
echo ""
echo "This script bypasses ParadoxFX device manager issues"
echo "and tests MQTT + video playback directly."
echo ""

# Check if MQTT broker is running
echo "Checking MQTT broker..."
if ! pgrep mosquitto > /dev/null; then
    echo "⚠️  MQTT broker not running. Starting it..."
    sudo systemctl start mosquitto
else
    echo "✅ MQTT broker is running"
fi
echo ""

# Set up MQTT listener in background to confirm messages are being sent
echo "Setting up MQTT listener..."
timeout 30 mosquitto_sub -h localhost -t "paradox/+/screen/commands" -v &
MQTT_LISTENER_PID=$!
echo "✅ MQTT listener started (PID: $MQTT_LISTENER_PID)"
echo ""

# Function to test video playback directly with MPV
test_video_direct() {
    local zone="$1"
    local display_num="$2"
    local audio_device="$3"
    local media_file="$4"
    
    echo "Testing direct video playback:"
    echo "  Zone: $zone"
    echo "  Display: $display_num"
    echo "  Audio: $audio_device"
    echo "  File: $media_file"
    echo ""
    
    # Use different MPV args based on screen
    if [ "$display_num" = "0" ]; then
        # Screen 0 - use normal fullscreen
        DISPLAY=:0 mpv --fs --audio-device="$audio_device" "$media_file" --really-quiet --length=8 &
    else
        # Screen 1 - use geometry to position on second monitor
        DISPLAY=:0 mpv --geometry=1920x1080+1920+0 --fs --audio-device="$audio_device" "$media_file" --really-quiet --length=8 &
    fi
    
    MPV_PID=$!
    
    echo "MPV started (PID: $MPV_PID). Playing for 8 seconds..."
    sleep 8
    
    # Clean up MPV process
    kill $MPV_PID 2>/dev/null
    wait $MPV_PID 2>/dev/null
    echo "Video playback completed."
    echo ""
}

# Function to wait for user response
wait_for_response() {
    local question="$1"
    echo "$question"
    echo "Type 'y' for YES, 'n' for NO:"
    read -r response
    case $response in
        [Yy]* ) return 0;;
        [Nn]* ) return 1;;
        * ) echo "Please answer y or n."; wait_for_response "$question";;
    esac
}

echo "=================================================="
echo "TEST 1: Direct Video on Screen 0 (HDMI 0)"
echo "=================================================="
echo ""

# First send an MQTT message (even though ParadoxFX isn't running)
echo "📡 Sending MQTT message (for logging/testing):"
mosquitto_pub -h localhost -t "paradox/zone1/screen/commands" -m '{"Command": "playVideo", "Video": "default.avi"}'
echo "✅ MQTT message sent"
echo ""

# Then test direct video playback
test_video_direct "Screen 0" "0" "pulse/alsa_output.platform-107c701400.hdmi.hdmi-stereo" "/opt/paradox/media/zone1/default.avi"

# Ask for confirmation
wait_for_response "Did you see the video on Screen 0 (left/primary) AND hear audio?"
screen0_result=$?

echo ""
echo "=================================================="
echo "TEST 2: Direct Video on Screen 1 (HDMI 1)" 
echo "=================================================="
echo ""

# Send MQTT message
echo "📡 Sending MQTT message:"
mosquitto_pub -h localhost -t "paradox/zone2/screen/commands" -m '{"Command": "playVideo", "Video": "default.avi"}'
echo "✅ MQTT message sent"
echo ""

# Test direct video playback on second screen
test_video_direct "Screen 1" "1" "pulse/alsa_output.platform-107c706400.hdmi.hdmi-stereo" "/opt/paradox/media/zone2/default.avi"

# Ask for confirmation
wait_for_response "Did you see the video on Screen 1 (right/secondary) AND hear audio?"
screen1_result=$?

# Clean up MQTT listener
kill $MQTT_LISTENER_PID 2>/dev/null

echo ""
echo "=================================================="
echo "DIRECT TEST RESULTS"
echo "=================================================="
echo ""

if [ $screen0_result -eq 0 ]; then
    echo "✅ Screen 0 Direct Test: PASSED"
else
    echo "❌ Screen 0 Direct Test: FAILED"
fi

if [ $screen1_result -eq 0 ]; then
    echo "✅ Screen 1 Direct Test: PASSED"
else
    echo "❌ Screen 1 Direct Test: FAILED"
fi

echo ""
if [ $screen0_result -eq 0 ] && [ $screen1_result -eq 0 ]; then
    echo "🎉 DIRECT TESTS PASSED!"
    echo ""
    echo "The hardware setup works correctly. The issue is in ParadoxFX device initialization."
    echo "Recommendations:"
    echo "  1. Check ParadoxFX device manager error logging"
    echo "  2. Verify screen device initialization code"
    echo "  3. Test with simpler device configuration"
else
    echo "⚠️  Some direct tests failed."
    echo ""
    echo "Hardware troubleshooting needed:"
    echo "  • Check HDMI connections and display power"
    echo "  • Verify audio device names: pactl list sinks short"
    echo "  • Test displays: DISPLAY=:0 xrandr --listmonitors"
fi

echo ""
echo "MQTT messages were sent to test MQTT broker functionality."
echo "Direct MPV tests bypassed ParadoxFX to isolate hardware issues."
