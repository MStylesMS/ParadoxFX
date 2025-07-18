#!/bin/bash
# Pi5 Audio Device Discovery Script
# Run this after booting on Pi5 to verify audio device mappings

echo "=========================================="
echo "Pi5 Audio Device Discovery for ParadoxFX"
echo "=========================================="
echo ""

echo "=== System Information ==="
echo "Kernel: $(uname -r)"
echo "Hardware: $(dmesg | grep -i 'raspberry\|pi' | grep -i model | head -1 | cut -d']' -f2)"
echo "Memory: $(free -h | grep Mem | awk '{print $2}') total"
echo ""

echo "=== Audio Cards ==="
if [ -f /proc/asound/cards ]; then
    cat /proc/asound/cards
else
    echo "No audio cards found"
fi
echo ""

echo "=== ALSA Playback Devices ==="
aplay -l 2>/dev/null || echo "aplay command not available"
echo ""

echo "=== PulseAudio Sinks ==="
if command -v pactl &> /dev/null; then
    pactl list sinks short 2>/dev/null || echo "PulseAudio not running"
else
    echo "PulseAudio not available"
fi
echo ""

echo "=== Current ParadoxFX Device Mapping ==="
echo "Based on test-audio-3devices.js:"
echo "  screen0: alsa/plughw:1 (Expected: HDMI 0)"
echo "  screen1: alsa/plughw:2 (Expected: HDMI 1)" 
echo "  headphones: alsa/plughw:0 (Expected: Analog)"
echo ""

echo "=== Recommended Actions ==="
echo "1. Compare device indices above with ParadoxFX mapping"
echo "2. If different, update AUDIO_DEVICE_MAP in:"
echo "   - test/manual/test-audio-3devices.js"
echo "   - docs/MQTT_API.md (if documentation needs updating)"
echo "3. Test audio with: node test/manual/test-audio.js"
echo "4. Test multi-zone with: node test/manual/test-audio-3devices.js"
echo "5. Commit any device mapping changes"
echo ""

echo "=== Testing Audio Devices ==="
echo "Testing each device with a brief tone..."

# Test each expected device
for device in 0 1 2; do
    echo "Testing alsa/plughw:$device..."
    if speaker-test -D plughw:$device -t sine -f 1000 -l 1 -s 1 &>/dev/null; then
        echo "  ✅ Device $device: Working"
    else
        echo "  ❌ Device $device: Failed or not available"
    fi
done

echo ""
echo "=== GPU Memory Check ==="
if command -v vcgencmd &> /dev/null; then
    ARM_MEM=$(vcgencmd get_mem arm 2>/dev/null | cut -d'=' -f2)
    GPU_MEM=$(vcgencmd get_mem gpu 2>/dev/null | cut -d'=' -f2)
    echo "ARM Memory: $ARM_MEM"
    echo "GPU Memory: $GPU_MEM"
    
    if [[ "$GPU_MEM" == "256M" ]]; then
        echo "✅ GPU memory configured for Pi5 (256MB)"
    elif [[ "$GPU_MEM" == "128M" ]]; then
        echo "⚠️  GPU memory at Pi4 setting (128MB) - may want to increase for Pi5"
    else
        echo "ℹ️  GPU memory: $GPU_MEM"
    fi
else
    echo "vcgencmd not available"
fi

echo ""
echo "Discovery complete. Review results above and update device mappings if needed."
