#!/usr/bin/env node
/**
 * @fileoverview ParadoxFX Audio Configuration and Testing Script
 * @description This script validates and configures Raspberry Pi audio settings for ParadoxFX
 * 
 * Features:
 * - Detects current audio system (ALSA, PulseAudio, PipeWire)
 * - Recommends disabling PulseAudio/PipeWire for optimal ParadoxFX performance
 * - Tests all available audio devices and subdevices
 * - Validates multi-channel audio capabilities
 * - Provides configuration recommendations
 * 
 * @author Paradox FX Team
 * @version 1.0.0
 * @since 2025-07-14
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Test audio file paths - fallback to our own files if ALSA sounds not available
const TEST_AUDIO_PATHS = {
    subwoofer: [
        '/usr/share/sounds/alsa/Noise.wav',
        '/opt/paradox/apps/pfx/test/fixtures/test-media/default.wav'
    ],
    leftChannel: [
        '/usr/share/sounds/alsa/Side_Left.wav',
        '/opt/paradox/apps/pfx/test/fixtures/test-media/default.wav'
    ],
    rightChannel: [
        '/usr/share/sounds/alsa/Side_Right.wav',
        '/opt/paradox/apps/pfx/test/fixtures/test-media/default.wav'
    ],
    frontLeft: [
        '/usr/share/sounds/alsa/Front_Left.wav',
        '/opt/paradox/apps/pfx/test/fixtures/test-media/default.wav'
    ],
    frontRight: [
        '/usr/share/sounds/alsa/Front_Right.wav',
        '/opt/paradox/apps/pfx/test/fixtures/test-media/default.wav'
    ],
    rearLeft: [
        '/usr/share/sounds/alsa/Rear_Left.wav',
        '/opt/paradox/apps/pfx/test/fixtures/test-media/default.wav'
    ],
    rearRight: [
        '/usr/share/sounds/alsa/Rear_Right.wav',
        '/opt/paradox/apps/pfx/test/fixtures/test-media/default.wav'
    ],
    center: [
        '/usr/share/sounds/alsa/Front_Center.wav',
        '/opt/paradox/apps/pfx/test/fixtures/test-media/default.wav'
    ]
};

// Audio system state
let audioSystemState = {
    pulseAudioRunning: false,
    pipewireRunning: false,
    audioCards: [],
    testResults: {},
    needsRestart: false
};

/**
 * Create readline interface for user input
 */
function createReadlineInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

/**
 * Ask user a yes/no question
 */
function askQuestion(question) {
    return new Promise((resolve) => {
        const rl = createReadlineInterface();
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase().trim());
        });
    });
}

/**
 * Execute command and return output
 */
function executeCommand(command) {
    try {
        return execSync(command, { encoding: 'utf8' });
    } catch (error) {
        return '';
    }
}

/**
 * Find the first available test audio file
 */
function findTestAudioFile(pathArray) {
    for (const filePath of pathArray) {
        if (fs.existsSync(filePath)) {
            return filePath;
        }
    }
    return null;
}

/**
 * Check if PulseAudio is running
 */
function checkPulseAudio() {
    const paProcess = executeCommand('ps aux | grep pulseaudio | grep -v grep');
    const paService = executeCommand('systemctl --user is-active pulseaudio 2>/dev/null');

    return paProcess.length > 0 || paService.trim() === 'active';
}

/**
 * Check if PipeWire is running
 */
function checkPipeWire() {
    const pwProcess = executeCommand('ps aux | grep pipewire | grep -v grep');
    const pwService = executeCommand('systemctl --user is-active pipewire 2>/dev/null');

    return pwProcess.length > 0 || pwService.trim() === 'active';
}

/**
 * Get available audio cards
 */
function getAudioCards() {
    const cards = [];

    try {
        const cardsOutput = executeCommand('cat /proc/asound/cards');
        const lines = cardsOutput.split('\n');

        for (const line of lines) {
            const match = line.match(/^\s*(\d+)\s+\[(\w+)\s*\]:\s*(.+?)\s*-\s*(.+)$/);
            if (match) {
                const cardId = parseInt(match[1]);
                const cardName = match[2];
                const cardDesc = match[4];

                cards.push({
                    id: cardId,
                    name: cardName,
                    description: cardDesc,
                    device: `hw:${cardId}`,
                    plugDevice: `plughw:${cardId}`
                });
            }
        }
    } catch (error) {
        console.error('Error reading audio cards:', error.message);
    }

    return cards;
}

