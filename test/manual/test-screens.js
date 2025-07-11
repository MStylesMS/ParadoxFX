/**
 * @fileoverview MPV Screen Test Script - Seamless Video/Image Transition Demo
 * @description This script demonstrates seamless media transitions using a single MPV instance
 * for screen display. It showcases how to display an image, wait, then transition to a video
 * without any flicker or interruption.
 * 
 * INTEGRATION NOTES:
 * =================
 * This file contains reusable components for the main PxFx system:
 * 
 * REUSABLE FUNCTIONS (for integration):
 * - sendMpvCommand() - IPC communication (shared with audio system)
 * - createSmartPropertyObserver() - Video end detection
 * - waitForVideoEnd() - Video completion monitoring
 * - pollForVideoEnd() - Fallback detection method
 * 
 * VIDEO ARCHITECTURE (for PxFx integration):
 * - Single MPV instance for seamless screen transitions
 * - Smart property observation for immediate end detection
 * - Fullscreen video display with last frame holding
 * - IPC-based control for synchronized operations
 * 
 * INTEGRATION STRATEGY:
 * - Video instance runs independently from audio instances
 * - Same IPC communication pattern as audio system
 * - Property observation can trigger audio events
 * - Socket management unified with audio sockets
 * - End detection triggers next sequence in show
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
 * Test media file paths
 * 
 * INTEGRATION NOTE: In PxFx system, these will be dynamically resolved
 * from the show configuration and media management system
 */
const IMAGE_PATH = path.resolve(__dirname, '../fixtures/test-media/default.png');
const VIDEO_PATH = path.resolve(__dirname, '../fixtures/test-media/default.mp4');

/**
 * MPV IPC socket path for screen control
 * 
 * INTEGRATION NOTE: In PxFx system, this will be managed by a central
 * socket manager alongside audio sockets
 */
const SCREEN_MPV_SOCKET = '/tmp/mpv-screen-ipc.sock';

// INTEGRATION FUNCTION: Socket cleanup utility (reusable)
// Clean up old socket file before starting
try {
    fs.unlinkSync(SCREEN_MPV_SOCKET);
} catch (e) {
    // Ignore error if file doesn't exist
}

/**
 * MPV SEAMLESS TRANSITION CONFIGURATION
 * ====================================
 * 
 * This script uses a single MPV instance to control screen display with seamless transitions.
 * The key to seamless playback is the combination of specific MPV arguments that ensure:
 * 1. No interruption between media files
 * 2. Fullscreen display on target monitor
 * 3. IPC control for programmatic commands
 * 
 * MPV Arguments Explained:
 * - --idle=yes: Keeps MPV running even when no file is loaded
 * - --input-ipc-server=/tmp/mpv-screen-ipc.sock: Enables IPC control via Unix socket
 * - --no-terminal: Prevents terminal output interference
 * - --fs-screen=1: Targets specific monitor (1 = secondary display)
 * - --fullscreen: Forces fullscreen mode
 * - --keep-open=yes: Holds the last frame of videos/images until replaced
 * - --no-osd-bar: Hides on-screen controls for clean display
 * - --msg-level=all=info: Sets logging level for debugging
 * 
 * The seamless transition works because:
 * 1. MPV stays running in idle mode between media files
 * 2. --keep-open=yes ensures the current frame remains visible
 * 3. loadfile with 'replace' mode switches content instantly
 * 4. No process restart = no screen flicker or black frames
 */
/**
 * MPV command line arguments for seamless screen display
 * 
 * INTEGRATION NOTE: These arguments are optimized for video display
 * and will be used in the main PxFx video player configuration
 */
const screenArgs = [
    '--idle=yes',
    '--input-ipc-server=' + SCREEN_MPV_SOCKET,
    '--no-terminal',
    '--fs-screen=1',
    '--fullscreen',
    '--keep-open=yes',
    '--no-osd-bar',
    '--msg-level=all=info'
];

/**
 * INTEGRATION FUNCTION: Send IPC command to MPV instance
 * 
 * This function can be shared with the audio system - same pattern
 * for all MPV IPC communication in the PxFx system.
 * 
 * @param {Object} cmdObj - Command object with 'command' array property
 * @returns {Promise<Object>} Promise resolving to MPV response
 * @throws {Error} If command times out or connection fails
 */
