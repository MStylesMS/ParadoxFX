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
 * Main execution logic - Demonstrates seamless media transitions
 * 
 * Sequence:
 * 1. Clean up any existing MPV instances
 * 2. Launch single MPV instance with seamless transition configuration
 * 3. Wait for IPC socket to be ready
 * 4. Display initial image
 * 5. Wait specified duration
 * 6. Transition to video playback
 * 7. Wait for user input to terminate
 * 8. Gracefully quit MPV
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

        // 3. Play the video. --keep-open will hold the last frame.
        console.log(`Playing video: ${VIDEO_PATH}`);
        await sendMpvCommand({ command: ['loadfile', VIDEO_PATH, 'replace'] });
        console.log('Ensuring video is playing...');
        await sendMpvCommand({ command: ['set_property', 'pause', false] });

        // 4. Wait for user input to terminate the script.
        console.log('\nPlayback sequence complete. Press ENTER to quit.');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise(resolve => rl.question('', resolve));
        rl.close();

        // 5. Quit mpv gracefully and exit.
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
