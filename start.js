#!/usr/bin/env node

/**
 * Paradox Effects (PxFx) Startup Script
 * 
 * Usage examples:
 *   node start.js                    # Use pxfx.ini
 *   node start.js config/prod.ini    # Use custom config
 *   SKIP_INTEGRATION_TESTS=1 npm test  # Skip integration tests
 */

const path = require('path');
const fs = require('fs');

// Determine configuration file
const configFile = process.argv[2] || 'pxfx.ini';
const configPath = path.resolve(configFile);

// Check if config file exists
if (!fs.existsSync(configPath)) {
    console.error(`Configuration file not found: ${configPath}`);
    console.error('Copy pxfx.ini.example to pxfx.ini and customize your settings.');
    process.exit(1);
}

// Start the application
console.log(`Starting PxFx with configuration: ${configPath}`);
console.log('Press Ctrl+C to stop the application.');

// Load and start the main application
try {
    const PxFx = require('./pxfx');
    const app = new PxFx(configPath);

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
        console.error('Failed to start PxFx:', error);
        process.exit(1);
    });

} catch (error) {
    console.error('Failed to initialize PxFx:', error);
    process.exit(1);
}