function sendMpvCommand(cmdObj) {
    return new Promise((resolve, reject) => {
        const client = net.createConnection(SCREEN_MPV_SOCKET, () => {
            const cmdString = JSON.stringify(cmdObj) + '\n';
            client.write(cmdString);
        });

        let buffer = '';
        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error(`Command timed out after 5s: ${JSON.stringify(cmdObj)}`));
        }, 5000);

        client.on('data', (chunk) => {
            buffer += chunk.toString();

            // Process buffer line by line
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex);
                buffer = buffer.substring(newlineIndex + 1);

                if (line.trim() === '') continue;

                try {
                    const responseJson = JSON.parse(line);
                    // The first non-event response is the command confirmation
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

        client.on('end', () => {
            clearTimeout(timeout);
        });

        client.on('close', (hadError) => {
            clearTimeout(timeout);
        });

        client.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/**
 * INTEGRATION FUNCTION: Create a smart property observer for video end detection
 * 
 * This solves the critical issue where eof-reached=true is set immediately 
 * with --keep-open=yes. The function waits for actual video start before 
 * monitoring for end, preventing false positives.
 * 
 * Key integration features:
 * - Immediate video end detection after playback starts
 * - No false positives from --keep-open behavior  
 * - Can trigger audio events or next sequence in show
 * - Property observation pattern reusable for other MPV monitoring
 * 
 * @returns {Promise<void>} Promise that resolves when video actually reaches its end
 */
function createSmartPropertyObserver() {
    return new Promise((resolve, reject) => {
        console.log('Setting up video end detection...');
        const client = net.createConnection(SCREEN_MPV_SOCKET, () => {
            // Set up property observations for video end detection
            const setupCommands = [
                { command: ['observe_property', 1, 'eof-reached'] },
                { command: ['observe_property', 2, 'playback-time'] },
                { command: ['observe_property', 3, 'duration'] }
            ];

            setupCommands.forEach(cmd => {
                const cmdString = JSON.stringify(cmd) + '\n';
                client.write(cmdString);
            });
        });

        let buffer = '';
        let videoHasStarted = false;
        let currentTime = 0;
        let videoDuration = 0;

        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error('Video end detection timed out'));
        }, 60000);

        client.on('data', (chunk) => {
            buffer += chunk.toString();

            // Process buffer line by line
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex);
                buffer = buffer.substring(newlineIndex + 1);

                if (line.trim() === '') continue;

                try {
                    const responseJson = JSON.parse(line);

                    // Check for property changes
                    if (responseJson.event === 'property-change') {
                        const propName = responseJson.name;
                        const propValue = responseJson.data;

                        // Track video properties
                        if (propName === 'playback-time' && propValue !== null) {
                            currentTime = propValue;
                            // Consider video started if we have positive playback time
                            if (propValue > 0.1 && !videoHasStarted) {
                                videoHasStarted = true;
                                console.log('Video playback started - monitoring for end...');
                            }
                        }

                        if (propName === 'duration' && propValue !== null) {
                            videoDuration = propValue;
                        }

                        // Only detect end if video has actually started
                        if (videoHasStarted) {
                            // Primary detection: eof-reached becomes true after video started
                            if (propName === 'eof-reached' && propValue === true) {
                                console.log('Video reached end - detected via eof-reached property');
                                clearTimeout(timeout);
                                client.end();
                                resolve();
                                return;
                            }
                        }
                    }
                } catch (e) {
                    // Ignore parsing errors for property observer
                }
            }
        });

        client.on('end', () => {
            clearTimeout(timeout);
        });

        client.on('close', (hadError) => {
            clearTimeout(timeout);
        });

        client.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/**
 * INTEGRATION FUNCTION: Wait for video to reach its end using smart property observation
 * 
 * This function provides the main interface for video end detection in PxFx.
 * It uses the smart property observer with polling fallback for reliability.
 * 
 * @param {Promise} videoEndPromise - Optional pre-started smart property observer promise
 * @returns {Promise<void>} Promise that resolves when video ends
 */
async function waitForVideoEnd(videoEndPromise = null) {
    try {
        if (videoEndPromise) {
            await videoEndPromise;
        } else {
            await createSmartPropertyObserver();
        }
        console.log('Video end detected successfully!');
    } catch (error) {
        console.error('Error waiting for video end:', error);
        // INTEGRATION NOTE: Fallback polling ensures reliability
        console.log('Falling back to polling method...');
        await pollForVideoEnd();
    }
}

/**
 * INTEGRATION FUNCTION: Fallback polling method to detect video end
 * 
 * This provides a reliable backup method when property observation fails.
 * Used as secondary detection method in production PxFx system.
 * 
 * @returns {Promise<void>} Promise that resolves when video ends
 */