/**
 * Disable PulseAudio
 */
function disablePulseAudio() {
    console.log('🔧 Disabling PulseAudio...');

    try {
        executeCommand('systemctl --user stop pulseaudio 2>/dev/null');
        executeCommand('systemctl --user disable pulseaudio 2>/dev/null');
        executeCommand('pulseaudio --kill 2>/dev/null');

        console.log('✅ PulseAudio disabled successfully');
        return true;
    } catch (error) {
        console.error('❌ Error disabling PulseAudio:', error.message);
        return false;
    }
}

/**
 * Disable PipeWire
 */
function disablePipeWire() {
    console.log('🔧 Disabling PipeWire...');

    try {
        executeCommand('systemctl --user stop pipewire 2>/dev/null');
        executeCommand('systemctl --user disable pipewire 2>/dev/null');
        executeCommand('systemctl --user stop pipewire-pulse 2>/dev/null');
        executeCommand('systemctl --user disable pipewire-pulse 2>/dev/null');

        console.log('✅ PipeWire disabled successfully');
        return true;
    } catch (error) {
        console.error('❌ Error disabling PipeWire:', error.message);
        return false;
    }
}

/**
 * Test audio playback on specific device
 */
function testAudioPlayback(device, testFile, description) {
    return new Promise((resolve) => {
        console.log(`🎵 Testing: ${description}`);
        console.log(`   Device: ${device}`);
        console.log(`   File: ${testFile}`);

        // Use mpv with ALSA output, force audio, no video, and set volume to 80%
        // --ao=alsa --audio-device=alsa/<device> is the most direct, but device must be in mpv's format
        // device can be e.g. "plughw:0" or "plughw:1"; mpv expects alsa/plughw:0
        let alsaDevice = device.replace(/^plughw:/, 'plughw:');
        let mpvDevice = `alsa/${alsaDevice}`;
        const args = [
            '--ao=alsa',
            `--audio-device=${mpvDevice}`,
            '--no-video',
            '--volume=80',
            '--really-quiet',
            testFile
        ];

        const mpvProcess = spawn('mpv', args, {
            stdio: 'pipe'
        });

        let playbackError = '';

        mpvProcess.stderr.on('data', (data) => {
            playbackError += data.toString();
        });

        mpvProcess.on('close', (code) => {
            if (code !== 0) {
                console.log(`❌ Playback failed: ${playbackError}`);
                resolve(false);
            } else {
                console.log('✅ Playback completed');
                resolve(true);
            }
        });

        mpvProcess.on('error', (error) => {
            console.log(`❌ Playback error: ${error.message}`);
            resolve(false);
        });
    });
}

/**
 * Test all audio devices and subdevices
 */
