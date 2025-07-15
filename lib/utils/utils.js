/**
 * Utility Functions
 * 
 * Shared utility functions for the ParadoxFX application.
 */

const fs = require('fs').promises;
const path = require('path');

class Utils {
    /**
     * Check if a file exists
     * @param {string} filePath - Path to check
     * @returns {boolean} True if file exists
     */
    static async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get file extension
     * @param {string} filePath - File path
     * @returns {string} File extension (without dot)
     */
    static getFileExtension(filePath) {
        return path.extname(filePath).slice(1).toLowerCase();
    }

    /**
     * Check if file is a supported media type
     * @param {string} filePath - File path
     * @param {string} mediaType - Media type ('image', 'video', 'audio')
     * @returns {boolean} True if supported
     */
    static isSupportedMediaType(filePath, mediaType) {
        const extension = this.getFileExtension(filePath);

        const supportedTypes = {
            image: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'],
            video: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'],
            audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a']
        };

        return supportedTypes[mediaType]?.includes(extension) || false;
    }

    /**
     * Parse audio channel map string
     * @param {string} channelMap - Channel map string
     * @returns {Object} Parsed channel configuration
     */
    static parseChannelMap(channelMap) {
        if (!channelMap) {
            return { device: 'default', mask: null, channels: [] };
        }

        const channels = channelMap.split(';').map(channel => {
            const parts = channel.trim().split(' ');
            const channelName = parts[0];

            let device = 'default';
            let mask = null;

            for (let i = 1; i < parts.length; i++) {
                const part = parts[i];
                if (part.startsWith('DEVICE=')) {
                    device = part.split('=')[1];
                } else if (part.startsWith('CHMASK=')) {
                    mask = part.split('=')[1];
                }
            }

            return { name: channelName, device, mask };
        });

        // Return first channel as default, plus all channels
        const defaultChannel = channels[0] || { name: 'Default', device: 'default', mask: null };

        return {
            device: defaultChannel.device,
            mask: defaultChannel.mask,
            channels: channels
        };
    }

    /**
     * Validate MQTT topic format
     * @param {string} topic - MQTT topic
     * @returns {boolean} True if valid
     */
    static isValidMqttTopic(topic) {
        if (!topic || typeof topic !== 'string') {
            return false;
        }

        // Basic MQTT topic validation
        // Cannot contain wildcards in publish topics
        // Cannot be empty or contain null characters
        return !topic.includes('+') &&
            !topic.includes('#') &&
            !topic.includes('\0') &&
            topic.length > 0;
    }

    /**
     * Convert color format
     * @param {string} color - Color in various formats
     * @param {string} targetFormat - Target format ('rgb', 'hex', 'hsv')
     * @returns {Object|string} Converted color
     */
    static convertColor(color, targetFormat = 'rgb') {
        // TODO: Implement color conversion
        // Support for: hex (#RRGGBB), rgb(r,g,b), hsv(h,s,v), color names

        if (targetFormat === 'hex') {
            return color.startsWith('#') ? color : '#000000';
        }

        if (targetFormat === 'rgb') {
            // Parse hex color
            if (color.startsWith('#')) {
                const hex = color.slice(1);
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                return { r, g, b };
            }
        }

        if (targetFormat === 'hsv') {
            // Convert RGB to HSV
            const rgb = this.convertColor(color, 'rgb');
            return this._rgbToHsv(rgb.r, rgb.g, rgb.b);
        }

        return color;
    }

    /**
     * Generate unique ID
     * @param {string} prefix - Optional prefix
     * @returns {string} Unique ID
     */
    static generateId(prefix = '') {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 9);
        return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
    }

    /**
     * Deep clone an object
     * @param {Object} obj - Object to clone
     * @returns {Object} Cloned object
     */
    static deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.deepClone(item));
        }

        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this.deepClone(obj[key]);
            }
        }

        return cloned;
    }

    /**
     * Sanitize filename for safe usage
     * @param {string} filename - Original filename
     * @returns {string} Sanitized filename
     */
    static sanitizeFilename(filename) {
        return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    }

    /**
     * Get media file info
     * @param {string} filePath - Path to media file
     * @returns {Object} Media file information
     */
    static async getMediaInfo(filePath) {
        try {
            const stats = await fs.stat(filePath);
            const extension = this.getFileExtension(filePath);

            let mediaType = 'unknown';
            if (this.isSupportedMediaType(filePath, 'image')) {
                mediaType = 'image';
            } else if (this.isSupportedMediaType(filePath, 'video')) {
                mediaType = 'video';
            } else if (this.isSupportedMediaType(filePath, 'audio')) {
                mediaType = 'audio';
            }

            return {
                path: filePath,
                name: path.basename(filePath),
                extension,
                mediaType,
                size: stats.size,
                modified: stats.mtime,
                created: stats.birthtime
            };

        } catch (error) {
            throw new Error(`Cannot get media info for ${filePath}: ${error.message}`);
        }
    }

    /**
     * Check if the current user has access to framebuffer devices
     */
    static checkFramebufferAccess() {
        try {
            const { execSync } = require('child_process');

            // Check if user is in video group
            const groups = execSync('groups', { encoding: 'utf8' }).trim();
            const hasVideoGroup = groups.includes('video');

            // Check if framebuffer device exists and is accessible
            const fs = require('fs');
            let canAccessFb = false;
            try {
                fs.accessSync('/dev/fb0', fs.constants.R_OK);
                canAccessFb = true;
            } catch (error) {
                // Cannot access framebuffer
            }

            return {
                hasVideoGroup,
                canAccessFramebuffer: canAccessFb,
                framebufferRecommendation: !hasVideoGroup && !canAccessFb ?
                    'Add user to video group: sudo usermod -a -G video $USER' : null
            };
        } catch (error) {
            return {
                hasVideoGroup: false,
                canAccessFramebuffer: false,
                framebufferRecommendation: 'Cannot determine framebuffer access'
            };
        }
    }

    // Private helper methods

    static _rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const diff = max - min;

        let h = 0;
        let s = max === 0 ? 0 : diff / max;
        let v = max;

        if (diff !== 0) {
            switch (max) {
                case r:
                    h = ((g - b) / diff) % 6;
                    break;
                case g:
                    h = (b - r) / diff + 2;
                    break;
                case b:
                    h = (r - g) / diff + 4;
                    break;
            }
        }

        h = Math.round(h * 60);
        s = Math.round(s * 100);
        v = Math.round(v * 100);

        return { h, s, v };
    }
}

module.exports = Utils;
