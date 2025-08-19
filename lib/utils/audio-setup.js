/**
 * Audio Setup Utility
 * 
 * Manages PulseAudio combined sinks for PFX
 * Creates and maintains combined audio outputs as specified in configuration
 */

const { execSync, exec } = require('child_process');
const Logger = require('./logger');

class AudioSetup {
    constructor() {
        this.logger = new Logger('AudioSetup');
    }

    /**
     * Set up combined audio sinks based on configuration
     * @param {Object} config - Global configuration object
     * @param {Array} devices - Array of device configurations
     */
    async setupCombinedSinks(config, devices) {
        this.logger.info('Setting up combined audio sinks...');

        // Look for combined audio configurations
        const combinedConfigs = this._findCombinedAudioConfigs(devices);
        
        for (const combinedConfig of combinedConfigs) {
            await this._setupCombinedSink(combinedConfig);
        }
    }

    /**
     * Find combined audio configurations from device list
     * @private
     */
    _findCombinedAudioConfigs(devices) {
        const combinedConfigs = [];
        
        for (const device of devices) {
            // Support combined sinks on both audio and screen device types
            if ((device.type === 'audio' || device.type === 'screen') && device.combinedSinks) {
                combinedConfigs.push({
                    name: device.name,
                    sinkName: device.combinedSinkName || 'combined_output',
                    description: device.combinedSinkDescription || 'Combined Audio Output',
                    slaves: device.combinedSinks,
                    audioDevice: device.audioDevice
                });
            }
        }
        
        return combinedConfigs;
    }

    /**
     * Set up a single combined sink
     * @private
     */
    async _setupCombinedSink(config) {
        try {
            this.logger.info(`Setting up combined sink: ${config.sinkName}`);

            // First, check if the sink already exists
            const existingSink = await this._findExistingSink(config.sinkName);
            if (existingSink) {
                this.logger.info(`Combined sink ${config.sinkName} already exists, checking configuration...`);
                
                // Check if the existing sink has the correct slaves
                const correctSlaves = await this._validateSinkSlaves(existingSink, config.slaves);
                if (correctSlaves) {
                    this.logger.info(`Combined sink ${config.sinkName} is correctly configured`);
                    return;
                } else {
                    this.logger.info(`Combined sink ${config.sinkName} has incorrect slaves, recreating...`);
                    await this._removeCombinedSink(existingSink.moduleId);
                }
            }

            // Discover actual sink names
            const resolvedSlaves = await this._resolveSlaveNames(config.slaves);
            if (resolvedSlaves.length === 0) {
                this.logger.warn(`No valid slave sinks found for ${config.sinkName}, skipping`);
                return;
            }

            // Create the combined sink
            await this._createCombinedSink(config.sinkName, config.description, resolvedSlaves);
            
            this.logger.info(`Combined sink ${config.sinkName} created successfully`);

        } catch (error) {
            this.logger.error(`Failed to setup combined sink ${config.sinkName}:`, error.message);
        }
    }

    /**
     * Find existing combined sink by name
     * @private
     */
    async _findExistingSink(sinkName) {
        try {
            const output = execSync('pactl list sinks', { encoding: 'utf8' });
            const sinks = this._parsePactlSinks(output);
            
            return sinks.find(sink => sink.name === sinkName);
        } catch (error) {
            this.logger.debug(`Error checking existing sinks: ${error.message}`);
            return null;
        }
    }

    /**
     * Validate that existing sink has correct slaves
     * @private
     */
    async _validateSinkSlaves(sink, expectedSlaves) {
        try {
            // Get module info for the sink
            const moduleOutput = execSync(`pactl list modules`, { encoding: 'utf8' });
            const modules = this._parsePactlModules(moduleOutput);
            
            const combineModule = modules.find(m => 
                m.name === 'module-combine-sink' && 
                m.argument && 
                m.argument.includes(`sink_name=${sink.name}`)
            );
            
            if (!combineModule) return false;
            
            // Parse slaves from module arguments
            const slavesMatch = combineModule.argument.match(/slaves=([^,\s]+)/);
            if (!slavesMatch) return false;
            
            const actualSlaves = slavesMatch[1].split(',');
            const resolvedExpected = await this._resolveSlaveNames(expectedSlaves);
            
            // Check if all expected slaves are present
            return resolvedExpected.every(expected => actualSlaves.includes(expected));
            
        } catch (error) {
            this.logger.debug(`Error validating sink slaves: ${error.message}`);
            return false;
        }
    }

