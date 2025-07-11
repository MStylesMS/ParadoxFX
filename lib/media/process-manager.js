/**
 * Process Manager (Framework)
 * 
 * Framework for managing external media player instances.
 * Supports up to 8 concurrent media player processes that can be
 * pre-loaded and paused until ready for playback.
 */

const Logger = require('../utils/logger');

class ProcessManager {
    constructor(maxProcesses = 8) {
        this.logger = new Logger('ProcessManager');
        this.maxProcesses = maxProcesses;
        this.processes = new Map(); // id -> { player, status, mediaPath, createdAt }
        this.nextId = 1;
    }

    /**
     * Create a new media player process
     * @param {BasePlayer} player - Media player instance
     * @param {string} mediaPath - Path to media file
     * @param {Object} options - Player options
     * @returns {string} Process ID
     */
    async createProcess(player, mediaPath, options = {}) {
        // TODO: Implement process creation
        // 1. Check if we have capacity
        if (this.processes.size >= this.maxProcesses) {
            throw new Error(`Maximum process limit reached (${this.maxProcesses})`);
        }

        const processId = `proc_${this.nextId++}`;
        this.logger.debug(`Creating process ${processId} for ${mediaPath}`);

        // 2. Start player in paused state (if supported)
        const pausedOptions = { ...options, pauseAtStart: true };

        try {
            await player.play(mediaPath, pausedOptions);

            this.processes.set(processId, {
                player,
                status: 'paused',
                mediaPath,
                createdAt: Date.now(),
                options
            });

            this.logger.info(`Created process ${processId} for ${mediaPath}`);
            return processId;

        } catch (error) {
            this.logger.error(`Failed to create process for ${mediaPath}:`, error);
            throw error;
        }
    }

    /**
     * Resume a paused process
     * @param {string} processId - Process ID
     */
    async resumeProcess(processId) {
        // TODO: Implement process resume
        const processInfo = this.processes.get(processId);
        if (!processInfo) {
            throw new Error(`Process not found: ${processId}`);
        }

        if (processInfo.status !== 'paused') {
            throw new Error(`Process ${processId} is not paused (status: ${processInfo.status})`);
        }

        this.logger.debug(`Resuming process ${processId}`);

        try {
            await processInfo.player.resume();
            processInfo.status = 'playing';

            this.logger.info(`Resumed process ${processId}`);

        } catch (error) {
            this.logger.error(`Failed to resume process ${processId}:`, error);
            throw error;
        }
    }

    /**
     * Stop and remove a process
     * @param {string} processId - Process ID
     */
    async stopProcess(processId) {
        const processInfo = this.processes.get(processId);
        if (!processInfo) {
            this.logger.warn(`Process not found for stop: ${processId}`);
            return;
        }

        this.logger.debug(`Stopping process ${processId}`);

        try {
            await processInfo.player.stop();
            this.processes.delete(processId);

            this.logger.info(`Stopped process ${processId}`);

        } catch (error) {
            this.logger.error(`Error stopping process ${processId}:`, error);
            // Remove from map anyway
            this.processes.delete(processId);
        }
    }

    /**
     * Stop all processes
     */
    async stopAllProcesses() {
        this.logger.info('Stopping all processes...');

        const stopPromises = Array.from(this.processes.keys()).map(processId =>
            this.stopProcess(processId).catch(error =>
                this.logger.error(`Error stopping process ${processId}:`, error)
            )
        );

        await Promise.all(stopPromises);
        this.processes.clear();

        this.logger.info('All processes stopped');
    }

    /**
     * Kill all active processes (for cleanup/testing)
     * @returns {Promise<void>}
     */
    async killAll() {
        const processIds = Array.from(this.processes.keys());
        this.logger.info(`Killing all ${processIds.length} processes`);

        for (const processId of processIds) {
            try {
                await this.stopProcess(processId);
            } catch (error) {
                this.logger.warn(`Error stopping process ${processId}: ${error.message}`);
            }
        }

        this.processes.clear();
        this.logger.info('All processes killed');
    }

    /**
     * Get process information
     * @param {string} processId - Process ID
     * @returns {Object} Process information
     */
    getProcessInfo(processId) {
        return this.processes.get(processId);
    }

    /**
     * Get all active processes
     * @returns {Array} Array of process information
     */
    getAllProcesses() {
        return Array.from(this.processes.entries()).map(([id, info]) => ({
            id,
            ...info
        }));
    }

    /**
     * Cleanup old processes that have been paused too long
     * @param {number} maxAgeMs - Maximum age in milliseconds
     */
    cleanupOldProcesses(maxAgeMs = 300000) { // 5 minutes default
        const now = Date.now();
        const toRemove = [];

        for (const [processId, processInfo] of this.processes) {
            if (processInfo.status === 'paused' &&
                (now - processInfo.createdAt) > maxAgeMs) {
                toRemove.push(processId);
            }
        }

        if (toRemove.length > 0) {
            this.logger.info(`Cleaning up ${toRemove.length} old processes`);
            toRemove.forEach(processId => this.stopProcess(processId));
        }
    }

    /**
     * Get current usage statistics
     * @returns {Object} Usage statistics
     */
    getStats() {
        const processes = this.getAllProcesses();
        const playing = processes.filter(p => p.status === 'playing').length;
        const paused = processes.filter(p => p.status === 'paused').length;

        return {
            total: processes.length,
            playing,
            paused,
            available: this.maxProcesses - processes.length,
            maxProcesses: this.maxProcesses
        };
    }
}

module.exports = ProcessManager;
