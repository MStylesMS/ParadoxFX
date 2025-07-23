/**
 * Combined Audio Zone
 * 
 * Handles combined audio zones that output to multiple audio devices simultaneously.
 * This is a future enhancement - currently a stub implementation.
 */

const BaseZone = require('./base-zone');

class CombinedAudioZone extends BaseZone {
    constructor(config, mqttClient) {
        super(config, mqttClient);

        // Combined audio configuration
        this.audioOutputs = config.audio_outputs ? config.audio_outputs.split(',').map(s => s.trim()) : [];
        
        this.logger.warn('CombinedAudioZone is not fully implemented yet - stub class');
    }

    async initialize() {
        this.logger.info('Initializing combined audio zone (stub implementation)...');

        // TODO: Implement combined audio zone initialization
        // This would involve creating multiple audio outputs and managing them
        
        this.isInitialized = true;
        this.publishWarning('Combined audio zone is not fully implemented', {
            zone_type: 'combined-audio',
            audio_outputs: this.audioOutputs
        });
        
        this.publishStatus();
    }

    async handleCommand(command) {
        // For now, reject all commands with a helpful message
        this.publishWarning(`Combined audio zones are not fully implemented yet`, {
            command: command.Command,
            zone_type: 'combined-audio',
            message: 'Use individual audio or screen zones instead'
        });
    }

    getSupportedCommands() {
        return []; // No commands supported yet
    }

    async shutdown() {
        if (!this.isInitialized) {
            return;
        }

        this.logger.info('Shutting down combined audio zone...');
        
        // TODO: Implement shutdown logic
        
        this.isInitialized = false;
        this.logger.info('Combined audio zone shutdown complete');
    }
}

module.exports = CombinedAudioZone;
