/**
 * OS Detection Utility
 * Detects Debian version and provides OS-specific configurations
 * for cross-version compatibility (Bookworm/Trixie)
 */
const fs = require('fs');
const { execSync } = require('child_process');

class OSDetection {
  constructor() {
    this.osInfo = this._detectOS();
    this.browserCommand = this._detectBrowserCommand();
  }

  /**
   * Detect OS version from /etc/os-release
   * @private
   */
  _detectOS() {
    try {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
      const codename = osRelease.match(/VERSION_CODENAME=(\w+)/)?.[1] || 'unknown';
      const versionId = parseInt(osRelease.match(/VERSION_ID="(\d+)"/)?.[1] || '0');
      
      return {
        codename,
        versionId,
        isBookworm: codename === 'bookworm' || versionId === 12,
        isTrixie: codename === 'trixie' || versionId === 13,
        isDebian: osRelease.includes('Debian'),
        isRaspbian: osRelease.includes('Raspbian')
      };
    } catch (error) {
      console.warn('[OSDetection] Could not read /etc/os-release, using defaults');
      return {
        codename: 'unknown',
        versionId: 0,
        isBookworm: false,
        isTrixie: false,
        isDebian: false,
        isRaspbian: false
      };
    }
  }

  /**
   * Detect available browser command
   * Tries chromium, chromium-browser, google-chrome in order
   * @private
   */
  _detectBrowserCommand() {
    // Allow environment variable override
    if (process.env.PFX_BROWSER_COMMAND) {
      return process.env.PFX_BROWSER_COMMAND;
    }

    // Try to find available browser, preferring Chromium
    const candidates = ['chromium', 'chromium-browser', 'google-chrome'];
    
    for (const cmd of candidates) {
      try {
        execSync(`which ${cmd}`, { stdio: 'ignore' });
        return cmd;
      } catch (error) {
        // Command not found, try next
      }
    }
    
    // Fallback based on OS version
    if (this.osInfo.isTrixie) {
      return 'chromium';
    }
    return 'chromium-browser';
  }

  /**
   * Get the detected browser command
   * @returns {string} Browser command (chromium, chromium-browser, etc.)
   */
  getBrowserCommand() {
    return this.browserCommand;
  }

  /**
   * Get window detection configuration based on OS
   * Trixie needs more retries and longer delays due to window manager changes
   * @returns {Object} Configuration object with timing parameters
   */
  getWindowDetectionConfig() {
    // Trixie needs more retries and longer delays
    if (this.osInfo.isTrixie) {
      return {
        maxRetries: 8,
        retryDelay: 300,
        initialDelay: 500,
        activateRetries: 3
      };
    }
    
    // Bookworm defaults
    return {
      maxRetries: 5,
      retryDelay: 200,
      initialDelay: 300,
      activateRetries: 2
    };
  }

  /**
   * Get MPV configuration based on OS
   * @returns {Object} MPV configuration object
   */
  getMpvConfig() {
    // Suppress VDPAU warnings on Trixie (VC4 backend not available)
    if (this.osInfo.isTrixie) {
      return {
        suppressVdpauWarnings: true,
        logLevel: 'error' // Reduce MPV stderr noise
      };
    }
    
    return {
      suppressVdpauWarnings: false,
      logLevel: 'info'
    };
  }

  /**
   * Get a formatted log prefix with OS info
   * @returns {string} Log prefix like [bookworm/12]
   */
  getLogPrefix() {
    return `[${this.osInfo.codename}/${this.osInfo.versionId}]`;
  }

  /**
   * Get OS info object
   * @returns {Object} OS information
   */
  getOSInfo() {
    return { ...this.osInfo };
  }

  /**
   * String representation of detected OS
   * @returns {string} Like "Debian bookworm (12)"
   */
  toString() {
    return `Debian ${this.osInfo.codename} (${this.osInfo.versionId})`;
  }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton OS detection instance
 * @returns {OSDetection} Singleton instance
 */
function getOSDetection() {
  if (!instance) {
    instance = new OSDetection();
  }
  return instance;
}

module.exports = { getOSDetection, OSDetection };
