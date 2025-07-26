#!/usr/bin/env node
/**
 * Test script using ParadoxFX's exact MPV arguments to isolate IPC timeout issue
 * 
 * This test will determine if ParadoxFX's complex MPV profile arguments
 * are causing the IPC communication timeout that prevents media loading.
 */

const net = require('net');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

// Test media files
const IMAGE_PATH = path.resolve(__dirname, '../../media/test/defaults/default.png');
const VIDEO_PATH = path.resolve(__dirname, '../../media/test/defaults/default.mp4');

// Socket path with timestamp like ParadoxFX
const SOCKET_PATH = `/tmp/mpv-test-paradoxfx-args-${Date.now()}.sock`;

// Clean up function
function cleanup() {
    try {
        fs.unlinkSync(SOCKET_PATH);
    } catch (e) {
        // Ignore
    }
}
cleanup();

// EXACT ParadoxFX MPV arguments from ps aux output
const paradoxfxArgs = [
    '--input-ipc-server=' + SOCKET_PATH,
    '--hwdec=auto',
    '--vo=gpu',
    '--cache=yes',
    '--demuxer-max-bytes=50M',
    '--no-terminal',
    '--no-osc',
    '--no-input-default-bindings',
    '--vo=gpu',  // Duplicate like in ParadoxFX
    '--gpu-context=drm',
    '--audio-device=pulse/alsa_output.platform-107c706400.hdmi.hdmi-stereo',
    '--volume=70',
    '--fs-screen=1',
    '--fullscreen',
    '--no-border',
    '--ontop',
    '--no-terminal',  // Duplicate like in ParadoxFX
    '--no-osd-bar',
    '--idle=yes',
    '--keep-open=yes'
];

console.log('Testing ParadoxFX MPV arguments for IPC compatibility...');
console.log('Args:', paradoxfxArgs.join(' '));

// Command counter for request IDs
let commandId = 1;

/**
 * Send IPC command with ParadoxFX-style request ID handling
 */
function sendMpvCommand(cmdObj) {
    return new Promise((resolve, reject) => {
        const requestId = commandId++;
        const commandWithId = {
            ...cmdObj,
            request_id: requestId
        };

        console.log(`Sending command with request_id ${requestId}:`, commandWithId);

        const client = net.createConnection(SOCKET_PATH, () => {
            const cmdString = JSON.stringify(commandWithId) + '\n';
            client.write(cmdString);
        });

        let buffer = '';
        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error(`Command timed out after 5s: ${JSON.stringify(commandWithId)}`));
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
                    console.log(`Received response:`, responseJson);
                    
                    // Use request_id matching like ParadoxFX
                    if (responseJson.request_id && responseJson.request_id === requestId) {
                        console.log(`✅ Found matching response for request_id ${requestId}`);
                        clearTimeout(timeout);
                        client.end();
                        
                        if (responseJson.error !== 'success') {
                            reject(new Error(`MPV command failed: ${responseJson.error}`));
                        } else {
                            resolve(responseJson);
                        }
                        return;
                    }
                } catch (e) {
                    // Ignore parsing errors for events
                }
            }
        });

        client.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        client.on('close', () => {
            clearTimeout(timeout);
        });
    });
}

(async () => {
    try {
        console.log('Terminating any old test MPV instances...');
        try {
            execSync(`pkill -f "mpv.*${SOCKET_PATH}"`);
        } catch (e) {
            console.log('No old instances found.');
        }

        console.log('Launching MPV with ParadoxFX arguments...');
        const mpvProcess = spawn('mpv', paradoxfxArgs, { detached: false });

        mpvProcess.on('error', (err) => {
            console.error('Failed to start MPV:', err);
            process.exit(1);
        });

        mpvProcess.stderr.on('data', (data) => {
            console.error(`MPV stderr: ${data}`);
        });

        // Wait for socket
        console.log('Waiting for IPC socket...');
        let retries = 20;
        while (retries > 0) {
            if (fs.existsSync(SOCKET_PATH)) {
                console.log('Socket ready.');
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 250));
            retries--;
        }

        if (!fs.existsSync(SOCKET_PATH)) {
            console.error('Socket not created in time');
            mpvProcess.kill();
            process.exit(1);
        }

        // Test basic IPC
        console.log('\n=== Testing IPC Connection ===');
        const versionResponse = await sendMpvCommand({ command: ['get_property', 'mpv-version'] });
        console.log('✅ IPC connection works');

        // Test media loading (the critical test)
        console.log('\n=== Testing Media Loading ===');
        console.log('Loading image...');
        await sendMpvCommand({ command: ['loadfile', IMAGE_PATH, 'replace'] });
        console.log('✅ Image loaded successfully');

        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('Loading video...');
        await sendMpvCommand({ command: ['loadfile', VIDEO_PATH, 'replace'] });
        console.log('✅ Video loaded successfully');

        console.log('\n🎉 SUCCESS: ParadoxFX arguments work fine with IPC!');
        console.log('The issue is NOT in the MPV arguments.');

        // Cleanup
        await sendMpvCommand({ command: ['quit'] });
        mpvProcess.kill();
        cleanup();

    } catch (error) {
        console.error('\n❌ FAILURE:', error.message);
        console.log('This suggests ParadoxFX arguments might be causing IPC issues.');
        cleanup();
        process.exit(1);
    }
})();
