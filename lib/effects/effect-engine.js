/**
 * Effect Engine (Framework)
 * 
 * Framework for lighting effect macros and scripts.
 * Supports common effects across multiple controller types.
 */

const Logger = require('../utils/logger');

class EffectEngine {
    constructor() {
        this.logger = new Logger('EffectEngine');
        this.runningEffects = new Map(); // effectId -> { controller, config, interval }
        this.effectId = 1;
    }

    /**
     * Start a lighting effect
     * @param {string} effectType - Type of effect (FADE, BLINK, etc.)
     * @param {Object} controller - Light controller instance
     * @param {Array} targets - Target lights/groups
     * @param {Object} parameters - Effect parameters
     * @returns {string} Effect ID for stopping later
     */
    async startEffect(effectType, controller, targets, parameters) {
        const effectId = `effect_${this.effectId++}`;
        this.logger.info(`Starting effect ${effectType} with ID ${effectId}`);

        try {
            switch (effectType.toUpperCase()) {
                case 'FADE':
                    await this._startFadeEffect(effectId, controller, targets, parameters);
                    break;

                case 'BLINK':
                    await this._startBlinkEffect(effectId, controller, targets, parameters);
                    break;

                case 'FLIP':
                    await this._startFlipEffect(effectId, controller, targets, parameters);
                    break;

                case 'DISCO':
                    await this._startDiscoEffect(effectId, controller, targets, parameters);
                    break;

                case 'FLAME':
                    await this._startFlameEffect(effectId, controller, targets, parameters);
                    break;

                case 'MORSE':
                    await this._startMorseEffect(effectId, controller, targets, parameters);
                    break;

                default:
                    throw new Error(`Unknown effect type: ${effectType}`);
            }

            this.logger.info(`Effect ${effectType} started with ID ${effectId}`);
            return effectId;

        } catch (error) {
            this.logger.error(`Failed to start effect ${effectType}:`, error);
            throw error;
        }
    }

    /**
     * Stop a running effect
     * @param {string} effectId - Effect ID to stop
     */
    async stopEffect(effectId) {
        const effect = this.runningEffects.get(effectId);
        if (!effect) {
            this.logger.warn(`Effect not found: ${effectId}`);
            return;
        }

        this.logger.info(`Stopping effect ${effectId}`);

        if (effect.interval) {
            clearInterval(effect.interval);
        }

        if (effect.timeout) {
            clearTimeout(effect.timeout);
        }

        this.runningEffects.delete(effectId);

        this.logger.info(`Effect ${effectId} stopped`);
    }

    /**
     * Stop all running effects
     */
    async stopAllEffects() {
        this.logger.info('Stopping all effects...');

        const effectIds = Array.from(this.runningEffects.keys());
        for (const effectId of effectIds) {
            await this.stopEffect(effectId);
        }

        this.logger.info('All effects stopped');
    }

    /**
     * Get list of running effects
     */
    getRunningEffects() {
        return Array.from(this.runningEffects.keys());
    }

    // Effect implementations (to be completed)

    async _startFadeEffect(effectId, controller, targets, parameters) {
        // TODO: Implement FADE effect
        // Parameters: targetColor, targetBrightness, transitionDuration
        const { targetColor, targetBrightness, transitionDuration = 1000 } = parameters;

        this.logger.debug(`FADE effect: ${targetColor}, brightness: ${targetBrightness}, duration: ${transitionDuration}ms`);

        // Store effect info
        this.runningEffects.set(effectId, {
            type: 'FADE',
            controller,
            targets,
            parameters,
            startTime: Date.now()
        });

        // TODO: Implement gradual color/brightness transition
    }

    async _startBlinkEffect(effectId, controller, targets, parameters) {
        // TODO: Implement BLINK effect
        // Parameters: targetColor, targetBrightness, durationOn, durationOff, transitionDuration
        const {
            targetColor,
            targetBrightness,
            durationOn = 500,
            durationOff = 500,
            transitionDuration = 100
        } = parameters;

        this.logger.debug(`BLINK effect: on ${durationOn}ms, off ${durationOff}ms`);

        // TODO: Implement alternating on/off pattern
        const interval = setInterval(async () => {
            // Alternate between on and off states
        }, durationOn + durationOff);

        this.runningEffects.set(effectId, {
            type: 'BLINK',
            controller,
            targets,
            parameters,
            interval,
            startTime: Date.now()
        });
    }

    async _startFlipEffect(effectId, controller, targets, parameters) {
        // TODO: Implement FLIP effect
        // Parameters: colorList, durationOn, durationOff, transitionDuration
        const {
            colorList = [],
            durationOn = 1000,
            durationOff = 100,
            transitionDuration = 200
        } = parameters;

        this.logger.debug(`FLIP effect: ${colorList.length} colors, ${durationOn}ms each`);

        // TODO: Implement color cycling
        this.runningEffects.set(effectId, {
            type: 'FLIP',
            controller,
            targets,
            parameters,
            startTime: Date.now()
        });
    }

    async _startDiscoEffect(effectId, controller, targets, parameters) {
        // TODO: Implement DISCO effect
        // Parameters: brightness, triggerInterval, transitionDuration, synced
        const {
            brightness = 100,
            triggerInterval = 200,
            transitionDuration = 50,
            synced = false
        } = parameters;

        this.logger.debug(`DISCO effect: synced=${synced}, interval=${triggerInterval}ms`);

        // TODO: Implement random color changes
        this.runningEffects.set(effectId, {
            type: 'DISCO',
            controller,
            targets,
            parameters,
            startTime: Date.now()
        });
    }

    async _startFlameEffect(effectId, controller, targets, parameters) {
        // TODO: Implement FLAME effect
        // Parameters: baseColor, brightness, synced
        const {
            baseColor = '#FF4500',
            brightness = 80,
            synced = false
        } = parameters;

        this.logger.debug(`FLAME effect: color=${baseColor}, synced=${synced}`);

        // TODO: Implement flame-like flickering
        this.runningEffects.set(effectId, {
            type: 'FLAME',
            controller,
            targets,
            parameters,
            startTime: Date.now()
        });
    }

    async _startMorseEffect(effectId, controller, targets, parameters) {
        // TODO: Implement MORSE effect
        // Parameters: message, targetColor, targetBrightness, dotDuration
        const {
            message = 'SOS',
            targetColor,
            targetBrightness = 100,
            dotDuration = 200
        } = parameters;

        this.logger.debug(`MORSE effect: "${message}", dot duration=${dotDuration}ms`);

        // TODO: Implement Morse code pattern
        this.runningEffects.set(effectId, {
            type: 'MORSE',
            controller,
            targets,
            parameters,
            startTime: Date.now()
        });
    }

    _textToMorse(text) {
        // TODO: Convert text to Morse code pattern
        const morseCode = {
            'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
            'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
            'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
            'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
            'Y': '-.--', 'Z': '--..', '0': '-----', '1': '.----', '2': '..---',
            '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...',
            '8': '---..', '9': '----.', ' ': '/'
        };

        return text.toUpperCase().split('').map(char => morseCode[char] || '').join(' ');
    }

    _generateRandomColor() {
        // Generate random RGB color
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
}

module.exports = EffectEngine;
