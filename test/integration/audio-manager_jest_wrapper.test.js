const path = require('path');
const fs = require('fs');
const audioIntegration = require('./audio-manager.test');

const longTestsEnabled = process.env.LONG_TESTS === '1';
const mediaDir = path.resolve(__dirname, '../../media/test/defaults');
const requiredFiles = ['default.mp3', 'default_fx.wav', 'stuff_to_do.mp3'].map(f => path.join(mediaDir, f));

jest.setTimeout(120000);

const describeOrSkip = (longTestsEnabled ? describe : describe.skip);

describeOrSkip('audio manager integration (wrapper)', () => {
    test('runs extended audio integration script', async () => {
        const missing = requiredFiles.filter(f => !fs.existsSync(f));
        if (missing.length) {
            console.warn('Skipping audio integration – missing media files:', missing);
            return; // treat as pass but effectively skipped logic
        }
        const { allPassed } = await audioIntegration.runTests();
        expect(allPassed).toBe(true);
    });
});
