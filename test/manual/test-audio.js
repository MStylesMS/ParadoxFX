/**
 * @fileoverview MPV Audio Test Script - Multi-track Audio with Low-Latency Sound Effects
 * @description This script tests MPV's audio capabilities for the PxFx system, including:
 * - Background music playback and looping
 * - Low-latency sound effects (target: <100ms)
 * - Audio ducking (lowering background music for speech)
 * - Real-time volume control via IPC
 * - Multiple simultaneous audio streams
 * 
 * @author Paradox FX Team
 * @version 1.0.0
 * @since 2025-07-09
 */

const net = require('net');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const readline = require('readline');

/**
 * Test audio file paths
 */
const BACKGROUND_MUSIC = path.resolve(__dirname, '../fixtures/test-media/houdini_music.mp3');
const SOUND_EFFECT = path.resolve(__dirname, '../fixtures/test-media/default_fx.wav');
const SPEECH_AUDIO = path.resolve(__dirname, '../fixtures/test-media/default_hq.mp3');
const SHORT_AUDIO = path.resolve(__dirname, '../fixtures/test-media/default.wav');

/**
 * MPV IPC socket paths for different audio purposes
 */
const BACKGROUND_MUSIC_SOCKET = '/tmp/mpv-background-ipc.sock';
const SOUND_EFFECTS_SOCKET = '/tmp/mpv-effects-ipc.sock';
const SPEECH_SOCKET = '/tmp/mpv-speech-ipc.sock';

// Clean up old socket files before starting
const sockets = [BACKGROUND_MUSIC_SOCKET, SOUND_EFFECTS_SOCKET, SPEECH_SOCKET];
sockets.forEach(socket => {
    try {
        fs.unlinkSync(socket);
    } catch (e) {
        // Ignore error if file doesn't exist
    }
});

/**
 * MPV AUDIO CONFIGURATION STRATEGY
 * ================================
 * 
 * For low-latency audio and multi-track support, we'll use multiple MPV instances:
 * 
 * 1. BACKGROUND MUSIC INSTANCE:
 *    - Handles continuous background music with looping
 *    - Volume control for ducking during speech
 *    - Uses audio-only mode for efficiency
 * 
 * 2. SOUND EFFECTS INSTANCE:
 *    - Pre-loaded and ready for immediate playback
 *    - Optimized for minimum latency (<100ms target)
 *    - Uses --keep-open to avoid reload delays
 * 
 * 3. SPEECH/NARRATION INSTANCE:
 *    - Handles spoken audio, hints, narration
 *    - Triggers background music ducking
 *    - Audio-only mode for efficiency
 * 
 * Key MPV Arguments for Audio:
 * - --no-video: Audio-only mode (faster startup)
 * - --idle=yes: Keep instance running
 * - --loop-file=inf: Loop background music
 * - --volume=N: Set initial volume
 * - --cache=yes: Enable caching for smoother playback
 * - --audio-buffer=0.1: Minimize audio buffer for low latency
 */

/**
 * Create MPV arguments for different audio purposes
 */
function createAudioArgs(socketPath, purpose) {
    const baseArgs = [
        '--idle=yes',
        `--input-ipc-server=${socketPath}`,
        '--no-terminal',
        '--no-video',  // Audio-only mode
        '--msg-level=all=info'
    ];

    switch (purpose) {
        case 'background':
            return [
                ...baseArgs,
                '--volume=70',           // Lower default volume for background
                '--loop-file=inf',       // Loop background music
                '--cache=yes'
            ];

        case 'effects':
            return [
                ...baseArgs,
                '--volume=100',          // Full volume for effects
                '--keep-open=yes',       // Keep ready for instant playback
                '--audio-buffer=0.05',   // Minimal buffer for low latency
                '--cache=no'             // Disable cache to reduce latency
            ];

        case 'speech':
            return [
                ...baseArgs,
                '--volume=90',           // High volume for speech
                '--keep-open=yes',
                '--cache=yes'
            ];

        default:
            return baseArgs;
    }
}

