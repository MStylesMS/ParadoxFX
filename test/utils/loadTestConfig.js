// test/utils/loadTestConfig.js
// Helper to load pxfx-test.ini or a specified config for integration/system tests

const path = require('path');
const ConfigLoader = require('../../lib/core/config-loader');

async function loadTestConfig(configFile) {
    const file = configFile || process.env.PXFX_TEST_CONFIG || path.resolve(__dirname, '../../pxfx-test.ini');
    return await ConfigLoader.load(file);
}

module.exports = loadTestConfig;