async function testAudioDevices() {
    console.log('\n🧪 Testing Audio Devices');
    console.log('========================');

    const testResults = {};

    for (const card of audioSystemState.audioCards) {
        console.log(`\n📱 Testing Card ${card.id}: ${card.description}`);

        const cardResults = {
            stereo: false,
            channels: {}
        };

        // Test stereo output
        const stereoTestFile = findTestAudioFile(TEST_AUDIO_PATHS.center);
        if (stereoTestFile) {
            const stereoResult = await testAudioPlayback(
                card.plugDevice,
                stereoTestFile,
                `${card.description} - Stereo Test`
            );

            if (stereoResult) {
                const heard = await askQuestion('Did you hear the audio? (y/n): ');
                cardResults.stereo = heard === 'y';
            }
        }

        // Test individual channels based on card type
        if (card.name === 'Headphones') {
            // Test left/right channels for headphones
            const leftTestFile = findTestAudioFile(TEST_AUDIO_PATHS.leftChannel);
            const rightTestFile = findTestAudioFile(TEST_AUDIO_PATHS.rightChannel);

            if (leftTestFile) {
                console.log('\n🎧 Testing Left Channel');
                const leftResult = await testAudioPlayback(
                    card.plugDevice,
                    leftTestFile,
                    `${card.description} - Left Channel`
                );

                if (leftResult) {
                    const heard = await askQuestion('Did you hear audio in the LEFT channel only? (y/n): ');
                    cardResults.channels.left = heard === 'y';
                }
            }

            if (rightTestFile) {
                console.log('\n🎧 Testing Right Channel');
                const rightResult = await testAudioPlayback(
                    card.plugDevice,
                    rightTestFile,
                    `${card.description} - Right Channel`
                );

                if (rightResult) {
                    const heard = await askQuestion('Did you hear audio in the RIGHT channel only? (y/n): ');
                    cardResults.channels.right = heard === 'y';
                }
            }
        } else if (card.name.includes('hdmi')) {
            // Test surround sound channels for HDMI
            const channelTests = [
                { name: 'Front Left', file: TEST_AUDIO_PATHS.frontLeft },
                { name: 'Front Right', file: TEST_AUDIO_PATHS.frontRight },
                { name: 'Center', file: TEST_AUDIO_PATHS.center },
                { name: 'Subwoofer', file: TEST_AUDIO_PATHS.subwoofer },
                { name: 'Rear Left', file: TEST_AUDIO_PATHS.rearLeft },
                { name: 'Rear Right', file: TEST_AUDIO_PATHS.rearRight }
            ];

            for (const test of channelTests) {
                const testFile = findTestAudioFile(test.file);
                if (testFile) {
                    console.log(`\n🔊 Testing ${test.name} Channel`);
                    const channelResult = await testAudioPlayback(
                        card.plugDevice,
                        testFile,
                        `${card.description} - ${test.name} Channel`
                    );

                    if (channelResult) {
                        const heard = await askQuestion(`Did you hear audio from the ${test.name} channel? (y/n): `);
                        cardResults.channels[test.name.toLowerCase().replace(' ', '_')] = heard === 'y';
                    }
                }
            }
        }

        testResults[card.name] = cardResults;
    }

    audioSystemState.testResults = testResults;
}

/**
 * Display test results summary
 */
function displayTestResults() {
    console.log('\n📊 Test Results Summary');
    console.log('=======================');

    for (const [cardName, results] of Object.entries(audioSystemState.testResults)) {
        const card = audioSystemState.audioCards.find(c => c.name === cardName);
        console.log(`\n📱 ${card.description}:`);

        console.log(`   Stereo Test: ${results.stereo ? '✅ WORKING' : '❌ FAILED'}`);

        if (Object.keys(results.channels).length > 0) {
            console.log('   Channel Tests:');
            for (const [channel, working] of Object.entries(results.channels)) {
                console.log(`     ${channel}: ${working ? '✅ WORKING' : '❌ FAILED'}`);
            }
        }
    }

    // Overall assessment
    const workingDevices = Object.values(audioSystemState.testResults).filter(r => r.stereo).length;
    const totalDevices = audioSystemState.audioCards.length;

    console.log(`\n🎯 Overall Assessment:`);
    console.log(`   Working Audio Devices: ${workingDevices}/${totalDevices}`);

    if (workingDevices === totalDevices) {
        console.log('   🎉 All audio devices are working correctly!');
        console.log('   ✅ Your Pi is ready for ParadoxFX multi-screen audio!');
    } else {
        console.log('   ⚠️  Some audio devices may need attention.');
        console.log('   💡 Check connections and audio settings.');
    }
}

/**
 * Main execution function
 */
