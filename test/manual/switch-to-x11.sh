#!/bin/bash
# Switch Pi5 from Wayland to X11 for better dual-screen support

echo "🔄 Switching Raspberry Pi 5 from Wayland to X11"
echo "==============================================="
echo ""
echo "Based on testing, Wayland has limitations with dual-screen video routing."
echo "X11 provides better application compatibility for tools like MPV."
echo ""
echo "STEPS TO SWITCH:"
echo "1. Run: sudo raspi-config"
echo "2. Navigate to: Advanced Options"
echo "3. Select: Wayland"
echo "4. Choose: X11"
echo "5. Exit raspi-config"
echo "6. Reboot the system"
echo ""
echo "AFTER REBOOT:"
echo "- Run: ./test/manual/test-visual-routing.sh"
echo "- Test ParadoxFX dual-screen functionality"
echo "- Update pfx.ini with working configurations"
echo ""
echo "The working MPV command structure should be:"
echo "Screen 0: mpv --screen=0 --audio-device=alsa/hdmi:CARD=vc4hdmi0,DEV=0"
echo "Screen 1: mpv --screen=1 --audio-device=alsa/hdmi:CARD=vc4hdmi1,DEV=0"
echo ""

read -p "Run raspi-config now? (y/n): " run_config

if [ "$run_config" = "y" ]; then
    echo "Launching raspi-config..."
    sudo raspi-config
    echo ""
    echo "After making changes, reboot with: sudo reboot"
else
    echo "Manual steps:"
    echo "1. sudo raspi-config"
    echo "2. Advanced Options -> Wayland -> X11"
    echo "3. sudo reboot"
fi
