#!/bin/bash
# ParadoxFX Local Display Routing Test Script
# This script tests dual-HDMI video routing directly on the Pi5 without SSH interference

set -e

echo "🍓 ParadoxFX Pi5 Local Display Routing Test"
echo "=========================================="
echo "This script eliminates SSH X11 forwarding issues and tests video routing directly."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Step 1: Detect and fix display environment
echo "1️⃣ Display Environment Analysis"
echo "==============================="

print_status "Current environment:"
echo "SSH_CLIENT: ${SSH_CLIENT:-'Not set (good!)'}"
echo "SSH_CONNECTION: ${SSH_CONNECTION:-'Not set (good!)'}"
echo "DISPLAY: ${DISPLAY:-'Not set'}"
echo "XDG_SESSION_TYPE: ${XDG_SESSION_TYPE:-'Not set'}"
echo "WAYLAND_DISPLAY: ${WAYLAND_DISPLAY:-'Not set'}"

# Check if we're in SSH
if [[ -n "$SSH_CLIENT" || -n "$SSH_CONNECTION" ]]; then
    print_warning "SSH connection detected! This may interfere with display routing."
    echo "For best results, run this script:"
    echo "1. From a local console session (Ctrl+Alt+F1-F6)"
    echo "2. From a VNC session to the Pi5"
    echo "3. From SSH with X11 forwarding disabled: ssh -o ForwardX11=no user@pi5"
    echo ""
    read -p "Continue anyway? (y/N): " continue_ssh
    if [[ "$continue_ssh" != "y" && "$continue_ssh" != "Y" ]]; then
        echo "Exiting. Please run from a local session for accurate results."
        exit 1
    fi
fi

# Step 2: Set up proper display environment
echo ""
echo "2️⃣ Setting Up Local Display Environment"
echo "======================================="

# Try to detect the correct display
if [[ -z "$DISPLAY" ]]; then
    print_status "No DISPLAY set. Attempting to detect local display..."
    
    # Check for common display patterns
    for display in ":0" ":1" "/run/user/$(id -u)/wayland-0"; do
        if [[ -e "/tmp/.X11-unix/X${display#:}" ]] || [[ -e "$display" ]]; then
            export DISPLAY="$display"
            print_success "Found display: $DISPLAY"
            break
        fi
    done
    
    if [[ -z "$DISPLAY" ]]; then
        print_warning "Could not auto-detect display. Setting DISPLAY=:0"
        export DISPLAY=":0"
    fi
fi

# Disable SSH X11 forwarding interference
unset SSH_ASKPASS
unset SSH_AUTH_SOCK 2>/dev/null || true

print_status "Using DISPLAY: $DISPLAY"

# Step 3: Check display system status
echo ""
echo "3️⃣ Display System Status Check"
echo "=============================="

print_status "Checking for running display servers..."

# Check for X11
if pgrep -x "Xorg" > /dev/null || pgrep -x "X" > /dev/null; then
    print_success "X11 server detected"
    DISPLAY_TYPE="X11"
elif pgrep -f "wayland" > /dev/null; then
    print_success "Wayland server detected"
    DISPLAY_TYPE="Wayland"
else
    print_warning "No display server detected. Checking for desktop session..."
    
    # Check for desktop environment
    if systemctl --user is-active --quiet graphical-session.target 2>/dev/null; then
        print_success "Graphical session active"
        DISPLAY_TYPE="Unknown"
    else
        print_error "No graphical session detected!"
        echo "You may need to:"
        echo "1. Start a desktop session: startx"
        echo "2. Enable auto-login to desktop"
        echo "3. Use VNC to connect to the Pi5 desktop"
        read -p "Continue anyway? (y/N): " continue_no_gui
        if [[ "$continue_no_gui" != "y" && "$continue_no_gui" != "Y" ]]; then
            exit 1
        fi
        DISPLAY_TYPE="Console"
    fi
fi

# Step 4: Test display connectivity
echo ""
echo "4️⃣ Display Connectivity Test"
echo "==========================="

print_status "Testing display connection..."

# Test if we can query the display
if command -v xrandr >/dev/null 2>&1; then
    if xrandr --listmonitors 2>/dev/null | grep -q "Monitors:"; then
        print_success "Display query successful"
        echo ""
        echo "Connected monitors:"
        xrandr --listmonitors | grep -E "(Monitors:|^ [0-9]+:)"
        
        # Count monitors
        MONITOR_COUNT=$(xrandr --listmonitors | grep "^ [0-9]:" | wc -l)
        print_status "Found $MONITOR_COUNT monitor(s)"
        
        if [[ $MONITOR_COUNT -ge 2 ]]; then
            print_success "Dual monitor setup detected!"
            DUAL_MONITOR=true
        else
            print_warning "Only one monitor detected. Dual monitor tests may fail."
            DUAL_MONITOR=false
        fi
    else
        print_error "Cannot query display with xrandr"
        DUAL_MONITOR=false
    fi
