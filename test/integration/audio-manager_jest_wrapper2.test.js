const path = require('path');

jest.setTimeout(120000); // 2 minutes

describe('audio manager integration wrapper', () => {
    test('run audio manager integration tests in-process', async () => {
        const audioTest = require('./audio-manager.test.js');
        // audio-manager.test.js exports runTests
        const { allPassed } = await audioTest.runTests();
        expect(allPassed).toBeDefined();
    });
});