async function pollForVideoEnd() {
    console.log('Starting polling for video end...');
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds with 500ms intervals

    while (attempts < maxAttempts) {
        try {
            const eofResponse = await sendMpvCommand({ command: ['get_property', 'eof-reached'] });
            if (eofResponse.data === true) {
                console.log('Video end detected via polling!');
                return;
            }
        } catch (error) {
            console.error('Error checking eof-reached:', error);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
    }

    console.log('Polling timeout reached');
}

// ============================================================================
// MAIN EXECUTION LOGIC - VIDEO TESTING
// 
// INTEGRATION BLUEPRINT: This section demonstrates the complete video system
// initialization and control pattern for the PxFx system.
// 
// Key integration patterns:
// 1. Single MPV instance for seamless video transitions
// 2. Image to video transition workflow
// 3. Smart video end detection preventing false positives
// 4. Graceful cleanup and process management
// 
// COMBINATION NOTES: This video system will run alongside the audio system
// with coordinated timing and event triggering between them.
// ============================================================================

/**
 * Main execution logic - Demonstrates seamless media transitions with reliable video end detection
 * 
 * This script demonstrates the complete solution for detecting when a video reaches its end
 * and pauses on the last frame with --keep-open=yes. The key insight is that eof-reached
 * becomes true immediately when a video loads, so we must wait for actual playback to start
 * before monitoring for the end condition.
 * 
 * Detection Methods:
 * 1. Smart Property Observer (Primary): Waits for video start, then monitors eof-reached
 * 2. Polling Fallback: Periodically checks eof-reached property as backup
 * 
 * Sequence:
 * 1. Clean up any existing MPV instances
 * 2. Launch single MPV instance with seamless transition configuration  
 * 3. Wait for IPC socket to be ready
 * 4. Display initial image
 * 5. Wait specified duration
 * 6. Start smart property observer for video end detection
 * 7. Transition to video playback
 * 8. Wait for video to reach its end (detected when playback started AND eof-reached=true)
 * 9. Display completion message
 * 10. Wait for user input to terminate
 * 11. Gracefully quit MPV
 */
(async () => {
    // Terminate any old MPV instances to ensure a clean start.
    try {
        console.log('Terminating old MPV instances...');
        execSync('pkill -f "mpv --input-ipc-server=/tmp/mpv-screen-ipc.sock"');
        console.log('Old MPV instances terminated.');
    } catch (err) {
        // This is expected if no old processes are running.
        console.log('No old MPV instances found.');
    }

    // Launch the single MPV instance for the screen.
    // { detached: false } ensures it's a child process.
    console.log(`Launching single MPV instance with args: ${screenArgs.join(' ')}`);
    const screenMpv = spawn('mpv', screenArgs, { detached: false });

    screenMpv.on('error', (err) => {
        console.error('Fatal: Failed to start the MPV process.', err);
        process.exit(1);
    });

    screenMpv.stderr.on('data', (data) => {
        console.error(`mpv stderr: ${data}`);
    });

    // Wait for the IPC socket to be created by mpv.
    console.log('Waiting for MPV to create IPC socket...');
    let retries = 10; // Increased retries
    while (retries > 0) {
        if (fs.existsSync(SCREEN_MPV_SOCKET)) {
            console.log('MPV IPC socket is ready.');
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        retries--;
    }

    if (!fs.existsSync(SCREEN_MPV_SOCKET)) {
        console.error('Fatal: MPV did not create the IPC socket in time. Exiting.');
        screenMpv.kill();
        process.exit(1);
    }

    try {
        // Test IPC connection with a simple command
        console.log('Testing IPC connection...');
        await sendMpvCommand({ command: ['get_property', 'mpv-version'] });
        console.log('IPC connection confirmed.');

        // Display the initial image
        console.log(`Displaying image: ${IMAGE_PATH}`);
        await sendMpvCommand({ command: ['loadfile', IMAGE_PATH, 'replace'] });

        // Wait for the specified duration
        console.log('Waiting 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Start smart property observer before playing video
        console.log('Starting video end detection...');
        const videoEndPromise = createSmartPropertyObserver();

        // Play the video - --keep-open will hold the last frame
        console.log(`Playing video: ${VIDEO_PATH}`);
        await sendMpvCommand({ command: ['loadfile', VIDEO_PATH, 'replace'] });
        console.log('Ensuring video is playing...');
        await sendMpvCommand({ command: ['set_property', 'pause', false] });

        // Wait for video to reach its end using smart property observation
        console.log('Waiting for video to complete...');
        await waitForVideoEnd(videoEndPromise);
        console.log('✓ Video has reached its end and is paused on the last frame!');

        // Wait for user input to terminate the script
        console.log('\nVideo playback complete! The last frame is being held on screen.');
        console.log('Press ENTER to quit.');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise(resolve => rl.question('', resolve));
        rl.close();

        // Quit mpv gracefully and exit
        console.log('Quitting MPV and exiting...');
        await sendMpvCommand({ command: ['quit'] });

    } catch (error) {
        console.error('An error occurred during the playback sequence:', error);
    } finally {
        // Ensure the mpv process is killed on exit.
        screenMpv.kill();
        console.log('Test finished.');
        process.exit(0);
    }
})();
