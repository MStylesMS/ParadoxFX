/**
 * Logger Utility
 * 
 * Simple logging utility with different log levels.
 */

class Logger {
    constructor(module) {
        this.module = module;
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.messageLevel = process.env.message_level || 'info'; // Controls INFO vs DEBUG for messages

        this.levels = {
            'error': 0,
            'warn': 1,
            'info': 2,
            'debug': 3
        };
    }

    _shouldLog(level) {
        return this.levels[level] <= this.levels[this.logLevel];
    }

    _formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const levelStr = level.toUpperCase().padEnd(5);
        const moduleStr = this.module.padEnd(20);

        let formattedMessage = `${timestamp} [${levelStr}] ${moduleStr} ${message}`;

        if (args.length > 0) {
            const additionalInfo = args.map(arg => {
                if (typeof arg === 'object') {
                    return JSON.stringify(arg, null, 2);
                }
                return String(arg);
            }).join(' ');

            formattedMessage += ` ${additionalInfo}`;
        }

        return formattedMessage;
    }

    error(message, ...args) {
        if (this._shouldLog('error')) {
            console.error(this._formatMessage('error', message, ...args));
        }
    }

    warn(message, ...args) {
        if (this._shouldLog('warn')) {
            console.warn(this._formatMessage('warn', message, ...args));
        }
    }

    info(message, ...args) {
        // Respect message level setting for INFO messages
        if (this.messageLevel === 'info' || this.messageLevel === 'debug') {
            if (this._shouldLog('info')) {
                console.log(this._formatMessage('info', message, ...args));
            }
        }
    }

    debug(message, ...args) {
        // Respect message level setting for DEBUG messages
        if (this.messageLevel === 'debug') {
            if (this._shouldLog('debug')) {
                console.log(this._formatMessage('debug', message, ...args));
            }
        }
    }
}

module.exports = Logger;
