#!/bin/bash

# Test script for combined audio sink setup
# This script tests the audio setup functionality without running the full PFX app

echo "=== PulseAudio Combined Sink Test ==="
echo "Testing PFX audio setup functionality..."

# Check if PulseAudio is running
if ! pgrep -x "pulseaudio" > /dev/null; then
    echo "❌ PulseAudio is not running"
    exit 1
fi

echo "✅ PulseAudio is running"

# List current sinks
echo ""
echo "=== Current Audio Sinks ==="
pactl list sinks short

# Check for HDMI and analog devices
echo ""
echo "=== Checking for required audio devices ==="

HDMI0_SINK=$(pactl list sinks short | grep "alsa_output.platform-fef00700.hdmi" | cut -f2)
ANALOG_SINK=$(pactl list sinks short | grep "alsa_output.platform-fe00b840.mailbox" | cut -f2)

if [ -n "$HDMI0_SINK" ]; then
    echo "✅ HDMI0 sink found: $HDMI0_SINK"
else
    echo "❌ HDMI0 sink not found"
fi

if [ -n "$ANALOG_SINK" ]; then
    echo "✅ Analog sink found: $ANALOG_SINK"
else
    echo "❌ Analog sink not found"
fi

# Test the audio setup module
echo ""
echo "=== Testing Audio Setup Module ==="
cd /opt/paradox/apps/pfx

# Create a simple test configuration
cat > test-audio-config.json << 'EOF'
{
  "global": {},
  "devices": [
    {
      "name": "audio:test-combined",
      "type": "audio",
      "combinedSinks": ["pulse/alsa_output.platform-fef00700.hdmi.hdmi-stereo", "pulse/alsa_output.platform-fe00b840.mailbox.stereo-fallback"],
      "combinedSinkName": "test_combined_sink",
      "combinedSinkDescription": "Test Combined HDMI0 and Analog"
    }
  ]
}
EOF

# Test script
cat > test-audio-setup.js << 'EOF'
const AudioSetup = require('./lib/utils/audio-setup');

async function testAudioSetup() {
    console.log('Testing AudioSetup class...');
    
    const audioSetup = new AudioSetup();
    
    // Test PulseAudio availability
    const pulseAvailable = await audioSetup.testPulseAudio();
    console.log(`PulseAudio available: ${pulseAvailable}`);
    
    if (!pulseAvailable) {
        console.log('Cannot test further without PulseAudio');
        return;
    }
    
    // Load test configuration
    const config = require('./test-audio-config.json');
    
    try {
        await audioSetup.setupCombinedSinks(config.global, config.devices);
        console.log('✅ Combined sink setup completed');
        
        // List sinks to verify
        const { execSync } = require('child_process');
        console.log('\n=== Sinks after setup ===');
        const output = execSync('pactl list sinks short', { encoding: 'utf8' });
        console.log(output);
        
    } catch (error) {
        console.error('❌ Error during setup:', error.message);
    }
}

testAudioSetup().catch(console.error);
EOF

echo "Running audio setup test..."
node test-audio-setup.js

# Cleanup
rm -f test-audio-config.json test-audio-setup.js

echo ""
echo "=== Test completed ==="
