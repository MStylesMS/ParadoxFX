#!/usr/bin/env node

/**
 * Paradox Effects (ParadoxFX) Startup Script
 * 
 * Usage examples:
 *   node start.js                    # Use pfx.ini
 *   node start.js config/prod.ini    # Use custom config
 *   SKIP_INTEGRATION_TESTS=1 npm test  # Skip integration tests
 */

const path = require('path');
const fs = require('fs');

// Parse --config/-c or positional argument for config file
const minimist = require('minimist');
const argv = minimist(process.argv.slice(2));
const configFile = argv.config || argv.c || argv._[0] || 'pfx.ini';
const configPath = path.resolve(configFile);

// Check if config file exists
if (!fs.existsSync(configPath)) {
    console.error(`Configuration file not found: ${configPath}`);
    console.error('Copy pfx.ini.example to pfx.ini and customize your settings.');
    process.exit(1);
}

// Start the application
console.log(`Starting ParadoxFX with configuration: ${configPath}`);
console.log('Press Ctrl+C to stop the application.');

// Load and start the main application
try {
    const ParadoxFX = require('./pfx');
    // Pass config path to ParadoxFX constructor if supported, else set env var
    const app = new ParadoxFX(configPath);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT. Shutting down gracefully...');
        await app.shutdown();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('\nReceived SIGTERM. Shutting down gracefully...');
        await app.shutdown();
        process.exit(0);
    });

    // Start the application
    app.start().catch(error => {
        console.error('Failed to start ParadoxFX:', error);
        process.exit(1);
    });

} catch (error) {
    console.error('Failed to initialize ParadoxFX:', error);
    process.exit(1);
}
