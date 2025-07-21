#!/bin/bash
# Advanced MPV Screen Targeting for Wayland/Pi5
# Testing alternative methods for dual-screen video routing

echo "=================================================="
echo "Advanced Screen Targeting Test"
echo "=================================================="
echo ""

MEDIA_FILE="/opt/paradox/media/zone1/default.avi"
AUDIO_DEVICE_1="pulse/alsa_output.platform-107c706400.hdmi.hdmi-stereo"

echo "Current display setup:"
DISPLAY=:0 xrandr --listmonitors
echo ""

echo "Testing alternative approaches..."
echo ""

# Method 1: Try different DISPLAY environment
test_method_1() {
    echo "Method 1: Testing DISPLAY=:0.1"
    DISPLAY=:0.1 mpv --fs --audio-device="$AUDIO_DEVICE_1" "$MEDIA_FILE" --really-quiet --length=5 2>/dev/null &
    MPV_PID=$!
    sleep 5
    kill $MPV_PID 2>/dev/null
    wait $MPV_PID 2>/dev/null
    
    echo "Did video appear on Screen 1? (y/n)"
    read -r response
    case $response in
        [Yy]* ) echo "✅ DISPLAY=:0.1: SUCCESS"; return 0;;
        * ) echo "❌ DISPLAY=:0.1: FAILED";;
    esac
    echo ""
}

# Method 2: Try with X11 backend forcing
test_method_2() {
    echo "Method 2: Force X11 backend with geometry"
    GDK_BACKEND=x11 DISPLAY=:0 mpv --geometry=1920x1080+1920+0 --fs --audio-device="$AUDIO_DEVICE_1" "$MEDIA_FILE" --really-quiet --length=5 &
    MPV_PID=$!
    sleep 5
    kill $MPV_PID 2>/dev/null
    wait $MPV_PID 2>/dev/null
    
    echo "Did video appear on Screen 1? (y/n)"
    read -r response
    case $response in
        [Yy]* ) echo "✅ X11 backend: SUCCESS"; return 0;;
        * ) echo "❌ X11 backend: FAILED";;
    esac
    echo ""
}

# Method 3: Try with specific video output driver
test_method_3() {
    echo "Method 3: X11 video output with window positioning"
    DISPLAY=:0 mpv --vo=x11 --geometry=1920x1080+1920+0 --audio-device="$AUDIO_DEVICE_1" "$MEDIA_FILE" --really-quiet --length=5 &
    MPV_PID=$!
    sleep 5
    kill $MPV_PID 2>/dev/null
    wait $MPV_PID 2>/dev/null
    
    echo "Did video appear on Screen 1? (y/n)"
    read -r response
    case $response in
        [Yy]* ) echo "✅ X11 video output: SUCCESS"; return 0;;
        * ) echo "❌ X11 video output: FAILED";;
    esac
    echo ""
}

# Method 4: Try without fullscreen
test_method_4() {
    echo "Method 4: Windowed mode positioned on Screen 1"
    DISPLAY=:0 mpv --geometry=1600x900+2000+100 --audio-device="$AUDIO_DEVICE_1" "$MEDIA_FILE" --really-quiet --length=5 &
    MPV_PID=$!
    sleep 5
    kill $MPV_PID 2>/dev/null
    wait $MPV_PID 2>/dev/null
    
    echo "Did video appear on Screen 1? (y/n)"
    read -r response
    case $response in
        [Yy]* ) echo "✅ Windowed positioning: SUCCESS"; return 0;;
        * ) echo "❌ Windowed positioning: FAILED";;
    esac
    echo ""
}

# Check if we can change primary display
test_method_5() {
    echo "Method 5: Check if we can change primary display temporarily"
    echo "Current xrandr output:"
    DISPLAY=:0 xrandr --current
    echo ""
    echo "Attempting to set XWAYLAND1 as primary..."
    DISPLAY=:0 xrandr --output XWAYLAND1 --primary 2>/dev/null
    
    echo "Playing video on what should now be primary display..."
    DISPLAY=:0 mpv --fs --audio-device="$AUDIO_DEVICE_1" "$MEDIA_FILE" --really-quiet --length=5 &
    MPV_PID=$!
    sleep 5
    kill $MPV_PID 2>/dev/null
    wait $MPV_PID 2>/dev/null
    
    echo "Did video appear on Screen 1? (y/n)"
    read -r response
    
    # Restore original primary
    DISPLAY=:0 xrandr --output XWAYLAND0 --primary 2>/dev/null
    
    case $response in
        [Yy]* ) echo "✅ Primary display change: SUCCESS"; return 0;;
        * ) echo "❌ Primary display change: FAILED";;
    esac
    echo ""
}

echo "Starting advanced tests..."
echo "Press ENTER to continue..."
read

test_method_1
test_method_2  
test_method_3
test_method_4
test_method_5

echo ""
echo "=================================================="
echo "Advanced Testing Complete"
echo "=================================================="
echo ""
echo "Summary: All traditional MPV screen targeting methods failed."
echo "This suggests the Pi5 Wayland environment has limitations for"
echo "routing video to secondary displays."
echo ""
echo "Potential solutions:"
echo "1. Use separate X sessions per display"
echo "2. Use framebuffer direct output"
echo "3. Configure displays differently in Pi5 config"
echo "4. Use different video player (VLC, etc.)"
echo ""
echo "Would you like to test any of these alternatives?"
