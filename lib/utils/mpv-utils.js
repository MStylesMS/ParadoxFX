/**
 * @fileoverview MPV Utilities - Shared MPV IPC and socket management functions
 * @description Reusable utilities for MPV IPC communication, socket management,
 * and property monitoring. These functions are used across audio and video systems.
 * 
 * @author Paradox FX Team
 * @version 1.0.0
 * @since 2025-07-23
 */

const net = require('net');
const fs = require('fs');
const { logger } = require('./logger');

/**
 * Send IPC command to specific MPV instance
 * 
 * This function can be shared between audio and video systems.
 * It handles the low-level IPC communication with any MPV instance.
 * 
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
                    // This handles command responses, not events
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
 * Wait for MPV socket to be ready
 * 
 * This function is reusable for both audio and video socket management.
 * It ensures MPV instances are ready before sending commands.
 * 
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
 * Monitor MPV property changes
 * 
 * This function monitors a property for changes and calls a callback
 * when the property matches a specific value.
 * 
 * @param {string} socketPath - MPV socket path
 * @param {string} property - Property to monitor
 * @param {*} targetValue - Value to watch for
 * @param {Function} callback - Callback to call when value matches
 * @returns {Promise<void>} Promise that resolves when monitoring is complete
 */
function monitorProperty(socketPath, property, targetValue, callback) {
    return new Promise((resolve, reject) => {
        const client = net.createConnection(socketPath, () => {
            // Start observing the property
            const observeCmd = JSON.stringify({ command: ['observe_property', 1, property] }) + '\n';
            client.write(observeCmd);
        });

        let buffer = '';
        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error(`Property monitoring timed out for ${property}`));
        }, 30000); // 30 second timeout

        client.on('data', (chunk) => {
            buffer += chunk.toString();

            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex);
                buffer = buffer.substring(newlineIndex + 1);

                if (line.trim() === '') continue;

                try {
                    const responseJson = JSON.parse(line);

                    // Check if this is a property change event
                    if (responseJson.event === 'property-change' &&
                        responseJson.name === property &&
                        responseJson.data === targetValue) {

                        clearTimeout(timeout);
                        client.end();
                        callback();
                        resolve();
                        return;
                    }
                } catch (e) {
                    // Ignore parsing errors
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

/**
 * Measure audio/video latency by timing command execution
 * 
 * This function can be used in production to monitor performance
 * and ensure media playback meets latency requirements.
 * 
 * @param {string} socketPath - MPV socket path
 * @param {Object} command - MPV command to execute
 * @returns {Promise<number>} Latency in milliseconds
 */
async function measureLatency(socketPath, command) {
    const startTime = Date.now();
    try {
        await sendMpvCommand(socketPath, command);
        const endTime = Date.now();
        return endTime - startTime;
    } catch (error) {
        logger.error('Error measuring latency:', error);
        return -1;
    }
}

/**
 * Create MPV arguments for different media purposes
 * 
 * This function will be used in the main ParadoxFX system to configure
 * media instances with appropriate settings for their purpose.
 * 
 * @param {string} socketPath - IPC socket path
 * @param {string} purpose - Media purpose: 'background', 'effects', 'speech', 'video'
 * @param {string} audioDevice - Audio device string (optional)
 * @param {string} display - Display string for video (optional)
 * @returns {string[]} MPV command line arguments
 */
function createMpvArgs(socketPath, purpose, audioDevice = null, display = null) {
    // Base arguments shared across all media instances
    const baseArgs = [
        '--idle=yes',
        `--input-ipc-server=${socketPath}`,
        '--no-terminal',
        '--msg-level=all=info'
    ];

    // Add audio device if specified
    if (audioDevice) {
        baseArgs.push(`--audio-device=${audioDevice}`);
    }

    // Add display if specified (for video)
    if (display) {
        baseArgs.push(`--display=${display}`);
    }

    switch (purpose) {
        case 'background':
            // Background music configuration
            return [
                ...baseArgs,
                '--no-video',            // Audio-only mode
                '--volume=70',           // Lower default volume for background
                '--loop-file=inf',       // Loop background music
                '--cache=yes'
            ];

        case 'effects':
            // Low-latency sound effects configuration
            return [
                ...baseArgs,
                '--no-video',            // Audio-only mode
                '--volume=100',          // Full volume for effects
                '--keep-open=yes',       // Keep ready for instant playback
                '--audio-buffer=0.05',   // Minimal buffer for low latency
                '--cache=no'             // Disable cache to reduce latency
            ];

        case 'speech':
            // Speech/narration configuration
            return [
                ...baseArgs,
                '--no-video',            // Audio-only mode
                '--volume=90',           // High volume for speech
                '--keep-open=yes',
                '--cache=yes'
            ];

        case 'video':
            // Video playback configuration
            return [
                ...baseArgs,
                '--volume=80',           // Moderate volume for video
                '--cache=yes',
                '--hwdec=auto',          // Hardware decoding when available
                '--vo=gpu'               // GPU video output
            ];

        case 'sound-effect-spawn':
            // Fire-and-forget sound effect (no socket needed)
            return [
                '--no-terminal',
                '--no-video',
                '--volume=100',
                '--audio-buffer=0.02',   // Minimize audio buffer for low latency
                '--cache=no',            // Disable cache for immediate playback
                ...(audioDevice ? [`--audio-device=${audioDevice}`] : [])
            ];

        default:
            return baseArgs;
    }
}

/**
 * Test MPV IPC connection
 * 
 * @param {string} socketPath - Path to MPV socket
 * @returns {Promise<boolean>} True if connection is working
 */
async function testMpvConnection(socketPath) {
    try {
        const response = await sendMpvCommand(socketPath, { 
            command: ['get_property', 'mpv-version'] 
        });
        return response.error === 'success' || response.data;
    } catch (error) {
        return false;
    }
}

/**
 * Get MPV property value
 * 
 * @param {string} socketPath - Path to MPV socket
 * @param {string} property - Property name to get
 * @returns {Promise<*>} Property value
 */
async function getMpvProperty(socketPath, property) {
    const response = await sendMpvCommand(socketPath, {
        command: ['get_property', property]
    });
    
    if (response.error === 'success') {
        return response.data;
    } else {
        throw new Error(`Failed to get property ${property}: ${response.error}`);
    }
}

/**
 * Set MPV property value
 * 
 * @param {string} socketPath - Path to MPV socket
 * @param {string} property - Property name to set
 * @param {*} value - Property value to set
 * @returns {Promise<void>}
 */
async function setMpvProperty(socketPath, property, value) {
    const response = await sendMpvCommand(socketPath, {
        command: ['set_property', property, value]
    });
    
    if (response.error !== 'success') {
        throw new Error(`Failed to set property ${property}: ${response.error}`);
    }
}

/**
 * Load file in MPV instance
 * 
 * @param {string} socketPath - Path to MPV socket
 * @param {string} filePath - Path to media file
 * @param {string} mode - Load mode: 'replace', 'append', 'append-play'
 * @returns {Promise<void>}
 */
async function loadMpvFile(socketPath, filePath, mode = 'replace') {
    const response = await sendMpvCommand(socketPath, {
        command: ['loadfile', filePath, mode]
    });
    
    if (response.error !== 'success') {
        throw new Error(`Failed to load file ${filePath}: ${response.error}`);
    }
}

module.exports = {
    sendMpvCommand,
    waitForSocket,
    monitorProperty,
    measureLatency,
    createMpvArgs,
    testMpvConnection,
    getMpvProperty,
    setMpvProperty,
    loadMpvFile
};
