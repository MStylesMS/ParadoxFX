/**
 * Quick timing test to measure IPC vs Direct MPV spawning
 */
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const SOUND_EFFECT = path.resolve(__dirname, '../fixtures/test-media/default_fx.wav');
const TEST_SOCKET = '/tmp/mpv-timing-test.sock';

// Clean up socket
try {
    require('fs').unlinkSync(TEST_SOCKET);
} catch (e) { }

function sendMpvCommand(socketPath, cmdObj) {
    return new Promise((resolve, reject) => {
        const client = net.createConnection(socketPath, () => {
            const cmdString = JSON.stringify(cmdObj) + '\n';
            client.write(cmdString);
        });

        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error('Command timed out'));
        }, 5000);

        client.on('data', (chunk) => {
            clearTimeout(timeout);
            client.end();
            resolve();
        });

        client.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

async function waitForSocket(socketPath, maxRetries = 20) {
    for (let i = 0; i < maxRetries; i++) {
        if (require('fs').existsSync(socketPath)) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
}

async function testIpcTiming() {
    console.log('=== Testing IPC Audio Timing ===');

    // Start MPV with IPC
    const mpvProcess = spawn('mpv', [
        '--idle=yes',
        `--input-ipc-server=${TEST_SOCKET}`,
        '--no-terminal',
        '--no-video',
        '--volume=100'
    ], { detached: false });

    // Wait for socket
    await waitForSocket(TEST_SOCKET);

    // Pre-load file
    await sendMpvCommand(TEST_SOCKET, {
        command: ['loadfile', SOUND_EFFECT, 'replace']
    });
    await sendMpvCommand(TEST_SOCKET, {
        command: ['set_property', 'pause', true]
    });

    // Measure IPC command time
    const startTime = Date.now();
    await sendMpvCommand(TEST_SOCKET, {
        command: ['set_property', 'pause', false]
    });
    const ipcTime = Date.now() - startTime;

    console.log(`IPC Command Time: ${ipcTime}ms`);

    // Clean up
    await sendMpvCommand(TEST_SOCKET, { command: ['quit'] });
    mpvProcess.kill();

    return ipcTime;
}

async function testDirectSpawnTiming() {
    console.log('=== Testing Direct Spawn Audio Timing ===');

    const startTime = Date.now();
    const mpvProcess = spawn('mpv', [
        '--no-terminal',
        '--no-video',
        '--volume=100',
        SOUND_EFFECT
    ], { detached: false });
    const spawnTime = Date.now() - startTime;

    console.log(`Direct Spawn Time: ${spawnTime}ms`);

    // Let it finish
    await new Promise(resolve => setTimeout(resolve, 2000));

    return spawnTime;
}

(async () => {
    console.log('🕐 Audio Timing Comparison Test');
    console.log('===============================');

    const ipcTime = await testIpcTiming();
    await new Promise(resolve => setTimeout(resolve, 1000));
    const spawnTime = await testDirectSpawnTiming();

    console.log('\n📊 Results:');
    console.log(`IPC (pre-loaded): ${ipcTime}ms`);
    console.log(`Direct Spawn: ${spawnTime}ms`);
    console.log(`Difference: ${Math.abs(ipcTime - spawnTime)}ms`);

    if (ipcTime < spawnTime) {
        console.log('✅ IPC is faster for pre-loaded audio');
    } else {
        console.log('✅ Direct spawn is faster for one-time audio');
    }
})();
