/**
 * @fileoverview Audio Device Manager - Multi-Zone Audio Device Discovery and Management
 * @description Handles audio device discovery, alias mapping, and multi-zone configuration
 * for the ParadoxFX system across Pi0, Pi4, Pi5, and general Linux platforms.
 * 
 * Key Features:
 * - Auto-discovery of available audio devices via PulseAudio/PipeWire/ALSA
 * - Simple alias mapping (hdmi, analog, hdmi1, etc.)
 * - Multi-zone support with device combinations
 * - Platform-specific device string handling
 * - No auto-fallback (strict zone targeting)
 * 
 * @author Paradox FX Team
 * @version 1.0.0
 * @since 2025-07-23
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

class AudioDeviceManager {
    constructor() {
        this.discoveredDevices = new Map();
        this.zoneConfigs = new Map();
        this.deviceAliases = new Map();
        this.initialized = false;
    }

    /**
     * Initialize the audio device manager
     * Discovers available devices and sets up zone configurations
     */
    async initialize() {
        if (this.initialized) return;

        logger.info('Initializing Audio Device Manager...');
        
        try {
            await this.discoverDevices();
            this.setupDefaultAliases();
            this.initialized = true;
            logger.info('Audio Device Manager initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Audio Device Manager:', error);
            throw error;
        }
    }

    /**
     * Discover available audio devices using multiple detection methods
     * Priority: PulseAudio/PipeWire -> ALSA -> MPV fallback
     */
    async discoverDevices() {
        logger.info('Discovering available audio devices...');
        
        // Method 1: Try PulseAudio/PipeWire first (most common on modern Pi systems)
        try {
            await this.discoverPulseAudioDevices();
            logger.info(`Discovered ${this.discoveredDevices.size} PulseAudio/PipeWire devices`);
        } catch (error) {
            logger.warn('PulseAudio/PipeWire detection failed:', error.message);
        }

        // Method 2: Try ALSA as fallback
        if (this.discoveredDevices.size === 0) {
            try {
                await this.discoverAlsaDevices();
                logger.info(`Discovered ${this.discoveredDevices.size} ALSA devices`);
            } catch (error) {
                logger.warn('ALSA detection failed:', error.message);
            }
        }

        // Method 3: Try MPV device listing as last resort
        if (this.discoveredDevices.size === 0) {
            try {
                await this.discoverMpvDevices();
                logger.info(`Discovered ${this.discoveredDevices.size} MPV devices`);
            } catch (error) {
                logger.warn('MPV device detection failed:', error.message);
            }
        }

        if (this.discoveredDevices.size === 0) {
            throw new Error('No audio devices discovered using any method');
        }

        this.logDiscoveredDevices();
    }

    /**
     * Discover PulseAudio/PipeWire devices using pactl
     */
    async discoverPulseAudioDevices() {
        try {
            const output = execSync('pactl list sinks', { encoding: 'utf8', timeout: 5000 });
            const sinks = this.parsePulseAudioSinks(output);
            
            for (const sink of sinks) {
                this.discoveredDevices.set(sink.name, {
                    type: 'pulse',
                    name: sink.name,
                    description: sink.description,
                    deviceString: `pulse/${sink.name}`,
                    state: sink.state,
                    isDefault: sink.isDefault
                });
            }
        } catch (error) {
            throw new Error(`PulseAudio discovery failed: ${error.message}`);
        }
    }

    /**
     * Parse PulseAudio sink information from pactl output
     */
    parsePulseAudioSinks(output) {
        const sinks = [];
        const sinkBlocks = output.split(/Sink #\d+/).slice(1);

        for (const block of sinkBlocks) {
            const nameMatch = block.match(/Name:\s*([^\s]+)/);
            const descMatch = block.match(/Description:\s*(.+)/);
            const stateMatch = block.match(/State:\s*(\w+)/);
            const defaultMatch = block.includes('* index:');

            if (nameMatch) {
                sinks.push({
                    name: nameMatch[1],
                    description: descMatch ? descMatch[1].trim() : nameMatch[1],
                    state: stateMatch ? stateMatch[1] : 'UNKNOWN',
                    isDefault: !!defaultMatch
                });
            }
        }

        return sinks;
    }

    /**
     * Discover ALSA devices using aplay
     */
    async discoverAlsaDevices() {
        try {
            const output = execSync('aplay -l', { encoding: 'utf8', timeout: 5000 });
            const devices = this.parseAlsaDevices(output);
            
            for (const device of devices) {
                this.discoveredDevices.set(`alsa_${device.card}_${device.device}`, {
                    type: 'alsa',
                    name: `alsa_${device.card}_${device.device}`,
                    description: device.description,
                    deviceString: `alsa:device=hw:${device.card},${device.device}`,
                    card: device.card,
                    device: device.device
                });
            }
        } catch (error) {
            throw new Error(`ALSA discovery failed: ${error.message}`);
        }
    }

    /**
     * Parse ALSA device information from aplay output
     */
    parseAlsaDevices(output) {
        const devices = [];
        const lines = output.split('\n');

        for (const line of lines) {
            const match = line.match(/card (\d+):.+device (\d+):\s*(.+)/);
            if (match) {
                devices.push({
                    card: match[1],
                    device: match[2],
                    description: match[3].trim()
                });
            }
        }

        return devices;
    }

    /**
     * Discover MPV-supported devices as fallback
     */
    async discoverMpvDevices() {
        return new Promise((resolve, reject) => {
            const mpv = spawn('mpv', ['--audio-device=help'], { 
                stdio: ['ignore', 'pipe', 'pipe'] 
            });

            let output = '';
            mpv.stdout.on('data', (data) => {
                output += data.toString();
            });

            mpv.on('close', (code) => {
                try {
                    const devices = this.parseMpvDevices(output);
                    
                    for (const device of devices) {
                        this.discoveredDevices.set(device.name, {
                            type: 'mpv',
                            name: device.name,
                            description: device.description,
                            deviceString: device.name
                        });
                    }
                    
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });

            mpv.on('error', (error) => {
                reject(new Error(`MPV device discovery failed: ${error.message}`));
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                mpv.kill();
                reject(new Error('MPV device discovery timed out'));
            }, 5000);
        });
    }

    /**
     * Parse MPV device list output  
     */
    parseMpvDevices(output) {
        const devices = [];
        const lines = output.split('\n');

        for (const line of lines) {
            const match = line.match(/^\s*'([^']+)'\s*\(([^)]+)\)/);
            if (match) {
                devices.push({
                    name: match[1],
                    description: match[2]
                });
            }
        }

        return devices;
    }

    /**
     * Set up default device aliases based on discovered devices
     */
    setupDefaultAliases() {
        logger.info('Setting up default device aliases...');

        // Clear existing aliases
        this.deviceAliases.clear();

        // Priority mapping for common device types
        const hdmiDevices = [];
        const analogDevices = [];
        const otherDevices = [];

        for (const [name, device] of this.discoveredDevices) {
            const desc = device.description.toLowerCase();
            const deviceName = name.toLowerCase();

            if (desc.includes('hdmi') || deviceName.includes('hdmi')) {
                hdmiDevices.push({ name, device });
            } else if (desc.includes('analog') || desc.includes('headphones') || 
                      desc.includes('stereo-fallback') || deviceName.includes('mailbox')) {
                analogDevices.push({ name, device });
            } else {
                otherDevices.push({ name, device });
            }
        }

        // Set up HDMI aliases
        if (hdmiDevices.length > 0) {
            this.deviceAliases.set('hdmi', hdmiDevices[0].device.deviceString);
            this.deviceAliases.set('hdmi0', hdmiDevices[0].device.deviceString);
            
            if (hdmiDevices.length > 1) {
                this.deviceAliases.set('hdmi1', hdmiDevices[1].device.deviceString);
            }
            if (hdmiDevices.length > 2) {
                this.deviceAliases.set('hdmi2', hdmiDevices[2].device.deviceString);
            }
        }

        // Set up analog alias
        if (analogDevices.length > 0) {
            this.deviceAliases.set('analog', analogDevices[0].device.deviceString);
            this.deviceAliases.set('headphones', analogDevices[0].device.deviceString);
        }

        // Set up default alias (prefer HDMI, fallback to analog)
        if (hdmiDevices.length > 0) {
            this.deviceAliases.set('default', hdmiDevices[0].device.deviceString);
        } else if (analogDevices.length > 0) {
            this.deviceAliases.set('default', analogDevices[0].device.deviceString);
        } else if (otherDevices.length > 0) {
            this.deviceAliases.set('default', otherDevices[0].device.deviceString);
        }

        logger.info(`Set up ${this.deviceAliases.size} device aliases`);
    }

    /**
     * Configure audio zones from configuration
     * @param {Object} zoneConfig - Zone configuration object
     */
    configureZones(zoneConfig) {
        logger.info('Configuring audio zones...');
        
        this.zoneConfigs.clear();

        for (const [zoneName, config] of Object.entries(zoneConfig)) {
            try {
                const deviceString = this.resolveZoneDevices(config.devices);
                
                this.zoneConfigs.set(zoneName, {
                    devices: config.devices,
                    deviceString: deviceString,
                    backgroundMusic: config.backgroundMusic || false,
                    speech: config.speech || false,
                    soundEffects: config.soundEffects || false,
                    volume: config.volume || 80
                });

                logger.info(`Configured zone '${zoneName}' with devices: ${config.devices}`);
            } catch (error) {
                logger.error(`Failed to configure zone '${zoneName}':`, error.message);
            }
        }
    }

    /**
     * Resolve zone device configuration to actual device strings
     * @param {string|Array} devices - Device specification (alias, array of aliases, or actual device string)
     * @returns {string} - Comma-separated device string for MPV
     */
    resolveZoneDevices(devices) {
        if (!devices) {
            throw new Error('No devices specified for zone');
        }

        let deviceList = Array.isArray(devices) ? devices : [devices];
        let resolvedDevices = [];

        for (const device of deviceList) {
            const resolved = this.resolveDeviceAlias(device);
            if (resolved) {
                resolvedDevices.push(resolved);
            } else {
                throw new Error(`Cannot resolve device: ${device}`);
            }
        }

        return resolvedDevices.join(',');
    }

    /**
     * Resolve a device alias to actual device string
     * @param {string} alias - Device alias or actual device string
     * @returns {string|null} - Resolved device string or null if not found
     */
    resolveDeviceAlias(alias) {
        // First check if it's a known alias
        if (this.deviceAliases.has(alias)) {
            return this.deviceAliases.get(alias);
        }

        // Check if it's already a valid device string
        if (alias.startsWith('pulse/') || alias.startsWith('alsa:') || this.discoveredDevices.has(alias)) {
            return alias;
        }

        // Check if it matches any discovered device name
        for (const [name, device] of this.discoveredDevices) {
            if (name === alias || device.description.toLowerCase().includes(alias.toLowerCase())) {
                return device.deviceString;
            }
        }

        return null;
    }

    /**
     * Get device string for a specific zone
     * @param {string} zoneName - Zone name
     * @returns {string|null} - Device string for the zone
     */
    getZoneDeviceString(zoneName) {
        const zone = this.zoneConfigs.get(zoneName);
        return zone ? zone.deviceString : null;
    }

    /**
     * Get all configured zones for a specific audio type
     * @param {string} audioType - Audio type: 'backgroundMusic', 'speech', 'soundEffects'
     * @returns {Array} - Array of zone names that support this audio type
     */
    getZonesForAudioType(audioType) {
        const zones = [];
        
        for (const [zoneName, config] of this.zoneConfigs) {
            if (config[audioType]) {
                zones.push(zoneName);
            }
        }

        return zones;
    }

    /**
     * Get all available device aliases
     * @returns {Object} - Object mapping aliases to device strings
     */
    getAvailableAliases() {
        return Object.fromEntries(this.deviceAliases);
    }

    /**
     * Get all discovered devices
     * @returns {Object} - Object mapping device names to device info
     */
    getDiscoveredDevices() {
        return Object.fromEntries(this.discoveredDevices);
    }

    /**
     * Log discovered devices for debugging
     */
    logDiscoveredDevices() {
        logger.info('Discovered Audio Devices:');
        for (const [name, device] of this.discoveredDevices) {
            logger.info(`  ${name}: ${device.description} (${device.deviceString})`);
        }

        logger.info('Device Aliases:');
        for (const [alias, deviceString] of this.deviceAliases) {
            logger.info(`  ${alias} -> ${deviceString}`);
        }
    }

    /**
     * Generate audio setup script for current platform
     * @returns {string} - Shell script content for device discovery
     */
    generateSetupScript() {
        const script = `#!/bin/bash
# Auto-generated audio device discovery script for ParadoxFX
# Generated on: ${new Date().toISOString()}

echo "=== ParadoxFX Audio Device Discovery ==="

echo "Detecting PulseAudio/PipeWire devices..."
if command -v pactl &> /dev/null; then
    echo "Available PulseAudio sinks:"
    pactl list sinks | grep -E "(Name:|Description:|State:)" | sed 's/^/  /'
else
    echo "PulseAudio not available"
fi

echo ""
echo "Detecting ALSA devices..."
if command -v aplay &> /dev/null; then
    echo "Available ALSA devices:"
    aplay -l | sed 's/^/  /'
else
    echo "ALSA not available"
fi

echo ""
echo "Detected device aliases:"
${Array.from(this.deviceAliases.entries()).map(([alias, device]) => 
    `echo "  ${alias} -> ${device}"`
).join('\n')}

echo ""
echo "Recommended .ini configuration:"
echo "[audio]"
${Array.from(this.deviceAliases.entries()).map(([alias, device]) => 
    `echo "${alias}_device = ${device}"`
).join('\n')}
`;

        return script;
    }
}

module.exports = AudioDeviceManager;
