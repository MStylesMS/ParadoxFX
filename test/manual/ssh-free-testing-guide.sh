#!/bin/bash
# ParadoxFX SSH-Free Testing Guide
# This script helps you set up proper testing environment without SSH interference

echo "🚀 ParadoxFX SSH-Free Testing Setup Guide"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
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

echo "This guide provides three methods to test ParadoxFX without SSH display interference:"
echo ""

# Method 1: SSH without X11 forwarding
echo "📖 Method 1: SSH without X11 Forwarding"
echo "======================================="
echo ""
echo "From your laptop, connect with X11 forwarding disabled:"
echo ""
echo "  ssh -o ForwardX11=no -o ForwardX11Trusted=no user@your-pi5-ip"
echo ""
echo "Or add this to your ~/.ssh/config:"
echo ""
cat << 'EOF'
Host pi5-local
    HostName your-pi5-ip
    User your-username
    ForwardX11 no
    ForwardX11Trusted no
EOF
echo ""
echo "Then connect with: ssh pi5-local"
echo ""
read -p "Press Enter to continue to Method 2..."

# Method 2: Local console access
echo ""
echo "📖 Method 2: Local Console Access"
echo "================================"
echo ""
echo "If you have physical access to the Pi5:"
echo ""
echo "1. Connect keyboard and monitor directly to Pi5"
echo "2. Press Ctrl+Alt+F1 to switch to console (if in desktop)"
echo "3. Login directly"
echo "4. Run the test scripts from local console"
echo ""
echo "Advantages:"
echo "  ✅ No SSH interference"
echo "  ✅ Direct hardware access"
echo "  ✅ True dual-monitor testing"
echo ""
read -p "Press Enter to continue to Method 3..."

# Method 3: VNC setup
echo ""
echo "📖 Method 3: VNC Remote Desktop"
echo "==============================="
echo ""
echo "Set up VNC for graphical remote access:"
echo ""

# Check if VNC is available
if command -v vncserver >/dev/null 2>&1; then
    print_success "VNC server is available"
else
    print_info "Installing VNC server..."
    echo "Run these commands on your Pi5:"
    echo ""
    echo "  sudo apt update"
    echo "  sudo apt install -y realvnc-vnc-server realvnc-vnc-viewer"
    echo "  sudo systemctl enable vncserver-x11-serviced"
    echo "  sudo systemctl start vncserver-x11-serviced"
    echo ""
fi

echo "VNC Setup Steps:"
echo ""
echo "1. Enable VNC on Pi5:"
echo "   sudo raspi-config"
echo "   → Interface Options → VNC → Enable"
echo ""
echo "2. Set VNC password:"
echo "   vncpasswd"
echo ""
echo "3. From your laptop, use VNC viewer:"
echo "   - Download RealVNC Viewer"
echo "   - Connect to: your-pi5-ip:5900"
echo "   - This gives you full desktop access"
echo ""
echo "Advantages:"
echo "  ✅ Full desktop environment"
echo "  ✅ No SSH display issues"
echo "  ✅ Can see both monitors if configured"
echo ""
read -p "Press Enter to continue to testing steps..."

# Testing recommendations
echo ""
echo "🧪 Recommended Testing Sequence"
echo "==============================="
echo ""
echo "Once you have non-SSH access, run these tests in order:"
echo ""

echo "1. Run the local display routing test:"
echo "   cd /opt/paradox/apps/pfx"
echo "   ./test/manual/test-local-display-routing.sh"
echo ""

echo "2. Test ParadoxFX startup:"
echo "   cd /opt/paradox/apps/pfx"
echo "   node pfx.js"
echo ""

echo "3. Test MQTT video commands:"
echo "   mosquitto_pub -h localhost -t 'paradox/screen/0/video/play' -m '{\"file\":\"/path/to/test.mp4\"}'"
echo "   mosquitto_pub -h localhost -t 'paradox/screen/1/video/play' -m '{\"file\":\"/path/to/test.mp4\"}'"
echo ""

echo "4. Monitor both screens for video output"
echo ""

# Create quick SSH config helper
echo ""
echo "🔧 Quick SSH Config Helper"
echo "=========================="
echo ""

read -p "Would you like to create an SSH config for X11-free connection? (y/n): " create_config

if [[ "$create_config" == "y" || "$create_config" == "Y" ]]; then
    echo ""
    read -p "Enter your Pi5 IP address: " pi5_ip
    read -p "Enter your Pi5 username: " pi5_user
    
    config_entry="
Host pi5-nox11
    HostName $pi5_ip
    User $pi5_user
    ForwardX11 no
    ForwardX11Trusted no
    # Disable SSH X11 forwarding for accurate display testing"
    
    echo ""
    echo "Add this to your ~/.ssh/config file:"
    echo "$config_entry"
    echo ""
    echo "Then connect with: ssh pi5-nox11"
    
    # Optionally write to file
    read -p "Would you like me to append this to ~/.ssh/config? (y/n): " write_config
    if [[ "$write_config" == "y" || "$write_config" == "Y" ]]; then
        echo "$config_entry" >> ~/.ssh/config
        print_success "SSH config updated!"
    fi
fi

# Display environment check script
echo ""
echo "🔍 Display Environment Checker"
echo "============================="
echo ""

cat << 'EOF' > /tmp/check-display-env.sh
#!/bin/bash
echo "=== Display Environment Check ==="
echo "SSH_CLIENT: ${SSH_CLIENT:-'Not set'}"
echo "SSH_CONNECTION: ${SSH_CONNECTION:-'Not set'}"
echo "DISPLAY: ${DISPLAY:-'Not set'}"
echo "XDG_SESSION_TYPE: ${XDG_SESSION_TYPE:-'Not set'}"
echo "WAYLAND_DISPLAY: ${WAYLAND_DISPLAY:-'Not set'}"
echo ""
echo "Display processes:"
ps aux | grep -E "(X|wayland|gdm)" | grep -v grep | head -5
echo ""
echo "Available monitors:"
xrandr --listmonitors 2>/dev/null || echo "xrandr not available or no X11"
echo ""
if [[ -n "$SSH_CLIENT" ]]; then
    echo "⚠️  WARNING: SSH connection detected!"
    echo "This may interfere with video display routing."
else
    echo "✅ No SSH connection - good for testing!"
fi
EOF

chmod +x /tmp/check-display-env.sh

echo "Created display environment checker: /tmp/check-display-env.sh"
echo "Run this on your Pi5 to verify your testing environment:"
echo "  bash /tmp/check-display-env.sh"
echo ""

# Summary
echo "📋 Summary"
echo "=========="
echo ""
echo "For accurate ParadoxFX dual-screen testing:"
echo ""
echo "✅ GOOD: Local console, VNC, or SSH without X11 forwarding"
echo "❌ AVOID: SSH with X11 forwarding (default SSH behavior)"
echo ""
echo "The key insight: SSH X11 forwarding routes all video through a tunnel"
echo "back to your laptop, which can only display on your laptop's primary screen."
echo "This makes it impossible to test actual dual-screen video routing."
echo ""
echo "🎯 Next step: Choose one of the three methods above and run:"
echo "   /opt/paradox/apps/pfx/test/manual/test-local-display-routing.sh"
echo ""
