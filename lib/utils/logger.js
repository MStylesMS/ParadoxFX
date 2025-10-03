/**
 * Logger Utility
 * 
 * Simple logging utility with different log levels.
 */

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m'
};

// Color mapping for log levels
const levelColors = {
    error: colors.red,
    warn: colors.yellow,
    info: colors.green,
    debug: colors.cyan
};

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
        const color = levelColors[level] || colors.reset;
        const levelStr = level.toUpperCase().padEnd(5);
        const moduleStr = this.module.padEnd(20);

        let formattedMessage = `${timestamp} ${color}[${levelStr}]${colors.reset} ${moduleStr} ${message}`;

        if (args.length > 0) {
            const additionalInfo = args.map(arg => {
                    if (arg instanceof Error) {
                        const payload = {
                            error: arg.message
                        };
                        if (arg.stderr) payload.stderr = arg.stderr;
                        if (arg.stack) payload.stack = arg.stack.split('\n').slice(0,6).join('\n');
                        return JSON.stringify(payload);
                    }
                    if (typeof arg === 'object') {
                        try {
                            return JSON.stringify(arg, null, 2);
                        } catch (_) {
                            return '[Unserializable Object]';
                        }
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
