#!/bin/bash
# ParadoxFX Pi5 Dual-HDMI Test Script
# ====================================
# This script tests video playback on both HDMI outputs with their respective audio

echo "=================================================="
echo "ParadoxFX Pi5 Dual-HDMI Test"
echo "=================================================="
echo ""
echo "This test will verify:"
echo "  1. Video playback on Screen 0 (HDMI 0) with audio"
echo "  2. Video playback on Screen 1 (HDMI 1) with audio"
echo ""
echo "Note: Pi5 analog audio is not available/tested in this setup"
echo ""

# Check if MQTT broker is running
echo "Checking MQTT broker..."
if ! pgrep mosquitto > /dev/null; then
    echo "⚠️  MQTT broker (mosquitto) not running. Starting it..."
    sudo systemctl start mosquitto || echo "❌ Failed to start mosquitto"
else
    echo "✅ MQTT broker is running"
fi
echo ""

# Verify media files
echo "Verifying media files..."
if [ ! -f "/opt/paradox/media/zone1/default.avi" ] || [ ! -f "/opt/paradox/media/zone2/default.avi" ]; then
    echo "❌ Media files missing. Please ensure video files are in /opt/paradox/media/zone1/ and zone2/"
    exit 1
fi
echo "✅ Media files found"
echo ""

# Function to wait for user confirmation
wait_for_response() {
    local question="$1"
    local response
    
    while true; do
        echo "$question"
        echo "Type 'y' for YES, 'n' for NO, or 'd' for DEBUG:"
        read -r response
        case $response in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            [Dd]* ) return 2;;
            * ) echo "Please answer y, n, or d.";;
        esac
    done
}

# Function to send MQTT command
send_mqtt_command() {
    local topic="$1"
    local message="$2"
    local description="$3"
    
    echo "📡 Sending MQTT command: $description"
    echo "   Topic: $topic"
    echo "   Message: $message"
    echo ""
    
    mosquitto_pub -h localhost -t "$topic" -m "$message"
    
    if [ $? -eq 0 ]; then
        echo "✅ MQTT command sent successfully"
    else
        echo "❌ Failed to send MQTT command"
        return 1
    fi
}

# Function to debug audio/video issues
debug_issue() {
    local zone="$1"
    echo ""
    echo "🔧 DEBUG MODE for Zone $zone"
    echo "==============================="
    
    echo "Checking audio devices..."
    echo "Audio cards:"
    cat /proc/asound/cards || echo "Could not read audio cards"
    echo ""
    
    echo "PulseAudio sinks:"
    pactl list sinks short || echo "PulseAudio not available"
    echo ""
    
    echo "Active MPV processes:"
    ps aux | grep mpv | grep -v grep || echo "No MPV processes found"
    echo ""
    
    echo "Checking display setup..."
    echo "Connected displays:"
    xrandr --listmonitors || echo "Could not query displays"
    echo ""
    
    echo "Would you like to try the command again? (y/n)"
    read -r retry
    if [[ $retry =~ ^[Yy] ]]; then
        return 0
    else
        return 1
    fi
}

echo "Starting ParadoxFX Pi5 dual-HDMI test..."
echo ""
echo "Make sure:"
echo "  1. Both HDMI displays are connected and powered on"
echo "  2. Audio is enabled on both displays (not muted)"
echo "  3. You can see both screens"
echo ""
echo "Press ENTER to continue..."
read

echo ""
echo "=================================================="
echo "TEST 1: Video on Screen 0 (HDMI 0)"
echo "=================================================="
echo ""
echo "This will play a video on Screen 0 with audio through HDMI 0"
echo "Look at the LEFT/PRIMARY screen and listen for audio"
echo ""

# Test Screen 0
send_mqtt_command "paradox/zone1/screen/command" '{"Command": "playVideo", "Video": "default.avi"}' "Play video on Screen 0"

echo "Waiting 8 seconds for video to play..."
sleep 8

# Ask for confirmation
wait_for_response "Did you see the video on Screen 0 (left/primary) AND hear audio from that screen?"
screen0_result=$?

