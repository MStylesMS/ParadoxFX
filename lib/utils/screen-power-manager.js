/**
 * Screen Power Manager
 * 
 * Manages display power states using X11 DPMS (Display Power Management Signaling)
 * Provides intelligent wake/sleep control for ParadoxFX applications
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const Logger = require('../utils/logger');

const execAsync = promisify(exec);

class ScreenPowerManager {
    constructor(display = ':0') {
        this.display = display;
        this.logger = new Logger('ScreenPowerManager');
        this.isAsleep = false;
    }

    /**
     * Put all connected displays to sleep using DPMS
     */
    async sleepScreens() {
        try {
            this.logger.info('Putting all displays to sleep via DPMS');
            
            // Send DPMS standby command to turn off displays
            await execAsync(`DISPLAY=${this.display} xset dpms force standby`);
            
            this.isAsleep = true;
            this.logger.info('✅ All displays are now asleep');
            
        } catch (error) {
            this.logger.error('Failed to put displays to sleep:', error.message);
            throw new Error(`Screen sleep failed: ${error.message}`);
        }
    }

    /**
     * Wake all connected displays from sleep using DPMS
     */
    async wakeScreens() {
        try {
            this.logger.info('Waking all displays from sleep via DPMS');
            
            // Send DPMS on command to wake displays
            await execAsync(`DISPLAY=${this.display} xset dpms force on`);
            
            // Also send a mouse movement to ensure wake
            await execAsync(`DISPLAY=${this.display} xdotool mousemove_relative 1 0`).catch(() => {
                // xdotool might not be available, but that's OK
                this.logger.debug('xdotool not available for mouse wake assist');
            });
            
            this.isAsleep = false;
            this.logger.info('✅ All displays are now awake');
            
        } catch (error) {
            this.logger.error('Failed to wake displays:', error.message);
            throw new Error(`Screen wake failed: ${error.message}`);
        }
    }

    /**
     * Get current sleep state
     */
    getState() {
        return {
            isAsleep: this.isAsleep,
            display: this.display
        };
    }

    /**
     * Check if DPMS is available and functional
     */
    async checkDpmsSupport() {
        try {
            const { stdout } = await execAsync(`DISPLAY=${this.display} xset q`);
            
            if (stdout.includes('DPMS is Enabled') || stdout.includes('DPMS is Disabled')) {
                this.logger.info('✅ DPMS support detected');
                return true;
            } else {
                this.logger.warn('⚠️  DPMS support not detected');
                return false;
            }
            
        } catch (error) {
            this.logger.error('Failed to check DPMS support:', error.message);
            return false;
        }
    }

    /**
     * Ensure screen blanking is disabled for ParadoxFX operation
     * This should be called during initialization
     */
    async disableScreenBlanking() {
        try {
            this.logger.info('Disabling screen blanking for continuous operation');
            
            const commands = [
                `DISPLAY=${this.display} xset s off`,          // Disable screensaver
                `DISPLAY=${this.display} xset -dpms`,          // Disable DPMS auto-sleep
                `DISPLAY=${this.display} xset s noblank`,      // Prevent blanking
                `DISPLAY=${this.display} xset dpms 0 0 0`      // Set DPMS timeouts to 0
            ];

            for (const command of commands) {
                await execAsync(command);
            }
            
            this.logger.info('✅ Screen blanking disabled - displays will stay active');
            
        } catch (error) {
            this.logger.error('Failed to disable screen blanking:', error.message);
            throw new Error(`Screen blanking disable failed: ${error.message}`);
        }
    }

    /**
     * Get current display information
     */
    async getDisplayInfo() {
        try {
            const { stdout } = await execAsync(`DISPLAY=${this.display} xrandr --current`);
            
            const displays = [];
            const lines = stdout.split('\n');
            
            for (const line of lines) {
                if (line.includes(' connected')) {
                    const match = line.match(/^([A-Z0-9-]+)\s+connected\s+(?:primary\s+)?(\d+x\d+\+\d+\+\d+|\d+x\d+)/);
                    if (match) {
                        displays.push({
                            name: match[1],
                            resolution: match[2] || 'unknown',
                            connected: true
                        });
                    }
                }
            }
            
            return displays;
            
        } catch (error) {
            this.logger.error('Failed to get display info:', error.message);
            return [];
        }
    }

    /**
     * Auto-wake displays if needed for media commands
     * Should be called before any media playback
     */
    async autoWakeForMedia(mediaType = 'unknown') {
        if (this.isAsleep) {
            this.logger.info(`Auto-waking displays for ${mediaType} playback`);
            await this.wakeScreens();
        }
    }

    /**
     * Determine if audio device should trigger auto-wake
     * HDMI audio should wake displays, analog audio should not
     */
    shouldWakeForAudio(audioDevice) {
        if (!audioDevice) return false;
        
        // HDMI audio devices should wake displays
        const hdmiPatterns = [
            /hdmi/i,
            /vc4hdmi/i,
            /CARD=/i
        ];
        
        return hdmiPatterns.some(pattern => pattern.test(audioDevice));
    }
}

module.exports = ScreenPowerManager;
