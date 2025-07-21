#!/bin/bash
# Quick Display Environment Checker
# Run this to understand your current testing environment

echo "🔍 ParadoxFX Display Environment Analysis"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Environment variables
echo "📊 Environment Variables:"
echo "  SSH_CLIENT: ${SSH_CLIENT:-'❌ Not set (good for testing)'}"
echo "  SSH_CONNECTION: ${SSH_CONNECTION:-'❌ Not set (good for testing)'}"
echo "  DISPLAY: ${DISPLAY:-'❌ Not set'}"
echo "  XDG_SESSION_TYPE: ${XDG_SESSION_TYPE:-'❌ Not set'}"
echo "  WAYLAND_DISPLAY: ${WAYLAND_DISPLAY:-'❌ Not set'}"
echo ""

# SSH detection
if [[ -n "$SSH_CLIENT" || -n "$SSH_CONNECTION" ]]; then
    echo -e "${RED}🚨 SSH CONNECTION DETECTED${NC}"
    echo "This explains the video routing issue!"
    echo ""
    echo "SSH X11 forwarding routes all video through a tunnel to your laptop."
    echo "Your laptop can only show video on its primary display, making dual-screen"
    echo "testing impossible."
    echo ""
    echo -e "${YELLOW}SOLUTION:${NC} Use one of these methods instead:"
    echo "  1. SSH without X11: ssh -o ForwardX11=no user@pi5"
    echo "  2. Local console: Direct keyboard/monitor access"
    echo "  3. VNC: Remote desktop to Pi5"
    echo ""
else
    echo -e "${GREEN}✅ NO SSH DETECTED${NC}"
    echo "Good! This environment should work for accurate testing."
    echo ""
fi

# Display system check
echo "🖥️ Display System:"
if pgrep -x "Xorg" > /dev/null || pgrep -x "X" > /dev/null; then
    echo -e "  ${GREEN}✅ X11 server running${NC}"
    DISPLAY_TYPE="X11"
elif pgrep -f "wayland" > /dev/null; then
    echo -e "  ${GREEN}✅ Wayland server running${NC}"
    DISPLAY_TYPE="Wayland"
    echo -e "  ${YELLOW}⚠️  Note: Wayland on Pi5 may have dual-screen limitations${NC}"
else
    echo -e "  ${RED}❌ No display server detected${NC}"
    DISPLAY_TYPE="None"
fi
echo ""

# Monitor detection
echo "📺 Monitor Detection:"
if command -v xrandr >/dev/null 2>&1; then
    if xrandr --listmonitors 2>/dev/null | grep -q "Monitors:"; then
        monitor_count=$(xrandr --listmonitors | grep "^ [0-9]:" | wc -l)
        echo -e "  ${GREEN}✅ xrandr working${NC}"
        echo "  Monitors detected: $monitor_count"
        
        if [[ $monitor_count -ge 2 ]]; then
            echo -e "  ${GREEN}✅ Dual monitor setup confirmed${NC}"
            echo ""
            echo "  Monitor details:"
            xrandr --listmonitors | grep -E "(Monitors:|^ [0-9]+:)" | sed 's/^/    /'
        else
            echo -e "  ${YELLOW}⚠️  Only one monitor detected${NC}"
        fi
    else
        echo -e "  ${RED}❌ xrandr cannot query display${NC}"
    fi
else
    echo -e "  ${RED}❌ xrandr not available${NC}"
fi
echo ""

# Process check
echo "🔄 Relevant Processes:"
echo "  Display-related processes:"
ps aux | grep -E "(X|wayland|gdm|lightdm)" | grep -v grep | head -3 | sed 's/^/    /' || echo "    None found"
echo ""

# Audio check
echo "🔊 Audio System:"
if [[ -f /proc/asound/cards ]]; then
    hdmi_count=$(grep -c "HDMI" /proc/asound/cards 2>/dev/null || echo "0")
    echo "  HDMI audio devices: $hdmi_count"
    
    if [[ "$hdmi_count" -ge 2 ]]; then
        echo -e "  ${GREEN}✅ Dual HDMI audio available${NC}"
    else
        echo -e "  ${YELLOW}⚠️  Limited HDMI audio devices${NC}"
    fi
else
    echo -e "  ${RED}❌ No audio system detected${NC}"
fi
echo ""

# Overall assessment
echo "🎯 Testing Readiness Assessment:"
echo "================================"

READY=true

if [[ -n "$SSH_CLIENT" || -n "$SSH_CONNECTION" ]]; then
    echo -e "${RED}❌ SSH interference detected${NC}"
    echo "  This is the PRIMARY cause of video routing issues."
    READY=false
fi

if [[ "$DISPLAY_TYPE" == "None" ]]; then
    echo -e "${RED}❌ No display system${NC}"
    READY=false
elif [[ "$DISPLAY_TYPE" == "Wayland" ]]; then
    echo -e "${YELLOW}⚠️  Wayland may have Pi5 dual-screen limitations${NC}"
fi

if [[ $monitor_count -lt 2 ]]; then
    echo -e "${YELLOW}⚠️  Dual monitor setup not confirmed${NC}"
fi

echo ""
if [[ "$READY" == true ]]; then
    echo -e "${GREEN}🎉 ENVIRONMENT LOOKS GOOD FOR TESTING!${NC}"
    echo ""
    echo "Recommended next steps:"
    echo "  1. Run: ./test/manual/test-local-display-routing.sh"
    echo "  2. Test ParadoxFX MQTT commands"
    echo "  3. Verify dual-screen video routing"
else
    echo -e "${RED}🚫 ENVIRONMENT NEEDS FIXES${NC}"
    echo ""
    echo "Recommended fixes:"
    echo "  1. Run: ./test/manual/ssh-free-testing-guide.sh"
    echo "  2. Choose a non-SSH testing method"
    echo "  3. Re-run this checker to verify"
fi

echo ""
echo "For detailed solutions, run:"
echo "  ./test/manual/ssh-free-testing-guide.sh"
