#!/bin/bash
# MPV Screen Targeting Test for Pi5 Dual HDMI
# Testing different methods to route video to specific screens

echo "=================================================="
echo "MPV Screen Targeting Test"
echo "=================================================="
echo ""
echo "Testing different methods to route video to Screen 1"
echo ""

MEDIA_FILE="/opt/paradox/media/zone1/default.avi"
AUDIO_DEVICE="pulse/alsa_output.platform-107c706400.hdmi.hdmi-stereo"

if [ ! -f "$MEDIA_FILE" ]; thenalsa_output.platform-fef05700.hdmi.hdmi-stere
    echo "❌ Media file not found: $MEDIA_FILE"
    exit 1
fi

echo "Available monitors:"
DISPLAY=:0 xrandr --listmonitors
echo ""

# Function to test different MPV screen targeting methods
test_mpv_method() {
    local method_name="$1"
    local mpv_args="$2"
    
    echo "Testing Method: $method_name"
    echo "MPV Args: $mpv_args"
    echo "Playing for 5 seconds..."
    
    DISPLAY=:0 mpv $mpv_args --audio-device="$AUDIO_DEVICE" "$MEDIA_FILE" --really-quiet --length=5 &
    MPV_PID=$!
    
    sleep 5
    kill $MPV_PID 2>/dev/null
    wait $MPV_PID 2>/dev/null
    
    echo "Did the video appear on Screen 1 (right/secondary)? (y/n)"
    read -r response
    case $response in
        [Yy]* ) echo "✅ Method $method_name: SUCCESS"; return 0;;
        * ) echo "❌ Method $method_name: FAILED"; return 1;;
    esac
    echo ""
}

echo "We'll test several methods to target Screen 1..."
echo "Watch the RIGHT/SECONDARY screen for video"
echo ""
echo "Press ENTER to start testing..."
read

# Method 1: --screen parameter
test_mpv_method "1: --screen=1" "--screen=1 --fs"

# Method 2: --geometry with position
test_mpv_method "2: --geometry (position)" "--geometry=1920x1080+1920+0 --fs"

# Method 3: --fullscreen-monitor-name
test_mpv_method "3: --fullscreen-monitor-name" "--fullscreen-monitor-name=XWAYLAND1 --fs"

# Method 4: Xinerama screen
test_mpv_method "4: --xinerama-screen" "--xinerama-screen=1 --fs"

# Method 5: Window position without fullscreen
test_mpv_method "5: Window position" "--geometry=1920x1080+1920+0"

# Method 6: SDL video output with display
test_mpv_method "6: SDL video output" "--vo=sdl --fs --screen=1"

echo ""
echo "=================================================="
echo "Testing Complete"
echo "=================================================="
echo ""
echo "Which method worked best for routing video to Screen 1?"
echo "We'll use that method in the ParadoxFX configuration."