    /**
     * Remove a combined sink by module ID
     * @private
     */
    async _removeCombinedSink(moduleId) {
        try {
            execSync(`pactl unload-module ${moduleId}`);
            this.logger.info(`Removed existing combined sink module ${moduleId}`);
        } catch (error) {
            this.logger.warn(`Failed to remove module ${moduleId}: ${error.message}`);
        }
    }

    /**
     * Resolve slave sink patterns to actual sink names
     * @private
     */
    async _resolveSlaveNames(slavePatterns) {
        try {
            const output = execSync('pactl list sinks', { encoding: 'utf8' });
            const sinks = this._parsePactlSinks(output);
            const resolvedSlaves = [];

            for (const pattern of slavePatterns) {
                if (pattern.startsWith('pulse/')) {
                    // Direct PulseAudio sink name
                    const sinkName = pattern.replace('pulse/', '');
                    if (sinks.find(s => s.name === sinkName)) {
                        resolvedSlaves.push(sinkName);
                    } else {
                        this.logger.warn(`Slave sink not found: ${sinkName}`);
                    }
                } else {
                    // Pattern matching by description or properties
                    const matchingSink = sinks.find(s => 
                        s.description.toLowerCase().includes(pattern.toLowerCase()) ||
                        s.name.includes(pattern)
                    );
                    if (matchingSink) {
                        resolvedSlaves.push(matchingSink.name);
                    } else {
                        this.logger.warn(`No sink found matching pattern: ${pattern}`);
                    }
                }
            }

            return resolvedSlaves;
        } catch (error) {
            this.logger.error(`Error resolving slave names: ${error.message}`);
            return [];
        }
    }

    /**
     * Create a combined sink
     * @private
     */
    async _createCombinedSink(sinkName, description, slaves) {
        const slavesStr = slaves.join(',');
        const command = `pactl load-module module-combine-sink sink_name=${sinkName} slaves=${slavesStr} sink_properties=device.description="${description}"`;
        
        this.logger.debug(`Creating combined sink: ${command}`);
        execSync(command);
    }

    /**
     * Parse pactl list sinks output
     * @private
     */
    _parsePactlSinks(output) {
        const sinks = [];
        const sinkBlocks = output.split(/^Sink #/m).slice(1);
        
        for (const block of sinkBlocks) {
            const lines = block.split('\n');
            const sink = { moduleId: null, name: null, description: null };
            
            for (const line of lines) {
                const ownerMatch = line.match(/Owner Module:\s*(\d+)/);
                if (ownerMatch) {
                    sink.moduleId = ownerMatch[1];
                }
                
                const nameMatch = line.match(/Name:\s*(.+)/);
                if (nameMatch) {
                    sink.name = nameMatch[1].trim();
                }
                
                const descMatch = line.match(/Description:\s*(.+)/);
                if (descMatch) {
                    sink.description = descMatch[1].trim();
                }
            }
            
            if (sink.name) {
                sinks.push(sink);
            }
        }
        
        return sinks;
    }

    /**
     * Parse pactl list modules output
     * @private
     */
    _parsePactlModules(output) {
        const modules = [];
        const moduleBlocks = output.split(/^Module #/m).slice(1);
        
        for (const block of moduleBlocks) {
            const lines = block.split('\n');
            const module = { id: null, name: null, argument: null };
            
            const idMatch = block.match(/^(\d+)/);
            if (idMatch) {
                module.id = idMatch[1];
            }
            
            for (const line of lines) {
                const nameMatch = line.match(/Name:\s*(.+)/);
                if (nameMatch) {
                    module.name = nameMatch[1].trim();
                }
                
                const argMatch = line.match(/Argument:\s*(.+)/);
                if (argMatch) {
                    module.argument = argMatch[1].trim();
                }
            }
            
            if (module.name) {
                modules.push(module);
            }
        }
        
        return modules;
    }

    /**
     * Test if PulseAudio is available and responsive
     */
    async testPulseAudio() {
        try {
            execSync('pactl info', { timeout: 5000 });
            return true;
        } catch (error) {
            this.logger.warn('PulseAudio not available or not responding');
            return false;
        }
    }
}

module.exports = AudioSetup;
