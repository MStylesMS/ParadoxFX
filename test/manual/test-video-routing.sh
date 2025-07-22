#!/bin/bash
# ParadoxFX Video Routing Test Script
# Tests MPV video routing to specific screens without SSH interference

set -e

echo "🎥 ParadoxFX Video Routing Test"
echo "=============================="
echo "This script tests video routing to specific HDMI outputs on Pi5"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Test video file
TEST_VIDEO="/opt/paradox/media/zone1/default.mp4"
if [ ! -f "$TEST_VIDEO" ]; then
    TEST_VIDEO="/opt/paradox/media/zone1/default.avi"
fi

if [ ! -f "$TEST_VIDEO" ]; then
    print_error "No test video found in /opt/paradox/media/zone1/"
    exit 1
fi

print_info "Using test video: $TEST_VIDEO"

# Function to test MPV with different parameters
test_mpv_command() {
    local screen_num=$1
    local audio_device=$2
    local description=$3
    local mpv_args=("${@:4}")
    
    echo ""
    print_info "Testing: $description"
    echo "Screen: $screen_num, Audio: $audio_device"
    echo "Command: mpv ${mpv_args[*]} $TEST_VIDEO"
    
    read -p "Press Enter to start test (video will play for 10 seconds)..."
    
    # Run MPV with timeout
    if timeout 10s mpv "${mpv_args[@]}" "$TEST_VIDEO" 2>&1; then
        print_success "MPV command completed successfully"
    else
        local exit_code=$?
        if [ $exit_code -eq 124 ]; then
            print_success "Test completed (10 second timeout)"
        else
            print_error "MPV failed with exit code $exit_code"
        fi
    fi
    
    echo "Did video appear on Screen $screen_num? (y/n/partial)"
    read -r video_result
    echo "Did audio play on HDMI $screen_num? (y/n/partial)"
    read -r audio_result
    
    echo "Results: Video=$video_result, Audio=$audio_result"
    return 0
}

# Environment check
echo ""
echo "🔍 Environment Check"
echo "===================="
print_info "DISPLAY: ${DISPLAY:-'Not set'}"
print_info "XDG_SESSION_TYPE: ${XDG_SESSION_TYPE:-'Not set'}"

if [ -n "$SSH_CLIENT" ]; then
    print_warning "SSH detected - results may be unreliable!"
fi

# Monitor detection
echo ""
echo "🖥️ Monitor Detection"
echo "==================="
xrandr --listmonitors

echo ""
echo "🔊 Audio Devices"
echo "==============="
aplay -l

# Test 1: Basic screen targeting (recommended approach from notes)
echo ""
echo "==============================================="
echo "TEST 1: MPV --screen parameter (Primary Method)"
echo "==============================================="

test_mpv_command 0 "hdmi:CARD=vc4hdmi0,DEV=0" "Screen 0 with --screen parameter" \
    --screen=0 --fullscreen --no-osc --no-input-default-bindings \
    --audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0 --really-quiet --no-terminal

test_mpv_command 1 "hdmi:CARD=vc4hdmi1,DEV=0" "Screen 1 with --screen parameter" \
    --screen=1 --fullscreen --no-osc --no-input-default-bindings \
    --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0 --really-quiet --no-terminal

# Test 2: Fullscreen screen targeting
echo ""
echo "================================================"
echo "TEST 2: MPV --fs-screen parameter (Secondary Method)"
echo "================================================"

test_mpv_command 0 "hw:0,0" "Screen 0 with --fs-screen parameter" \
    --fs-screen=0 --fullscreen --no-osc --no-input-default-bindings \
    --audio-device=alsa/hw:0,0 --really-quiet --no-terminal

test_mpv_command 1 "hw:1,0" "Screen 1 with --fs-screen parameter" \
    --fs-screen=1 --fullscreen --no-osc --no-input-default-bindings \
    --audio-device=alsa/hw:1,0 --really-quiet --no-terminal

# Test 3: Combined approach (recommended for ParradoxFX)
echo ""
echo "=============================================="
echo "TEST 3: Combined --screen + --fs-screen (ParadoxFX Style)"
echo "=============================================="

test_mpv_command 0 "hw:0,0" "Screen 0 with combined parameters" \
    --screen=0 --fs-screen=0 --fullscreen --no-osc --no-input-default-bindings \
    --audio-device=alsa/hw:0,0 --really-quiet --no-terminal

test_mpv_command 1 "hw:1,0" "Screen 1 with combined parameters" \
    --screen=1 --fs-screen=1 --fullscreen --no-osc --no-input-default-bindings \
    --audio-device=alsa/hw:1,0 --really-quiet --no-terminal

# Test 4: Geometry-based positioning
echo ""
echo "=============================================="
echo "TEST 4: Geometry-based positioning (Fallback Method)"
echo "=============================================="

test_mpv_command 0 "hw:0,0" "Screen 0 with geometry positioning" \
    --geometry=1920x1080+0+0 --fullscreen --no-osc --no-input-default-bindings \
    --audio-device=alsa/hw:0,0 --really-quiet --no-terminal

test_mpv_command 1 "hw:1,0" "Screen 1 with geometry positioning" \
    --geometry=1920x1080+1920+0 --fullscreen --no-osc --no-input-default-bindings \
    --audio-device=alsa/hw:1,0 --really-quiet --no-terminal

# Test 5: X11 DISPLAY environment (if applicable)
if [ "$XDG_SESSION_TYPE" = "x11" ] || [ -n "$DISPLAY" ]; then
    echo ""
    echo "=============================================="
    echo "TEST 5: X11 DISPLAY Environment Method"
    echo "=============================================="
    
    print_info "Testing with DISPLAY=:0.0"
    DISPLAY=:0.0 test_mpv_command 0 "hw:0,0" "Screen 0 with DISPLAY=:0.0" \
        --fullscreen --no-osc --no-input-default-bindings \
        --audio-device=alsa/hw:0,0 --really-quiet --no-terminal
    
    print_info "Testing with DISPLAY=:0.1"
    DISPLAY=:0.1 test_mpv_command 1 "hw:1,0" "Screen 1 with DISPLAY=:0.1" \
        --fullscreen --no-osc --no-input-default-bindings \
        --audio-device=alsa/hw:1,0 --really-quiet --no-terminal
fi

echo ""
echo "🎯 Test Summary"
echo "=============="
echo "All tests completed. Based on your results:"
echo ""
echo "1. If TEST 1 (--screen) worked: Use that as your primary method"
echo "2. If TEST 3 (combined) worked: Use that for maximum reliability"
echo "3. If only TEST 4 (geometry) worked: Use as fallback"
echo ""
echo "The working command structure should be used in your ParadoxFX configuration."
echo ""
print_info "Next step: Update your pfx.ini file with the working MPV parameters"
