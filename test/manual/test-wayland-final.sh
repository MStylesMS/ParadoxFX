#!/bin/bash
# Final Wayland Video Routing Attempts
# Tests advanced methods before switching to X11

echo "🔬 Advanced Wayland Video Routing Test"
echo "======================================"
echo "Testing remaining Wayland-compatible methods before switching to X11"
echo ""

TEST_VIDEO="/opt/paradox/media/zone1/default.mp4"
[ ! -f "$TEST_VIDEO" ] && TEST_VIDEO="/opt/paradox/media/zone1/default.avi"

# Method 1: Force specific Wayland output
echo "🧪 TEST: Wayland Output Specification"
echo "======================================"
echo "Attempting to use wlr-randr to get output names..."

if command -v wlr-randr >/dev/null 2>&1; then
    echo "Available Wayland outputs:"
    wlr-randr
    echo ""
    echo "This might give us specific output names to target."
else
    echo "wlr-randr not available, trying alternative..."
fi

# Method 2: X11 DISPLAY targeting (even under Wayland with Xwayland)
echo ""
echo "🧪 TEST: X11 DISPLAY targeting under Xwayland"
echo "=============================================="
echo "Testing specific DISPLAY values that might work with Xwayland"

echo ""
echo "Testing DISPLAY=:0.0 (Screen 0)"
read -p "Press Enter to test..."
timeout 5s env DISPLAY=:0.0 mpv --fullscreen --no-osc \
    --audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0 \
    --really-quiet --no-terminal "$TEST_VIDEO"

echo "Did this show on Screen 0? (y/n)"
read -r result_00

echo ""
echo "Testing DISPLAY=:0.1 (Screen 1)"
read -p "Press Enter to test..."
timeout 5s env DISPLAY=:0.1 mpv --fullscreen --no-osc \
    --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \
    --really-quiet --no-terminal "$TEST_VIDEO" 2>/dev/null

echo "Did this show on Screen 1? (y/n)"
read -r result_01

# Method 3: Direct framebuffer (if available)
echo ""
echo "🧪 TEST: Direct Framebuffer Output"
echo "================================="
echo "Checking for framebuffer devices..."

if ls /dev/fb* >/dev/null 2>&1; then
    echo "Found framebuffer devices:"
    ls -l /dev/fb*
    echo ""
    echo "We could try direct framebuffer output, but this is complex."
    echo "This would require a different video player or MPV with specific config."
else
    echo "No framebuffer devices found."
fi

# Method 4: MPV with specific video output driver
echo ""
echo "🧪 TEST: MPV Video Output Drivers"
echo "================================"
echo "Testing different video output drivers..."

echo ""
echo "Available video outputs in MPV:"
mpv --vo=help | head -10

echo ""
echo "Testing with Wayland video output driver"
read -p "Press Enter to test..."
timeout 5s mpv --vo=wayland --fullscreen --no-osc \
    --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \
    --really-quiet --no-terminal "$TEST_VIDEO" 2>/dev/null || echo "Wayland VO failed"

echo "Did Wayland video output work differently? (y/n)"
read -r wayland_vo

echo ""
echo "Testing with X11 video output driver"
read -p "Press Enter to test..."
timeout 5s mpv --vo=x11 --fullscreen --no-osc \
    --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 \
    --really-quiet --no-terminal "$TEST_VIDEO" 2>/dev/null || echo "X11 VO failed"

echo "Did X11 video output work differently? (y/n)"
read -r x11_vo

# Method 5: Window manager control
echo ""
echo "🧪 TEST: Window Manager Commands"
echo "==============================="
echo "Trying window manager specific commands..."

if command -v wmctrl >/dev/null 2>&1; then
    echo "wmctrl available - could try window manipulation"
    wmctrl -l
elif command -v swaymsg >/dev/null 2>&1; then
    echo "Sway compositor detected"
    swaymsg -t get_outputs
else
    echo "No compatible window manager tools found"
fi

echo ""
echo "📊 RESULTS SUMMARY"
echo "=================="
echo "DISPLAY=:0.0: $result_00"
echo "DISPLAY=:0.1: $result_01" 
echo "Wayland VO: $wayland_vo"
echo "X11 VO: $x11_vo"
echo ""

if [ "$result_01" = "y" ] || [ "$wayland_vo" = "y" ] || [ "$x11_vo" = "y" ]; then
    echo "✅ Found a working method!"
else
    echo "❌ No Wayland methods successful."
    echo ""
    echo "🔄 RECOMMENDATION: Switch to X11"
    echo "================================"
    echo "Based on your research notes and these results, we should:"
    echo "1. Switch the Pi5 from Wayland to X11"
    echo "2. Test the same MPV commands under X11"
    echo "3. X11 has better multi-monitor support for applications like MPV"
    echo ""
    echo "To switch to X11:"
    echo "sudo raspi-config"
    echo "Advanced Options -> Wayland -> X11"
    echo "Reboot and test again"
fi

echo ""
echo "Continue with X11 switch? (y/n)"
read -r switch_x11

if [ "$switch_x11" = "y" ]; then
    echo ""
    echo "🔧 Switching to X11..."
    echo "Run: sudo raspi-config"
    echo "Navigate to: Advanced Options -> Wayland -> Select X11"
    echo "Reboot when complete"
    echo ""
    echo "After reboot, run: ./test/manual/test-visual-routing.sh"
fi
