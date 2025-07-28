const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const readline = require('readline');

const SPEECH_SOCKET = '/tmp/pfx-speech-test.sock';
const TEST_AUDIO_FILE = '/opt/paradox/media/test/general/Welcome_ParadoxFX.mp3';

// Helper to print timestamped logs
const log = (message) => {
    console.log(`[${new Date().toISOString()}] ${message}`);
};

/**
 * Cleans up the socket file if it exists.
 */
function cleanupSocket() {
    if (fs.existsSync(SPEECH_SOCKET)) {
        log(`Cleaning up old socket file: ${SPEECH_SOCKET}`);
        fs.unlinkSync(SPEECH_SOCKET);
    }
}

/**
 * Spawns a persistent MPV instance for speech.
 * @returns {ChildProcess} The spawned MPV process.
 */
function initializeMpv() {
    log('Initializing MPV instance for speech...');
    const args = [
        '--idle=yes',
        `--input-ipc-server=${SPEECH_SOCKET}`,
        '--no-terminal',
        '--no-video',
        '--volume=90',
        '--keep-open=yes',
        '--cache=yes',
        '--msg-level=all=v' // Use verbose logging for debugging
    ];

    const mpvProcess = spawn('mpv', args, { detached: false });

    mpvProcess.on('error', (error) => log(`MPV process error: ${error.message}`));
    mpvProcess.on('exit', (code, signal) => log(`MPV process exited with code ${code}, signal ${signal}`));
    
    log('MPV process spawned.');
    return mpvProcess;
}

/**
 * Waits for the MPV socket file to be created.
 */
async function waitForSocket() {
    log('Waiting for MPV socket to become available...');
    while (!fs.existsSync(SPEECH_SOCKET)) {
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    log(`Socket is available at: ${SPEECH_SOCKET}`);
}

/**
 * Sends a command to the MPV IPC socket.
 * @param {object} cmdObj - The command to send.
 */
function sendMpvCommand(cmdObj) {
    return new Promise((resolve, reject) => {
        const client = net.createConnection(SPEECH_SOCKET, () => {
            const cmdString = JSON.stringify(cmdObj) + '\n';
            client.write(cmdString);
            log(`Sent command to MPV: ${cmdString.trim()}`);
        });

        client.on('data', (data) => {
            // We don't need to handle responses for this test, just errors.
        });
        client.on('error', reject);
        client.on('end', resolve);
    });
}

/**
 * Monitors the MPV socket for the 'eof-reached' property change.
 */
function monitorForEndOfFile() {
    return new Promise((resolve, reject) => {
        log(`Watching socket for 'eof-reached' event...`);
        const client = net.createConnection(SPEECH_SOCKET);

        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error("Timeout: Did not receive 'eof-reached' event after 30 seconds."));
        }, 30000);

        client.on('connect', () => {
            // Subscribe to the 'eof-reached' property
            const observeCmd = JSON.stringify({ command: ['observe_property', 1, 'eof-reached'] }) + '\n';
            client.write(observeCmd);
        });

        let buffer = '';
        client.on('data', (chunk) => {
            buffer += chunk.toString();
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex);
                buffer = buffer.substring(newlineIndex + 1);

                if (line.trim() === '') continue;

                try {
                    const response = JSON.parse(line);
                    // Log all property changes for debugging
                    if (response.event === 'property-change') {
                        log(`Received property change: ${response.name} = ${response.data}`);
                    }
                    
                    if (response.event === 'property-change' && response.name === 'eof-reached' && response.data === true) {
                        log("SUCCESS: Received 'eof-reached' event from MPV.");
                        clearTimeout(timeout);
                        client.end();
                        resolve();
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        });

        client.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/**
 * Main test function.
 */
async function runTest() {
    cleanupSocket();
    const mpvProcess = initializeMpv();

    const cleanup = () => {
        log('Shutting down MPV process...');
        if (mpvProcess && !mpvProcess.killed) {
            mpvProcess.kill('SIGTERM');
        }
        cleanupSocket();
        log('Cleanup complete.');
    };

    // Ensure cleanup happens on exit signals
    process.on('SIGINT', () => {
        log('Caught interrupt signal (Ctrl+C). Exiting...');
        cleanup();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        log('Caught terminate signal. Exiting...');
        cleanup();
        process.exit(0);
    });
    
    try {
        await waitForSocket();

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise(resolve => rl.question('Press ENTER to play the test audio file...', resolve));
        rl.close();

        log(`Playing audio file: ${TEST_AUDIO_FILE}`);
        const playCommand = { command: ['loadfile', TEST_AUDIO_FILE, 'replace'] };
        
        // Start monitoring BEFORE sending the command
        const monitorPromise = monitorForEndOfFile();
        
        // Send the command to play the file
        await sendMpvCommand(playCommand);

        // Wait for the monitoring to complete
        await monitorPromise;

        log('Test finished successfully.');

    } catch (error) {
        console.error(`\nTEST FAILED: ${error.message}`);
        process.exitCode = 1; // Set exit code to 1 on failure
    } finally {
        cleanup();
    }
}

runTest();
