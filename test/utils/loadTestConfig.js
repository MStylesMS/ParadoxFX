// test/utils/loadTestConfig.js
// Helper to load pfx-test.ini or a specified config for integration/system tests

const path = require('path');
const ConfigLoader = require('../../lib/core/config-loader');

async function loadTestConfig(configFile) {
    const file = configFile || process.env.PFX_TEST_CONFIG || path.resolve(__dirname, '../../pfx-test.ini');
    return await ConfigLoader.load(file);
}

module.exports = loadTestConfig;
