#!/usr/bin/env node

/**
 * Paradox Effects (ParadoxFX) - Main Application Entry Point
 * 
 * Multi-modal media and effect controller for interactive installations.
 * Supports screens, lights, and relays via MQTT commands.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const minimist = require('minimist');
const ZoneManager = require('./lib/core/zone-manager');
const ConfigLoader = require('./lib/core/config-loader');
const MqttClient = require('./lib/core/mqtt-client');
const Logger = require('./lib/utils/logger');

class PFxApplication {
    constructor() {
        this.logger = new Logger('PFx');
        this.config = null;
        this.zoneManager = null;
        this.mqttClient = null;
    }

    async start() {
        try {
            // Parse command line for --config/-c or positional argument
            const argv = minimist(process.argv.slice(2));
            const configFile = argv.config || argv.c || argv._[0] || 'pfx.ini';
            const configPath = path.resolve(configFile);
            // Ensure log directory exists and set up file logging
            const logDir = path.resolve('/opt/paradox/logs');
            fs.mkdirSync(logDir, { recursive: true });
            
            // Create timestamped log file for this session
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
            const logFile = path.join(logDir, `pfx-${timestamp}.log`);
            const logStream = fs.createWriteStream(logFile, { flags: 'a' });
            
            // Also create/update the latest log symlink
            const latestLogFile = path.join(logDir, 'pfx-latest.log');
            try {
                if (fs.existsSync(latestLogFile)) {
                    fs.unlinkSync(latestLogFile);
                }
                fs.symlinkSync(path.basename(logFile), latestLogFile);
            } catch (err) {
                // Ignore symlink errors, just use timestamped file
            }
            const origLog = console.log;
            const origError = console.error;
            const origWarn = console.warn;
            console.log = (...args) => {
                origLog(...args);
                logStream.write(args.join(' ') + '\n');
            };
            console.error = (...args) => {
                origError(...args);
                logStream.write(args.join(' ') + '\n');
            };
            console.warn = (...args) => {
                origWarn(...args);
                logStream.write(args.join(' ') + '\n');
            };
            console.log('****************************************');
            this.logger.info('Starting Paradox Effects application...');
            this.logger.info(`Logging to: ${logFile}`);
            console.log('****************************************');
            this.logger.info(`Using configuration: ${configPath}`);
            if (!fs.existsSync(configPath)) {
                this.logger.error(`Configuration file not found: ${configPath}`);
                this.logger.error('Copy pfx.ini.example to pfx.ini and customize your settings.');
                process.exit(1);
            }
            // Load configuration
            this.config = await ConfigLoader.load(configPath);
            this.logger.info(`Loaded configuration for ${Object.keys(this.config.devices).length} devices`);

            // Set up combined audio sinks if configured
            const AudioSetup = require('./lib/utils/audio-setup');
            const audioSetup = new AudioSetup();
            if (await audioSetup.testPulseAudio()) {
                await audioSetup.setupCombinedSinks(this.config.global, Object.values(this.config.devices));
            } else {
                this.logger.warn('PulseAudio not available, skipping combined sink setup');
            }

            // Initialize MQTT client
            this.mqttClient = new MqttClient(this.config.global);
            await this.mqttClient.connect();

            // Initialize zone manager
            this.zoneManager = new ZoneManager(this.config, this.mqttClient);
            await this.zoneManager.initialize();

            // Start cursor-hiding helper (unclutter) for relevant displays
            try {
                await this._startUnclutter();
            } catch (err) {
                this.logger.warn('Failed to start unclutter cursor-hider: ' + err.message);
            }

            // Setup graceful shutdown
            this.setupShutdownHandlers();

            console.log('****************************************');
            this.logger.info('Paradox Effects application started successfully');
            console.log('****************************************');

        } catch (error) {
            this.logger.error('Failed to start application:', error.message);
            this.logger.debug(error.stack);
            process.exit(1);
        }
    }

    async shutdown() {
        console.log('****************************************');
        this.logger.info('PFX shutting down politely, which may take a few seconds.');
        console.log('****************************************');

        // Stop unclutter if we started it
        try {
            await this._stopUnclutter();
        } catch (err) {
            this.logger.warn('Error stopping unclutter: ' + err.message);
        }

        if (this.zoneManager) {
            await this.zoneManager.shutdown();
        }

        if (this.mqttClient) {
            await this.mqttClient.disconnect();
        }

        console.log('****************************************');
        this.logger.info('Application shutdown complete');
        console.log('****************************************');
        process.exit(0);
    }

    setupShutdownHandlers() {
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception:', error);
            this.shutdown();
        });
        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled rejection at:', promise, 'reason:', reason);
            this.logger.error('Application will continue running. Please check for underlying issues.');
            // Do NOT shutdown on unhandled rejections - this prevents MQTT message errors from crashing the app
        });
    }

    /**
     * Start unclutter for each unique DISPLAY used by zones to hide the mouse cursor.
     * We spawn one unclutter process per DISPLAY and keep references for shutdown.
     */
    async _startUnclutter() {
        // Avoid starting twice
        if (this._unclutterProcs) return;
        this._unclutterProcs = new Map();

        // Discover displays from zone configs
        try {
            const displays = new Set();
            for (const deviceName of Object.keys(this.config.devices || {})) {
                const dev = this.config.devices[deviceName];
                const d = dev.display || dev.display_name || process.env.DISPLAY || ':0';
                displays.add(d);
            }

            for (const display of displays) {
                try {
                    // Spawn unclutter with no delay and explicitly set DISPLAY
                    const env = { ...process.env, DISPLAY: display };
                    // Prefer unclutter binary if available, otherwise try 'unclutter-xfixes'
                    const bin = this._whichSync('unclutter') || this._whichSync('unclutter-xfixes');
                    if (!bin) {
                        this.logger.warn('unclutter binary not found on PATH; cursor will not be hidden');
                        break;
                    }
                    const proc = spawn(bin, ['-idle', '0', '-root'], { env, detached: true, stdio: 'ignore' });
                    proc.unref();
                    this._unclutterProcs.set(display, { proc, bin });
                    this.logger.info(`Started ${bin} on DISPLAY=${display} to hide mouse cursor`);
                } catch (err) {
                    this.logger.warn(`Failed to start unclutter on DISPLAY=${display}: ${err.message}`);
                }
            }
        } catch (err) {
            this.logger.warn('Failed to enumerate displays for unclutter: ' + err.message);
        }
    }

    /**
     * Stop any unclutter processes started by this application
     */
    async _stopUnclutter() {
        if (!this._unclutterProcs) return;
        for (const [display, info] of this._unclutterProcs.entries()) {
            try {
                const proc = info.proc;
                if (proc && !proc.killed) {
                    try { process.kill(proc.pid, 'SIGTERM'); } catch (_) {}
                    try { process.kill(proc.pid, 'SIGKILL'); } catch (_) {}
                    this.logger.info(`Stopped ${info.bin} on DISPLAY=${display}`);
                }
            } catch (err) {
                this.logger.warn(`Error stopping unclutter on DISPLAY=${display}: ${err.message}`);
            }
        }
        this._unclutterProcs.clear();
        this._unclutterProcs = null;
    }

    _whichSync(cmd) {
        try {
            const out = require('child_process').execSync(`command -v ${cmd} 2>/dev/null || true`).toString().trim();
            return out || null;
        } catch {
            return null;
        }
    }
}

// Start the application if this file is run directly
if (require.main === module) {
    const app = new PFxApplication();
    app.start();
}

module.exports = PFxApplication;
