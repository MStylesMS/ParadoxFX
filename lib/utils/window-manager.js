/**
 * Window Manager Utility
 * 
 * Provides window management functionality for ParadoxFX zones.
 * Extracted from proven Option 6 proof-of-concept implementation.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const Logger = require('./logger');

class WindowManager {
    constructor(display = ':0') {
        this.display = display;
        this.logger = new Logger('WindowManager');
        this.env = { ...process.env, DISPLAY: display };
    }

    /**
     * Wait for window to appear by class name
     */
    async waitForWindowByClass(className, timeoutMs = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const out = execSync(`xdotool search --class ${className} | tail -n1`, { 
                    env: this.env 
                }).toString().trim();
                if (out) return out.split('\n').slice(-1)[0].trim();
            } catch (_) {}
            await this._sleep(200);
        }
        return null;
    }

    /**
     * Find Chromium window ID with fallback detection
     */
    findChromiumWindowId(customClass = 'ParadoxBrowser') {
        // Try custom class first
        try {
            const out = execSync(`xdotool search --class ${customClass} | tail -n1`, { 
                env: this.env 
            }).toString().trim();
            if (out) return out.split('\n').slice(-1)[0].trim();
        } catch {}
        
        // Fallback to common chromium classes
        for (const cls of ['chromium-browser', 'chromium', 'Chromium']) {
            try {
                const out = execSync(`xdotool search --class ${cls} | tail -n1`, { 
                    env: this.env 
                }).toString().trim();
                if (out) return out.split('\n').slice(-1)[0].trim();
            } catch {}
        }
        
        // Last resort: parse wmctrl -lx
        try {
            const out = execSync('wmctrl -lx', { env: this.env }).toString();
            const line = out.split('\n').filter(l => /chrom/i.test(l)).slice(-1)[0];
            if (line) {
                const m = line.match(/^(0x[0-9a-fA-F]+)/);
                if (m) return m[1];
            }
        } catch {}
        
        return null;
    }

    /**
     * Find window by exact name match
     */
    getWindowIdByNameExact(name) {
        try {
            const out = execSync(`xdotool search --name '^${name}$' | head -n1`, { 
                env: this.env 
            }).toString().trim();
            return out || null;
        } catch { 
            return null; 
        }
    }

    /**
     * Activate window using Option 6 technique (focus + raise)
     */
    activateWindow(winId) {
        try {
            execSync(`xdotool windowactivate ${winId}`, { env: this.env });
            return true;
        } catch (e) {
            this.logger.warn(`xdotool windowactivate failed: ${e.message}`);
            try {
                execSync(`wmctrl -i -a ${winId}`, { env: this.env });
                return true;
            } catch (e2) {
                this.logger.error(`wmctrl activate failed: ${e2.message}`);
                return false;
            }
        }
    }

    /**
     * Move window to specific position
     */
    moveWindow(winId, x, y) {
        try {
            execSync(`xdotool windowmove ${winId} ${x} ${y}`, { env: this.env });
        } catch (e) {
            this.logger.warn(`windowmove failed: ${e.message}`);
        }
    }

    /**
     * Make window fullscreen
     */
    fullscreenWindow(winId) {
        try {
            execSync(`wmctrl -i -r ${winId} -b add,fullscreen`, { env: this.env });
        } catch (e) {
            this.logger.warn(`wmctrl fullscreen failed: ${e.message}`);
        }
    }

    /**
     * Add window state (above, below, fullscreen, etc.)
     */
    addWindowState(winId, state) {
        try {
            execSync(`wmctrl -i -r ${winId} -b add,${state}`, { env: this.env });
        } catch (e) { 
            this.logger.warn(`wmctrl add ${state} failed: ${e.message}`); 
        }
    }

    /**
     * Remove window state
     */
    removeWindowState(winId, state) {
        try {
            execSync(`wmctrl -i -r ${winId} -b remove,${state}`, { env: this.env });
        } catch (e) { 
            this.logger.warn(`wmctrl remove ${state} failed: ${e.message}`); 
        }
    }

    /**
     * Get active desktop index
     */
    getActiveDesktop() {
        try {
            const out = execSync('wmctrl -d', { env: this.env }).toString();
            const line = out.split('\n').find(l => l.includes('*'));
            if (!line) return 0;
            const idx = parseInt(line.split(' ')[0], 10);
            return Number.isFinite(idx) ? idx : 0;
        } catch { 
            return 0; 
        }
    }

    /**
     * Move window to specific desktop
     */
    moveToDesktop(winId, desktopIdx) {
        try {
            execSync(`wmctrl -i -r ${winId} -t ${desktopIdx}`, { env: this.env });
        } catch (e) { 
            this.logger.warn(`wmctrl move to desktop failed: ${e.message}`); 
        }
    }

    /**
     * Get available displays using xrandr
     */
    getDisplays() {
        try {
            const out = execSync('xrandr --current', { env: this.env }).toString();
            const lines = out.split('\n');
            const displays = [];
            for (const line of lines) {
                const m = line.match(/^(\S+)\s+connected(\s+primary)?\s+(\d+)x(\d+)\+(\d+)\+(\d+)/);
                if (m) {
                    const name = m[1];
                    const isPrimary = !!m[2];
                    const width = parseInt(m[3], 10);
                    const height = parseInt(m[4], 10);
                    const x = parseInt(m[5], 10);
                    const y = parseInt(m[6], 10);
                    displays.push({ name, isPrimary, width, height, x, y });
                }
            }
            return displays;
        } catch (e) {
            this.logger.error(`Failed to parse xrandr: ${e.message}`);
            return [];
        }
    }

    /**
     * Pick target display (prefer secondary, fallback to primary)
     */
    pickTargetDisplay(preferSecondary = true) {
        const displays = this.getDisplays();
        
        if (preferSecondary) {
            const nonPrimary = displays.filter(d => !d.isPrimary);
            if (nonPrimary.length) {
                nonPrimary.sort((a, b) => a.x - b.x);
                return nonPrimary[nonPrimary.length - 1];
            }
        }
        
        const primary = displays.find(d => d.isPrimary) || displays[0];
        return primary;
    }

    /**
     * Launch Chromium browser with specified options
     */
    launchChromium(options = {}) {
        const {
            url = 'http://localhost/clock/',
            profilePath = '/tmp/paradox-browser',
            className = 'ParadoxBrowser',
            display = null,
            width = 1920,
            height = 1080,
            x = 0,
            y = 0
        } = options;

        // Determine chromium binary
        const chromeBin = this._pickChromiumBinary();

        const args = [
            `--user-data-dir=${profilePath}`,
            `--class=${className}`,
            '--no-first-run',
            '--disable-infobars',
            '--disable-session-crashed-bubble',
            '--no-default-browser-check',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-background-timer-throttling',
            '--autoplay-policy=no-user-gesture-required',
            `--window-position=${x},${y}`,
            `--window-size=${width},${height}`,
            '--start-fullscreen',
            `--app=${url}`
        ];

        const process = spawn(chromeBin, args, { 
            stdio: ['ignore', 'ignore', 'pipe'], 
            env: this.env 
        });

        process.stderr.on('data', (d) => {
            // Log chromium errors but don't spam logs with common warnings
            const msg = d.toString();
            if (!msg.includes('DMA-BUF') && !msg.includes('BadWindow')) {
                this.logger.debug(`[chromium] ${msg}`);
            }
        });

        return process;
    }

    /**
     * Wait for HTTP endpoint to become available
     */
    async waitForHttpOk(url, timeoutMs = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const ok = await new Promise(resolve => {
                const req = http.get(url, res => {
                    res.resume();
                    resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 400);
                });
                req.on('error', () => resolve(false));
                req.setTimeout(2000, () => { req.destroy(); resolve(false); });
            });
            if (ok) return true;
            await this._sleep(250);
        }
        return false;
    }

    /**
     * Kill process gracefully with fallback to force kill
     */
    async killProcess(process, timeoutMs = 3000) {
        return new Promise(resolve => {
            if (!process || process.killed) return resolve();
            
            try { process.kill('SIGTERM'); } catch (_) {}
            
            const timeout = setTimeout(() => {
                try { process.kill('SIGKILL'); } catch (_) {}
                resolve();
            }, timeoutMs);
            
            process.on('exit', () => { 
                clearTimeout(timeout); 
                resolve(); 
            });
        });
    }

    /**
     * Check if window is currently active/focused
     */
    isWindowActive(winId) {
        try {
            const out = execSync('xdotool getactivewindow', { env: this.env }).toString().trim();
            return out === winId;
        } catch {
            return false;
        }
    }

    /**
     * Check if binary exists in PATH
     */
    _binExists(cmd) {
        try {
            execSync(`command -v ${cmd} >/dev/null 2>&1`, { env: this.env });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Pick available Chromium binary
     */
    _pickChromiumBinary() {
        const candidates = ['chromium-browser', 'chromium'];
        for (const c of candidates) {
            if (this._binExists(c)) return c;
        }
        throw new Error('Chromium binary not found (tried chromium-browser, chromium). Install chromium.');
    }

    /**
     * Sleep utility
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Clean up temporary files
     */
    safeUnlink(path) {
        try { 
            fs.unlinkSync(path); 
        } catch (_) {}
    }

    /**
     * Recursively remove directory
     */
    safeRemoveDir(path) {
        try { 
            fs.rmSync(path, { recursive: true, force: true }); 
        } catch (_) {}
    }
}

module.exports = WindowManager;