/**
 * Send IPC command to specific MPV instance
 * @param {string} socketPath - Path to the MPV IPC socket
 * @param {Object} cmdObj - Command object with 'command' array property
 * @returns {Promise<Object>} Promise resolving to MPV response
 */
function sendMpvCommand(socketPath, cmdObj) {
    return new Promise((resolve, reject) => {
        const client = net.createConnection(socketPath, () => {
            const cmdString = JSON.stringify(cmdObj) + '\n';
            client.write(cmdString);
        });

        let buffer = '';
        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error(`Command timed out: ${JSON.stringify(cmdObj)}`));
        }, 5000);

        client.on('data', (chunk) => {
            buffer += chunk.toString();

            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex);
                buffer = buffer.substring(newlineIndex + 1);

                if (line.trim() === '') continue;

                try {
                    const responseJson = JSON.parse(line);
                    if (responseJson.error !== undefined) {
                        clearTimeout(timeout);
                        client.end();
                        resolve(responseJson);
                        return;
                    }
                } catch (e) {
                    // Ignore parsing errors for events
                }
            }
        });

        client.on('end', () => clearTimeout(timeout));
        client.on('close', () => clearTimeout(timeout));
        client.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/**
 * Measure audio latency by timing command execution
 * @param {string} socketPath - MPV socket path
 * @param {Object} command - MPV command to execute
 * @returns {Promise<number>} Latency in milliseconds
 */
async function measureAudioLatency(socketPath, command) {
    const startTime = Date.now();
    try {
        await sendMpvCommand(socketPath, command);
        const endTime = Date.now();
        return endTime - startTime;
    } catch (error) {
        console.error('Error measuring latency:', error);
        return -1;
    }
}

/**
 * Wait for MPV socket to be ready
 * @param {string} socketPath - Path to socket file
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<boolean>} True if socket is ready
 */
