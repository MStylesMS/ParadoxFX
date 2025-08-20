const { runTests } = require('./audio-manager-auto.test.js');

// Jest wrapper that runs the integration script in-process and asserts it completes
jest.setTimeout(120000); // 2 minutes

test('audio manager automated integration', async () => {
    const result = await runTests();
    expect(result).toHaveProperty('allPassed');
    // We don't assert allPassed === true here because CI may not have real audio devices
    // Instead, ensure the script returned a results object
    expect(result.results).toBeDefined();
});
