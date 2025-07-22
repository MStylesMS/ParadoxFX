#!/bin/bash
# Simple Video Routing Verification Script
# This script helps you visually confirm which screen videos appear on

echo "🎥 Visual Video Routing Test"
echo "============================"
echo ""
echo "This script will test each screen individually."
echo "Watch your monitors to see which screen shows the video."
echo ""

TEST_VIDEO="/opt/paradox/media/zone1/default.mp4"
if [ ! -f "$TEST_VIDEO" ]; then
    TEST_VIDEO="/opt/paradox/media/zone1/default.avi"
fi

echo "Using test video: $TEST_VIDEO"
echo ""

# Test Screen 0
echo "🖥️  TESTING SCREEN 0 (HDMI 0)"
echo "================================"
echo "Video should appear on your FIRST monitor (HDMI 0)"
echo "Audio should play through FIRST monitor's speakers/HDMI audio"
echo ""
read -p "Press Enter to start 5-second test on Screen 0..."

timeout 5s mpv --screen=0 --fullscreen --no-osc \
    --audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0 \
    --really-quiet --no-terminal "$TEST_VIDEO"

echo ""
echo "Did you see video on the FIRST monitor? (y/n)"
read -r screen0_video
echo "Did you hear audio from the FIRST monitor? (y/n)"
read -r screen0_audio

echo ""
echo "🖥️  TESTING SCREEN 1 (HDMI 1)"
echo "================================"
echo "Video should appear on your SECOND monitor (HDMI 1)"
echo "Audio should play through SECOND monitor's speakers/HDMI audio"
echo ""
read -p "Press Enter to start 5-second test on Screen 1..."

timeout 5s mpv --screen=1 --fullscreen --no-osc \
    --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \
    --really-quiet --no-terminal "$TEST_VIDEO"

echo ""
echo "Did you see video on the SECOND monitor? (y/n)"
read -r screen1_video
echo "Did you hear audio from the SECOND monitor? (y/n)"
read -r screen1_audio

echo ""
echo "🎯 TEST RESULTS SUMMARY"
echo "======================="
echo "Screen 0 (HDMI 0): Video=$screen0_video, Audio=$screen0_audio"
echo "Screen 1 (HDMI 1): Video=$screen1_video, Audio=$screen1_audio"
echo ""

if [ "$screen0_video" = "y" ] && [ "$screen0_audio" = "y" ] && \
   [ "$screen1_video" = "y" ] && [ "$screen1_audio" = "y" ]; then
    echo "✅ SUCCESS: Both screens working correctly!"
    echo ""
    echo "Working MPV commands:"
    echo "Screen 0: mpv --screen=0 --audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0"
    echo "Screen 1: mpv --screen=1 --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0"
elif [ "$screen1_video" = "n" ] && [ "$screen1_audio" = "y" ]; then
    echo "⚠️  KNOWN ISSUE DETECTED: Audio works on Screen 1, but video goes to Screen 0"
    echo "This matches your original problem description."
    echo ""
    echo "Let's try alternative methods..."
    
    echo ""
    echo "🔄 TESTING ALTERNATIVE: Combined --screen and --fs-screen"
    echo "========================================================"
    read -p "Press Enter to test alternative method..."
    
    timeout 5s mpv --screen=1 --fs-screen=1 --fullscreen --no-osc \
        --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \
        --really-quiet --no-terminal "$TEST_VIDEO"
    
    echo "Did this show video on Screen 1? (y/n)"
    read -r alt_result
    
    if [ "$alt_result" = "y" ]; then
        echo "✅ Alternative method works! Use: --screen=1 --fs-screen=1"
    else
        echo "❌ Alternative failed. Trying geometry method..."
        
        echo ""
        echo "🔄 TESTING GEOMETRY METHOD"
        echo "========================="
        read -p "Press Enter to test geometry positioning..."
        
        timeout 5s mpv --geometry=1920x1080+1920+0 --fullscreen --no-osc \
            --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \
            --really-quiet --no-terminal "$TEST_VIDEO"
        
        echo "Did this show video on Screen 1? (y/n)"
        read -r geo_result
        
        if [ "$geo_result" = "y" ]; then
            echo "✅ Geometry method works! Use: --geometry=1920x1080+1920+0"
        else
            echo "❌ All methods failed. This may be a Wayland/driver limitation."
        fi
    fi
else
    echo "❓ Mixed results. Review the output above."
fi

echo ""
echo "📝 Next steps:"
echo "1. Update your ParadoxFX configuration with working commands"
echo "2. Test with the full ParadoxFX application"
echo "3. Document working configurations"
