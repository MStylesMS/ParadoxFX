/**
 * @fileoverview MPV Screen Test Script - Seamless Video/Image Transition Demo
 * @description This script demonstrates seamless media transitions using a single MPV instance
 * for screen display. It showcases how to display an image, wait, then transition to a video
 * without any flicker or interruption.
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
 */
const IMAGE_PATH = path.resolve(__dirname, '../fixtures/test-media/default.png');
const VIDEO_PATH = path.resolve(__dirname, '../fixtures/test-media/default.mp4');

/**
 * MPV IPC socket path for screen control
 */
const SCREEN_MPV_SOCKET = '/tmp/mpv-screen-ipc.sock';

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
 * - --fs-screen=0: Targets specific monitor (0 = primary display)
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
 */
const screenArgs = [
    '--idle=yes',
    '--input-ipc-server=' + SCREEN_MPV_SOCKET,
    '--no-terminal',
    '--fs-screen=0',
    '--fullscreen',
    '--keep-open=yes',
    '--no-osd-bar',
    '--msg-level=all=info'
];

/**
 * Send IPC command to MPV instance
 * @param {Object} cmdObj - Command object with 'command' array property
 * @returns {Promise<Object>} Promise resolving to MPV response
 * @throws {Error} If command times out or connection fails
 */