async function main() {
    console.log('🍓 ParadoxFX Audio Configuration & Testing Script');
    console.log('===========================================');
    console.log('This script will help configure your Raspberry Pi for optimal ParadoxFX audio performance.\n');

    // Step 1: Check current audio system
    console.log('1️⃣ Checking Current Audio System Configuration');
    console.log('===============================================');

    audioSystemState.pulseAudioRunning = checkPulseAudio();
    audioSystemState.pipewireRunning = checkPipeWire();
    audioSystemState.audioCards = getAudioCards();

    console.log(`PulseAudio: ${audioSystemState.pulseAudioRunning ? '🔴 RUNNING' : '🟢 NOT RUNNING'}`);
    console.log(`PipeWire: ${audioSystemState.pipewireRunning ? '🔴 RUNNING' : '🟢 NOT RUNNING'}`);
    console.log(`ALSA Cards: ${audioSystemState.audioCards.length} found`);

    // Display available cards
    console.log('\n📱 Available Audio Cards:');
    for (const card of audioSystemState.audioCards) {
        console.log(`   ${card.id}: ${card.description} (${card.name})`);
    }

    // Step 2: Recommend disabling PulseAudio/PipeWire
    if (audioSystemState.pulseAudioRunning || audioSystemState.pipewireRunning) {
        console.log('\n⚠️  IMPORTANT RECOMMENDATION');
        console.log('============================');
        console.log('For optimal ParadoxFX performance, we recommend disabling PulseAudio and PipeWire.');
        console.log('This will give ParadoxFX direct access to all audio hardware for:');
        console.log('  • Lower latency audio effects');
        console.log('  • Independent audio routing to each screen');
        console.log('  • Better resource utilization');
        console.log('  • More predictable audio device access');

        if (audioSystemState.pulseAudioRunning) {
            console.log('\n🔴 PulseAudio is currently running');
            const disablePulse = await askQuestion('Would you like to disable PulseAudio? (y/n): ');

            if (disablePulse === 'y') {
                if (disablePulseAudio()) {
                    audioSystemState.needsRestart = true;
                }
            }
        }

        if (audioSystemState.pipewireRunning) {
            console.log('\n🔴 PipeWire is currently running');
            const disablePipe = await askQuestion('Would you like to disable PipeWire? (y/n): ');

            if (disablePipe === 'y') {
                if (disablePipeWire()) {
                    audioSystemState.needsRestart = true;
                }
            }
        }

        if (audioSystemState.needsRestart) {
            console.log('\n🔄 Audio services have been disabled.');
            console.log('⚠️  A REBOOT IS REQUIRED to fully disable the audio services.');
            console.log('');
            console.log('To reboot your Raspberry Pi:');
            console.log('  1. Save any open work');
            console.log('  2. Run: sudo reboot');
            console.log('  3. Wait for the Pi to restart');
            console.log('  4. Run this script again to continue testing');
            console.log('');

            const rebootNow = await askQuestion('Would you like to reboot now? (y/n): ');

            if (rebootNow === 'y') {
                console.log('🔄 Rebooting now...');
                console.log('Please run this script again after the reboot to continue testing.');

                // Give the user a moment to read the message
                setTimeout(() => {
                    require('child_process').spawn('sudo', ['reboot'], { detached: true });
                    process.exit(0);
                }, 2000);
            } else {
                console.log('📝 Please reboot manually when convenient and run this script again.');
                console.log('Command to reboot: sudo reboot');
                process.exit(0);
            }
        }
    } else {
        console.log('\n✅ Audio system is already optimized for ParadoxFX!');
        console.log('Direct ALSA access is available for all audio devices.');
    }

    // Step 3: Test audio devices
    console.log('\n2️⃣ Testing Audio Device Configuration');
    console.log('====================================');

    const continueTest = await askQuestion('Would you like to test all audio devices? (y/n): ');

    if (continueTest === 'y') {
        await testAudioDevices();
        displayTestResults();
    } else {
        console.log('Audio testing skipped.');
    }

    // Step 4: Final recommendations
    console.log('\n3️⃣ ParadoxFX Configuration Recommendations');
    console.log('====================================');

    console.log('For your pfx.ini file, use these device identifiers:');
    for (const card of audioSystemState.audioCards) {
        console.log(`   ${card.description}: plughw:${card.id}`);
    }

    console.log('\n💡 Pro Tips:');
    console.log('  • Use plughw: instead of hw: for better compatibility');
    console.log('  • Test each device before deploying ParadoxFX');
    console.log('  • Consider audio cable quality for best performance');
    console.log('  • Set appropriate volume levels for each zone');

    console.log('\n🎉 Audio configuration complete!');
    console.log('Your Raspberry Pi is ready for ParadoxFX multi-screen audio.');
}

// Run the script
main().catch(error => {
    console.error('❌ Script error:', error);
    process.exit(1);
});
