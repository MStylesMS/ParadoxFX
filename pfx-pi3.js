#!/usr/bin/env node
/**
 * ParadoxFX Pi3 Starter Script
 * 
 * Lightweight launcher for Raspberry Pi 3 optimized ParadoxFX
 */

const { spawn } = require('child_process');
const path = require('path');

// Check if we're running on a Pi3 system
function checkPi3Environment() {
    try {
        const { execSync } = require('child_process');

        // Check for VideoCore commands (Pi-specific)
        execSync('which vcgencmd', { stdio: 'ignore' });

        // Check GPU memory
        const gpuMem = execSync('vcgencmd get_mem gpu', { encoding: 'utf8' });
        const match = gpuMem.match(/gpu=(\d+)M/);

        if (match && parseInt(match[1]) >= 64) {
            return true;
        }

        return false;
    } catch (error) {
        return false;
    }
}

function printUsage() {
    console.log('🍓 ParadoxFX Pi3 - Raspberry Pi 3 Optimized Version');
    console.log('=============================================\n');

    if (!checkPi3Environment()) {
        console.log('⚠️  This appears to be a non-Pi3 system.');
        console.log('   For optimal performance, run this on Raspberry Pi 3 with:');
        console.log('   - Raspberry Pi OS Bullseye (Legacy)');
        console.log('   - GPU memory split (gpu_mem=128+)');
        console.log('   - Hardware acceleration packages\n');
    }

    console.log('Available commands:');
    console.log('');
    console.log('📋 Testing:');
    console.log('  node pfx-pi3.js test-screens    # Test screen hardware acceleration');
    console.log('  node pfx-pi3.js test-mqtt       # Test MQTT communication');
    console.log('');
    console.log('🚀 Running:');
    console.log('  node pfx-pi3.js start [config]  # Start ParadoxFX with Pi3 optimizations');
    console.log('  node pfx-pi3.js start pfx-pi3.ini  # Use Pi3-specific config');
    console.log('');
    console.log('⚙️  Configuration:');
    console.log('  node pfx-pi3.js config          # Show Pi3 configuration guide');
    console.log('');
    console.log('Examples:');
    console.log('  node pfx-pi3.js test-screens');
    console.log('  node pfx-pi3.js start pfx-pi3.ini');
}

function runCommand(command, args = []) {
    const scriptPath = path.join(__dirname, 'test', 'manual', command);

    const child = spawn('node', [scriptPath, ...args], {
        stdio: 'inherit',
        cwd: __dirname
    });

    child.on('error', (error) => {
        console.error(`❌ Failed to run ${command}:`, error.message);
        process.exit(1);
    });

    child.on('exit', (code) => {
        process.exit(code || 0);
    });
}

function showPi3Config() {
    console.log('🍓 Raspberry Pi 3 Configuration Guide');
    console.log('====================================\n');

    console.log('1. 📦 Install Raspberry Pi OS Bullseye (Legacy)');
    console.log('   Download from: https://www.raspberrypi.com/software/operating-systems/');
    console.log('   Choose "Raspberry Pi OS (Legacy)" for hardware acceleration support\n');

    console.log('2. ⚙️  Configure GPU Memory (/boot/config.txt):');
    console.log('   gpu_mem=128  # For Pi3 with 1GB RAM');
    console.log('   gpu_mem=256  # For better video performance (if available RAM allows)\n');

    console.log('3. 📺 Configure HDMI Audio (/boot/config.txt):');
    console.log('   hdmi_drive=2');
    console.log('   hdmi_force_hotplug=1\n');

    console.log('4. 📋 Install Required Packages:');
    console.log('   sudo apt update');
    console.log('   sudo apt install mpv vlc-bin vlc-plugin-base fbi nodejs npm git\n');

    console.log('5. 🔧 Copy Pi3 Configuration:');
    console.log('   cp pfx-pi3.ini.example pfx-pi3.ini');
    console.log('   # Edit pfx-pi3.ini for your setup\n');

    console.log('6. ✅ Verify Setup:');
    console.log('   node pfx-pi3.js test-screens\n');

    console.log('💡 Pro Tips:');
    console.log('   - Use H.264 encoded videos for best performance');
    console.log('   - Limit to 1080p @ 30fps maximum');
    console.log('   - Moderate bitrates (2-8 Mbps) work best');
    console.log('   - Reboot after changing /boot/config.txt');
}

// Main execution
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
    case 'test-screens':
        runCommand('test-screens-pi3.js');
        break;

    case 'test-mqtt':
        runCommand('test-mqtt.js', args.slice(1));
        break;

    case 'start':
        const configFile = args[1] || 'pfx-pi3.ini';
        console.log(`🚀 Starting ParadoxFX Pi3 with config: ${configFile}`);
        runCommand('../pfx.js', ['--config', configFile]);
        break;

    case 'config':
        showPi3Config();
        break;

    default:
        printUsage();
        break;
}
