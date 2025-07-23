#!/bin/bash
# Disable Screen Blanking for ParadoxFX
# =====================================
# This script disables all forms of screen blanking to ensure
# ParadoxFX displays remain active continuously

echo "🔧 ParadoxFX: Disabling screen blanking..."

# Set DISPLAY if not already set
export DISPLAY=${DISPLAY:-:0}

# Disable X11 screensaver and blanking
xset s off          # Disable screensaver
xset -dpms          # Disable Display Power Management Signaling
xset s noblank      # Prevent screen blanking
xset dpms 0 0 0     # Set all DPMS timeouts to 0 (disabled)

echo "✅ Screen blanking disabled for ParadoxFX operation"
echo "📊 Current settings:"
echo "   Screen Saver: $(xset q | grep 'timeout:' | awk '{print $2}' | head -1) seconds"
echo "   DPMS Status: $(xset q | grep 'DPMS is' | awk '{print $3}')"

# Verify displays are active
echo "🖥️  Active displays:"
xrandr --current | grep " connected" | awk '{print "   " $1 ": " $3}'