if [ $screen0_result -eq 1 ]; then
    echo "❌ Screen 0 test FAILED"
    echo "Let's debug this issue..."
    if debug_issue "1"; then
        send_mqtt_command "paradox/zone1/screen/command" '{"Command": "playVideo", "Video": "default.avi"}' "Retry video on Screen 0"
        sleep 8
        wait_for_response "Did the retry work for Screen 0?"
        screen0_result=$?
    fi
elif [ $screen0_result -eq 2 ]; then
    debug_issue "1"
    screen0_result=1  # Mark as failed for now
fi

# Stop video before next test
send_mqtt_command "paradox/zone1/screen/command" '{"Command": "stopVideo"}' "Stop video on Screen 0"
sleep 2

echo ""
echo "=================================================="
echo "TEST 2: Video on Screen 1 (HDMI 1)"
echo "=================================================="
echo ""
echo "This will play a video on Screen 1 with audio through HDMI 1"
echo "Look at the RIGHT/SECONDARY screen and listen for audio"
echo ""

# Test Screen 1
send_mqtt_command "paradox/zone2/screen/command" '{"Command": "playVideo", "Video": "default.avi"}' "Play video on Screen 1"

echo "Waiting 8 seconds for video to play..."
sleep 8

# Ask for confirmation
wait_for_response "Did you see the video on Screen 1 (right/secondary) AND hear audio from that screen?"
screen1_result=$?

if [ $screen1_result -eq 1 ]; then
    echo "❌ Screen 1 test FAILED"
    echo "Let's debug this issue..."
    if debug_issue "2"; then
        send_mqtt_command "paradox/zone2/screen/command" '{"Command": "playVideo", "Video": "default.avi"}' "Retry video on Screen 1"
        sleep 8
        wait_for_response "Did the retry work for Screen 1?"
        screen1_result=$?
    fi
elif [ $screen1_result -eq 2 ]; then
    debug_issue "2"
    screen1_result=1  # Mark as failed for now
fi

# Stop video
send_mqtt_command "paradox/zone2/screen/command" '{"Command": "stopVideo"}' "Stop video on Screen 1"
sleep 2

echo ""
echo "=================================================="
echo "TEST RESULTS SUMMARY"
echo "=================================================="
echo ""

if [ $screen0_result -eq 0 ]; then
    echo "✅ Screen 0 (HDMI 0): PASSED - Video and audio working"
else
    echo "❌ Screen 0 (HDMI 0): FAILED - Video or audio not working"
fi

if [ $screen1_result -eq 0 ]; then
    echo "✅ Screen 1 (HDMI 1): PASSED - Video and audio working"
else
    echo "❌ Screen 1 (HDMI 1): FAILED - Video or audio not working"
fi

echo ""
if [ $screen0_result -eq 0 ] && [ $screen1_result -eq 0 ]; then
    echo "🎉 ALL TESTS PASSED! Pi5 dual-HDMI setup is working correctly."
    echo ""
    echo "Your ParadoxFX system is ready for:"
    echo "  • Independent video content on each screen"
    echo "  • Zone-specific audio through HDMI"
    echo "  • MQTT-controlled media playback"
else
    echo "⚠️  Some tests failed. Common issues and solutions:"
    echo ""
    echo "If no video appeared:"
    echo "  • Check HDMI connections and display power"
    echo "  • Verify display configuration with: xrandr --listmonitors"
    echo "  • Check if ParadoxFX is running: ps aux | grep node"
    echo ""
    echo "If no audio was heard:"
    echo "  • Check display audio settings (not muted)"
    echo "  • Verify audio devices with: pactl list sinks short"
    echo "  • Check HDMI audio detection"
    echo ""
    echo "General debugging:"
    echo "  • Check ParadoxFX logs in the main terminal"
    echo "  • Verify MQTT broker is running: systemctl status mosquitto"
    echo "  • Test manual MPV playback: mpv /opt/paradox/media/zone1/default.avi"
fi

echo ""
echo "Test completed. Check the ParadoxFX terminal for any error messages."