else
    print_warning "xrandr not available, cannot detect monitors"
    DUAL_MONITOR=false
fi

# Step 5: Test video file availability
echo ""
echo "5️⃣ Test Media Preparation"
echo "========================"

TEST_VIDEO=""
VIDEO_PATHS=(
    "/opt/paradox/apps/pfx/test/fixtures/test-media/default.mp4"
    "/opt/paradox/apps/pfx/test/fixtures/test-media/default.avi"
    "/opt/paradox/apps/pfx/test/fixtures/test-media/default.mkv"
    "/usr/share/pixmaps/test.mp4"
    "/home/pi/test.mp4"
)

print_status "Looking for test video files..."
for video_path in "${VIDEO_PATHS[@]}"; do
    if [[ -f "$video_path" ]]; then
        TEST_VIDEO="$video_path"
        print_success "Found test video: $TEST_VIDEO"
        break
    fi
done

if [[ -z "$TEST_VIDEO" ]]; then
    print_warning "No test video found. Creating a test pattern..."
    
    # Generate a test video with ffmpeg if available
    if command -v ffmpeg >/dev/null 2>&1; then
        TEST_VIDEO="/tmp/paradoxfx-test-pattern.mp4"
        print_status "Generating test pattern video..."
        
        # Create a 10-second test pattern with audio
        ffmpeg -f lavfi -i testsrc2=duration=10:size=1920x1080:rate=30 \
               -f lavfi -i sine=frequency=1000:duration=10 \
               -c:v libx264 -preset fast -c:a aac \
               -y "$TEST_VIDEO" 2>/dev/null
        
        if [[ -f "$TEST_VIDEO" ]]; then
            print_success "Generated test video: $TEST_VIDEO"
        else
            print_error "Failed to generate test video"
            TEST_VIDEO=""
        fi
    else
        print_error "No test video available and ffmpeg not found"
        echo "Please place a test video file in one of these locations:"
        for path in "${VIDEO_PATHS[@]}"; do
            echo "  $path"
        done
        read -p "Continue without video tests? (y/N): " continue_no_video
        if [[ "$continue_no_video" != "y" && "$continue_no_video" != "Y" ]]; then
            exit 1
        fi
    fi
fi

# Step 6: Test MPV direct screen targeting
if [[ -n "$TEST_VIDEO" ]]; then
    echo ""
    echo "6️⃣ MPV Direct Screen Targeting Test"
    echo "=================================="
    
    print_status "Testing MPV screen targeting capabilities..."
    
    # Test 1: Default screen (should be screen 0)
    echo ""
    print_status "Test 1: Default screen targeting"
    echo "Command: mpv --really-quiet --length=3 \"$TEST_VIDEO\""
    
    read -p "Press Enter to start test 1 (3 seconds)..."
    timeout 5 mpv --really-quiet --length=3 "$TEST_VIDEO" 2>/dev/null || true
    
    echo ""
    read -p "Did you see video on Screen 0 (left/primary monitor)? (y/n): " screen0_result
    
    if [[ "$DUAL_MONITOR" == true ]]; then
        echo ""
        print_status "Test 2: Screen 1 targeting (--screen=1)"
        echo "Command: mpv --screen=1 --really-quiet --length=3 \"$TEST_VIDEO\""
        
        read -p "Press Enter to start test 2 (3 seconds)..."
        timeout 5 mpv --screen=1 --really-quiet --length=3 "$TEST_VIDEO" 2>/dev/null || true
        
        echo ""
        read -p "Did you see video on Screen 1 (right/secondary monitor)? (y/n): " screen1_result
        
        echo ""
        print_status "Test 3: Geometry-based targeting"
        echo "Command: mpv --geometry=1920x1080+1920+0 --really-quiet --length=3 \"$TEST_VIDEO\""
        
        read -p "Press Enter to start test 3 (3 seconds)..."
        timeout 5 mpv --geometry=1920x1080+1920+0 --really-quiet --length=3 "$TEST_VIDEO" 2>/dev/null || true
        
        echo ""
        read -p "Did you see video on Screen 1 (positioned at right monitor)? (y/n): " geometry_result
    fi
fi

# Step 7: Test audio routing
echo ""
echo "7️⃣ Audio Routing Test"
echo "===================="

print_status "Testing audio device availability..."