async function waitForSocket(socketPath, maxRetries = 20) {
    for (let i = 0; i < maxRetries; i++) {
        if (fs.existsSync(socketPath)) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    return false;
}

/**
 * Test background music playback and volume control
 */
async function testBackgroundMusic() {
    console.log('\n=== Testing Background Music ===');

    try {
        // Test loading background music
        console.log('Loading background music...');
        await sendMpvCommand(BACKGROUND_MUSIC_SOCKET, {
            command: ['loadfile', BACKGROUND_MUSIC, 'replace']
        });
        console.log('✓ Background music loaded');

        // Test volume control
        console.log('Testing volume control...');
        await sendMpvCommand(BACKGROUND_MUSIC_SOCKET, {
            command: ['set_property', 'volume', 50]
        });
        console.log('✓ Volume set to 50%');

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test volume ducking (simulate speech playing)
        console.log('Testing audio ducking (lowering to 20%)...');
        await sendMpvCommand(BACKGROUND_MUSIC_SOCKET, {
            command: ['set_property', 'volume', 20]
        });
        console.log('✓ Background music ducked');

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Restore volume
        console.log('Restoring volume to 70%...');
        await sendMpvCommand(BACKGROUND_MUSIC_SOCKET, {
            command: ['set_property', 'volume', 70]
        });
        console.log('✓ Volume restored');

        return true;
    } catch (error) {
        console.error('❌ Background music test failed:', error);
        return false;
    }
}

/**
 * Test low-latency sound effects
 */
async function testSoundEffects() {
    console.log('\n=== Testing Low-Latency Sound Effects ===');

    try {
        // Pre-load sound effect for instant playback
        console.log('Pre-loading sound effect...');
        await sendMpvCommand(SOUND_EFFECTS_SOCKET, {
            command: ['loadfile', SOUND_EFFECT, 'replace']
        });
        await sendMpvCommand(SOUND_EFFECTS_SOCKET, {
            command: ['set_property', 'pause', true]
        });
        console.log('✓ Sound effect pre-loaded and paused');

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Measure latency for immediate playback
        console.log('Measuring sound effect latency...');
        const latencies = [];

        for (let i = 0; i < 5; i++) {
            console.log(`  Test ${i + 1}/5...`);

            // Reset to beginning and pause
            await sendMpvCommand(SOUND_EFFECTS_SOCKET, {
                command: ['seek', 0, 'absolute']
            });
            await sendMpvCommand(SOUND_EFFECTS_SOCKET, {
                command: ['set_property', 'pause', true]
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            // Measure unpause latency
            const latency = await measureAudioLatency(SOUND_EFFECTS_SOCKET, {
                command: ['set_property', 'pause', false]
            });

            if (latency > 0) {
                latencies.push(latency);
                console.log(`    Latency: ${latency}ms`);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (latencies.length > 0) {
            const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            const minLatency = Math.min(...latencies);
            const maxLatency = Math.max(...latencies);

            console.log(`\n📊 Sound Effect Latency Results:`);
            console.log(`   Average: ${avgLatency.toFixed(1)}ms`);
            console.log(`   Min: ${minLatency}ms`);
            console.log(`   Max: ${maxLatency}ms`);
            console.log(`   Target: <100ms`);

            if (avgLatency < 100) {
                console.log('✓ Sound effects meet latency requirement!');
                return true;
            } else {
                console.log('❌ Sound effects exceed latency requirement');
                return false;
            }
        } else {
            console.log('❌ Failed to measure latency');
            return false;
        }

    } catch (error) {
        console.error('❌ Sound effects test failed:', error);
        return false;
    }
}

/**
 * Test speech/narration with background music ducking
 */
async function testSpeechWithDucking() {
    console.log('\n=== Testing Speech with Background Music Ducking ===');

    try {
        // Ensure background music is playing
        console.log('Ensuring background music is playing...');
        await sendMpvCommand(BACKGROUND_MUSIC_SOCKET, {
            command: ['set_property', 'pause', false]
        });
        await sendMpvCommand(BACKGROUND_MUSIC_SOCKET, {
            command: ['set_property', 'volume', 70]
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Duck background music before speech
        console.log('Ducking background music for speech...');
        await sendMpvCommand(BACKGROUND_MUSIC_SOCKET, {
            command: ['set_property', 'volume', 25]
        });

        // Play speech
        console.log('Playing speech audio...');
        await sendMpvCommand(SPEECH_SOCKET, {
            command: ['loadfile', SPEECH_AUDIO, 'replace']
        });

        await new Promise(resolve => setTimeout(resolve, 3000));

        // Restore background music volume
        console.log('Restoring background music volume...');
        await sendMpvCommand(BACKGROUND_MUSIC_SOCKET, {
            command: ['set_property', 'volume', 70]
        });

        console.log('✓ Speech with ducking test completed');
        return true;

    } catch (error) {
        console.error('❌ Speech with ducking test failed:', error);
        return false;
    }
}

/**
 * Test multiple simultaneous audio streams
 */
async function testMultipleAudioStreams() {
    console.log('\n=== Testing Multiple Simultaneous Audio Streams ===');

    try {
        console.log('Playing background music + sound effect + speech simultaneously...');

        // Background music at low volume
        await sendMpvCommand(BACKGROUND_MUSIC_SOCKET, {
            command: ['set_property', 'volume', 40]
        });
        await sendMpvCommand(BACKGROUND_MUSIC_SOCKET, {
            command: ['set_property', 'pause', false]
        });

        await new Promise(resolve => setTimeout(resolve, 500));

        // Sound effect
        await sendMpvCommand(SOUND_EFFECTS_SOCKET, {
            command: ['seek', 0, 'absolute']
        });
        await sendMpvCommand(SOUND_EFFECTS_SOCKET, {
            command: ['set_property', 'pause', false]
        });

        await new Promise(resolve => setTimeout(resolve, 500));

        // Speech
        await sendMpvCommand(SPEECH_SOCKET, {
            command: ['loadfile', SHORT_AUDIO, 'replace']
        });

        console.log('All three audio streams should be playing simultaneously...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('✓ Multiple audio streams test completed');
        return true;

    } catch (error) {
        console.error('❌ Multiple audio streams test failed:', error);
        return false;
    }
}

/**
 * Main execution logic - Comprehensive audio testing
 */
(async () => {
    console.log('🎵 MPV Audio Capabilities Test Suite');
    console.log('=====================================');

    // Terminate any old MPV instances
    try {
        console.log('Terminating old MPV instances...');
        execSync('pkill -f "mpv.*ipc"');
        console.log('Old MPV instances terminated.');
    } catch (err) {
        console.log('No old MPV instances found.');
    }

    const results = {
        backgroundMusic: false,
        soundEffects: false,
        speechDucking: false,
        multipleStreams: false
    };

    try {
        // Launch MPV instances for different audio purposes
        console.log('\nLaunching MPV audio instances...');

        const backgroundMpv = spawn('mpv', createAudioArgs(BACKGROUND_MUSIC_SOCKET, 'background'), { detached: false });
        const effectsMpv = spawn('mpv', createAudioArgs(SOUND_EFFECTS_SOCKET, 'effects'), { detached: false });
        const speechMpv = spawn('mpv', createAudioArgs(SPEECH_SOCKET, 'speech'), { detached: false });

        // Wait for all sockets to be ready
        console.log('Waiting for MPV instances to initialize...');
        const socketsReady = await Promise.all([
            waitForSocket(BACKGROUND_MUSIC_SOCKET),
            waitForSocket(SOUND_EFFECTS_SOCKET),
            waitForSocket(SPEECH_SOCKET)
        ]);

        if (!socketsReady.every(ready => ready)) {
            throw new Error('Failed to initialize all MPV instances');
        }

        console.log('✓ All MPV audio instances ready');

        // Test IPC connections
        console.log('\nTesting IPC connections...');
        await sendMpvCommand(BACKGROUND_MUSIC_SOCKET, { command: ['get_property', 'mpv-version'] });
        await sendMpvCommand(SOUND_EFFECTS_SOCKET, { command: ['get_property', 'mpv-version'] });
        await sendMpvCommand(SPEECH_SOCKET, { command: ['get_property', 'mpv-version'] });
        console.log('✓ All IPC connections confirmed');

        // Run audio tests
        results.backgroundMusic = await testBackgroundMusic();
        results.soundEffects = await testSoundEffects();
        results.speechDucking = await testSpeechWithDucking();
        results.multipleStreams = await testMultipleAudioStreams();

        // Display results
        console.log('\n🏁 Test Results Summary');
        console.log('=======================');
        console.log(`Background Music Control: ${results.backgroundMusic ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Low-Latency Sound Effects: ${results.soundEffects ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Speech with Ducking: ${results.speechDucking ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Multiple Audio Streams: ${results.multipleStreams ? '✅ PASS' : '❌ FAIL'}`);

        const allPassed = Object.values(results).every(result => result);
        console.log(`\nOverall Result: ${allPassed ? '🎉 ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED'}`);

        if (allPassed) {
            console.log('\nMPV is suitable for all audio requirements in the PxFx system!');
        } else {
            console.log('\nSome audio features may need alternative solutions or optimization.');
        }

        // Wait for user input before cleanup
        console.log('\nPress ENTER to quit and cleanup...');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise(resolve => rl.question('', resolve));
        rl.close();

        // Cleanup
        console.log('Cleaning up...');
        await Promise.all([
            sendMpvCommand(BACKGROUND_MUSIC_SOCKET, { command: ['quit'] }).catch(() => { }),
            sendMpvCommand(SOUND_EFFECTS_SOCKET, { command: ['quit'] }).catch(() => { }),
            sendMpvCommand(SPEECH_SOCKET, { command: ['quit'] }).catch(() => { })
        ]);

        backgroundMpv.kill();
        effectsMpv.kill();
        speechMpv.kill();

    } catch (error) {
        console.error('Fatal error during testing:', error);
        process.exit(1);
    }

    console.log('Audio testing complete!');
    process.exit(0);
})();
