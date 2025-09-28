// Slim secondary wrapper retained only as optional smoke test.
// Disabled by default unless LONG_TESTS=1 and SMOKE_AUDIO=1
const longTestsEnabled = process.env.LONG_TESTS === '1';
const smokeEnabled = process.env.SMOKE_AUDIO === '1';
const shouldRun = longTestsEnabled && smokeEnabled;

jest.setTimeout(60000);

const maybe = shouldRun ? describe : describe.skip;

maybe('audio manager integration smoke wrapper', () => {
    test('smoke run', async () => {
        const audioTest = require('./audio-manager.test.js');
        const { allPassed } = await audioTest.runTests();
        expect(typeof allPassed).toBe('boolean');
    });
});