function sendMpvCommand(cmdObj) {
    return new Promise((resolve, reject) => {
        console.log(`[IPC] Connecting to ${SCREEN_MPV_SOCKET}`);
        const client = net.createConnection(SCREEN_MPV_SOCKET, () => {
            console.log('[IPC] Connected. Sending command.');
            const cmdString = JSON.stringify(cmdObj) + '\n';
            console.log(`[IPC] Writing: ${cmdString.trim()}`);
            client.write(cmdString);
        });

        let buffer = '';
        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error(`Command timed out after 5s: ${JSON.stringify(cmdObj)}`));
        }, 5000);

        client.on('data', (chunk) => {
            buffer += chunk.toString();
            console.log(`[IPC] Raw data received: ${chunk.toString().trim()}`);

            // Process buffer line by line
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex);
                buffer = buffer.substring(newlineIndex + 1);

                if (line.trim() === '') continue;

                console.log(`[IPC] Processing line: ${line}`);
                try {
                    const responseJson = JSON.parse(line);
                    // The first non-event response is the command confirmation.
                    if (responseJson.error !== undefined) {
                        console.log(`[IPC] Command confirmation received: ${line}`);
                        clearTimeout(timeout);
                        client.end(); // We got what we needed
                        resolve(responseJson);
                        return; // Stop processing further data on this connection
                    } else {
                        console.log(`[IPC] Received event: ${responseJson.event}`);
                    }
                } catch (e) {
                    console.error(`[IPC] Error parsing JSON line: ${line}`, e);
                }
            }
        });

        client.on('end', () => {
            console.log('[IPC] Connection ended.');
            clearTimeout(timeout);
        });

        client.on('close', (hadError) => {
            console.log(`[IPC] Connection closed. Had error: ${hadError}`);
            clearTimeout(timeout);
        });

        client.on('error', (err) => {
            console.error('[IPC] Connection error:', err);
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/**
 * Create a smart property observer that waits for video to actually start before monitoring end
 * @returns {Promise<void>} Promise that resolves when video actually reaches its end
 */
function createSmartPropertyObserver() {
    return new Promise((resolve, reject) => {
        console.log('[OBSERVER] Creating smart property observer...');
        const client = net.createConnection(SCREEN_MPV_SOCKET, () => {
            console.log('[OBSERVER] Connected to MPV for smart property monitoring');

            // Set up property observations
            const setupCommands = [
                { command: ['observe_property', 1, 'eof-reached'] },
                { command: ['observe_property', 2, 'pause'] },
                { command: ['observe_property', 3, 'playback-time'] },
                { command: ['observe_property', 4, 'duration'] }
            ];

            setupCommands.forEach(cmd => {
                const cmdString = JSON.stringify(cmd) + '\n';
                console.log(`[OBSERVER] Setting up observation: ${cmdString.trim()}`);
                client.write(cmdString);
            });
        });

        let buffer = '';
        let videoHasStarted = false;
        let currentTime = 0;
        let videoDuration = 0;
        let isCurrentlyPaused = false;

        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error('Smart property observer timed out'));
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

                    // Log all events and property changes for debugging
                    if (responseJson.event) {
                        console.log(`[OBSERVER] Event: ${responseJson.event}${responseJson.reason ? ` (${responseJson.reason})` : ''}`);
                    }

                    // Check for property changes
                    if (responseJson.event === 'property-change') {
                        const propName = responseJson.name;
                        const propValue = responseJson.data;
                        console.log(`[OBSERVER] Property changed: ${propName} = ${propValue}`);

                        // Track video properties
                        if (propName === 'playback-time' && propValue !== null) {
                            currentTime = propValue;
                            // Consider video started if we have positive playback time
                            if (propValue > 0.1 && !videoHasStarted) {
                                videoHasStarted = true;
                                console.log('[OBSERVER] Video playback confirmed - now monitoring for end...');
                            }
                        }

                        if (propName === 'duration' && propValue !== null) {
                            videoDuration = propValue;
                            console.log(`[OBSERVER] Video duration: ${videoDuration} seconds`);
                        }

                        if (propName === 'pause') {
                            isCurrentlyPaused = propValue;
                        }

                        // Only detect end if video has actually started
                        if (videoHasStarted) {
                            // Method 1: eof-reached becomes true after video started
                            if (propName === 'eof-reached' && propValue === true) {
                                console.log('[OBSERVER] *** Video reached EOF after starting! ***');
                                clearTimeout(timeout);
                                client.end();
                                resolve();
                                return;
                            }

                            // Method 2: Check if paused and at/near the end time
                            if (propName === 'pause' && propValue === true && videoDuration > 0) {
                                const percentComplete = (currentTime / videoDuration) * 100;
                                console.log(`[OBSERVER] Video paused at ${percentComplete.toFixed(1)}% (${currentTime.toFixed(2)}s / ${videoDuration.toFixed(2)}s)`);

                                if (percentComplete > 95) { // Consider 95%+ as "end"
                                    console.log('[OBSERVER] *** Video paused at end! ***');
                                    clearTimeout(timeout);
                                    client.end();
                                    resolve();
                                    return;
                                }
                            }
                        } else {
                            // Before video starts, log but don't trigger end detection
                            if (propName === 'eof-reached' && propValue === true) {
                                console.log('[OBSERVER] eof-reached=true detected before video started (ignoring)');
                            }
                        }
                    }
                } catch (e) {
                    // Ignore parsing errors for property observer
                }
            }
        });

        client.on('end', () => {
            console.log('[OBSERVER] Smart property observer connection ended.');
            clearTimeout(timeout);
        });

        client.on('close', (hadError) => {
            console.log(`[OBSERVER] Smart property observer connection closed. Had error: ${hadError}`);
            clearTimeout(timeout);
        });

        client.on('error', (err) => {
            console.error('[OBSERVER] Smart property observer connection error:', err);
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/**
 * Wait for video to reach its end using smart property observation
 * @param {Promise} videoEndPromise - Optional pre-started smart property observer promise
 * @returns {Promise<void>} Promise that resolves when video ends
 */
async function waitForVideoEnd(videoEndPromise = null) {
    console.log('[WAIT] Starting to monitor for video end using smart property observation...');
    try {
        if (videoEndPromise) {
            await videoEndPromise;
        } else {
            await createSmartPropertyObserver();
        }
        console.log('[WAIT] Video end detected via smart property observation!');
    } catch (error) {
        console.error('[WAIT] Error waiting for video end:', error);
        // Fallback to polling method
        console.log('[WAIT] Falling back to polling method...');
        await pollForVideoEnd();
    }
}

/**
 * Fallback polling method to detect video end
 * @returns {Promise<void>} Promise that resolves when video ends
 */
async function pollForVideoEnd() {
    console.log('[POLL] Starting polling for video end...');
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds with 500ms intervals

    while (attempts < maxAttempts) {
        try {
            const eofResponse = await sendMpvCommand({ command: ['get_property', 'eof-reached'] });
            if (eofResponse.data === true) {
                console.log('[POLL] Video end detected via polling!');
                return;
            }
        } catch (error) {
            console.error('[POLL] Error checking eof-reached:', error);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
    }

    console.log('[POLL] Polling timeout reached');
}

/**
 * Main execution logic - Demonstrates seamless media transitions with immediate video end detection
 * 
 * Sequence:
 * 1. Clean up any existing MPV instances
 * 2. Launch single MPV instance with seamless transition configuration
 * 3. Wait for IPC socket to be ready
 * 4. Display initial image
 * 5. Wait specified duration
 * 6. Start property observer for immediate video end detection
 * 7. Transition to video playback
 * 8. Wait for video to reach its end (detected via property observation)
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
        // 0. Test IPC connection with a simple command.
        console.log('Testing IPC connection with a simple command...');
        await sendMpvCommand({ command: ['get_property', 'mpv-version'] });
        console.log('IPC connection confirmed.');

        // 1. Display the initial image. It will stay until replaced.
        console.log(`Displaying image: ${IMAGE_PATH}`);
        await sendMpvCommand({ command: ['loadfile', IMAGE_PATH, 'replace'] });

        // 2. Wait for the specified duration.
        console.log('Waiting 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 3. Start smart property observer before playing video
        console.log('Starting smart property observer before video playback...');
        const videoEndPromise = createSmartPropertyObserver();

        // 4. Play the video. --keep-open will hold the last frame.
        console.log(`Playing video: ${VIDEO_PATH}`);
        await sendMpvCommand({ command: ['loadfile', VIDEO_PATH, 'replace'] });
        console.log('Ensuring video is playing...');
        await sendMpvCommand({ command: ['set_property', 'pause', false] });

        // 5. Wait for video to reach its end using smart property observation
        console.log('Waiting for video to reach its end via smart property observation...');
        await waitForVideoEnd(videoEndPromise);
        console.log('✓ Video has reached its end and is paused on the last frame!');

        // 6. Wait for user input to terminate the script.
        console.log('\nVideo playback complete! The last frame is being held on screen.');
        console.log('Press ENTER to quit.');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise(resolve => rl.question('', resolve));
        rl.close();

        // 7. Quit mpv gracefully and exit.
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
