const { runTests } = require('./audio-manager-cli');

jest.setTimeout(120000); // allow longer time for integration

test('audio manager integration (wrapper)', async () => {
    const { allPassed } = await runTests();
    expect(allPassed).toBe(true);
});
const path = require('path');
const fs = require('fs');
const audioIntegration = require('./audio-manager.test');

jest.setTimeout(120000); // 2 minutes for slower CI machines

test('audio manager integration (wrapper)', async () => {
    // Ensure test media exists before running
    const BACKGROUND_MUSIC = path.resolve(__dirname, '../../media/test/defaults/default.mp3');
    const SOUND_EFFECT = path.resolve(__dirname, '../../media/test/defaults/default_fx.wav');
    const SPEECH_AUDIO = path.resolve(__dirname, '../../media/test/defaults/stuff_to_do.mp3');
    const testFiles = [BACKGROUND_MUSIC, SOUND_EFFECT, SPEECH_AUDIO];
    const missing = testFiles.filter(f => !fs.existsSync(f));
    if (missing.length > 0) {
        throw new Error('Missing test media files: ' + missing.join(', '));
    }

    const { allPassed } = await audioIntegration.runTests();
    expect(typeof allPassed).toBe('boolean');
    expect(allPassed).toBe(true);
});