# Get available audio devices
if [[ -f /proc/asound/cards ]]; then
    echo ""
    echo "Available audio cards:"
    cat /proc/asound/cards
    
    # Test audio routing to both HDMI outputs if available
    HDMI0_DEVICE=""
    HDMI1_DEVICE=""
    
    while IFS= read -r line; do
        if echo "$line" | grep -q "HDMI 0"; then
            card_num=$(echo "$line" | awk '{print $1}')
            HDMI0_DEVICE="plughw:$card_num"
        elif echo "$line" | grep -q "HDMI 1"; then
            card_num=$(echo "$line" | awk '{print $1}')
            HDMI1_DEVICE="plughw:$card_num"
        fi
    done < /proc/asound/cards
    
    if [[ -n "$HDMI0_DEVICE" ]]; then
        echo ""
        print_status "Testing HDMI 0 audio: $HDMI0_DEVICE"
        if command -v speaker-test >/dev/null 2>&1; then
            read -p "Press Enter to test HDMI 0 audio (2 seconds)..."
            timeout 3 speaker-test -D "$HDMI0_DEVICE" -t sine -f 1000 -l 1 2>/dev/null || true
            read -p "Did you hear audio from HDMI 0 output? (y/n): " hdmi0_audio
        fi
    fi
    
    if [[ -n "$HDMI1_DEVICE" ]]; then
        echo ""
        print_status "Testing HDMI 1 audio: $HDMI1_DEVICE"
        if command -v speaker-test >/dev/null 2>&1; then
            read -p "Press Enter to test HDMI 1 audio (2 seconds)..."
            timeout 3 speaker-test -D "$HDMI1_DEVICE" -t sine -f 1000 -l 1 2>/dev/null || true
            read -p "Did you hear audio from HDMI 1 output? (y/n): " hdmi1_audio
        fi
    fi
fi

# Step 8: Test ParadoxFX if available
echo ""
echo "8️⃣ ParadoxFX Integration Test"
echo "============================"

if [[ -f "/opt/paradox/apps/pfx/pfx.js" ]]; then
    print_status "ParadoxFX found. Testing basic startup..."
    
    # Check if MQTT broker is running
    if systemctl is-active --quiet mosquitto 2>/dev/null; then
        print_success "MQTT broker (mosquitto) is running"
        
        # Test if ParadoxFX can start without errors
        echo ""
        print_status "Testing ParadoxFX startup (5 seconds)..."
        read -p "Press Enter to test ParadoxFX startup..."
        
        cd /opt/paradox/apps/pfx
        timeout 10 node pfx.js 2>&1 | head -20 || true
        
        echo ""
        read -p "Did ParadoxFX start without critical errors? (y/n): " pfx_startup
    else
        print_warning "MQTT broker not running. Start with: sudo systemctl start mosquitto"
    fi
else
    print_warning "ParadoxFX not found at expected location"
fi

# Step 9: Results summary
echo ""
echo "🎯 Test Results Summary"
echo "======================="

echo ""
echo "Environment:"
echo "  SSH Connection: ${SSH_CLIENT:+YES (may cause issues)}${SSH_CLIENT:-NO (good)}"
echo "  Display Type: $DISPLAY_TYPE"
echo "  Display Variable: $DISPLAY"
echo "  Dual Monitors: ${DUAL_MONITOR:-unknown}"

if [[ -n "$TEST_VIDEO" ]]; then
    echo ""
    echo "Video Tests:"
    echo "  Screen 0 (default): ${screen0_result:-not tested}"
    if [[ "$DUAL_MONITOR" == true ]]; then
        echo "  Screen 1 (--screen=1): ${screen1_result:-not tested}"
        echo "  Screen 1 (geometry): ${geometry_result:-not tested}"
    fi
fi

echo ""
echo "Audio Tests:"
echo "  HDMI 0: ${hdmi0_audio:-not tested}"
echo "  HDMI 1: ${hdmi1_audio:-not tested}"

echo ""
echo "ParadoxFX:"
echo "  Startup Test: ${pfx_startup:-not tested}"

# Step 10: Recommendations
echo ""
echo "💡 Recommendations"
echo "=================="

if [[ -n "$SSH_CLIENT" || -n "$SSH_CONNECTION" ]]; then
    print_warning "SSH connection detected:"
    echo "  • For accurate testing, use local console or VNC"
    echo "  • If using SSH, disable X11 forwarding: ssh -o ForwardX11=no user@pi5"
fi

if [[ "$screen1_result" == "n" && "$geometry_result" == "n" ]]; then
    print_warning "Screen 1 video routing failed:"
    echo "  • This confirms the Wayland/Pi5 dual-screen limitation"
    echo "  • Consider switching to X11: sudo raspi-config -> Advanced -> Wayland -> X11"
    echo "  • Or configure framebuffer direct access"
fi

if [[ "$hdmi0_audio" == "y" && "$hdmi1_audio" == "y" ]]; then
    print_success "Audio routing works perfectly on both HDMI outputs!"
fi

echo ""
echo "✅ Local display routing test complete!"
echo ""
echo "Next steps:"
echo "1. If SSH was used, rerun this test from local console for accurate results"
echo "2. If video routing to Screen 1 failed, consider display system changes"
echo "3. Test ParadoxFX MQTT commands with proper display environment"

# Clean up test video if we created it
if [[ "$TEST_VIDEO" == "/tmp/paradoxfx-test-pattern.mp4" ]]; then
    rm -f "$TEST_VIDEO" 2>/dev/null || true
fi
