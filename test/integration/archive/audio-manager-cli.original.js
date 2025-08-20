#!/usr/bin/env node

/**
 * CLI runner for Enhanced Audio System Integration Test
 * This file is intended to be executed directly (CLI) or imported by a Jest wrapper.
 */

const AudioManager = require('../../lib/media/audio-manager');
const path = require('path');
const fs = require('fs');

// Test media files
const BACKGROUND_MUSIC = path.resolve(__dirname, '../../media/test/defaults/default.mp3');
const SOUND_EFFECT = path.resolve(__dirname, '../../media/test/defaults/default_fx.wav');
const SPEECH_AUDIO = path.resolve(__dirname, '../../media/test/defaults/stuff_to_do.mp3');

// Keep the test implementation identical to the original so behavior is preserved
async function testInitialization() {
    const audioManager = new AudioManager({
        audioDevice: 'pulse/alsa_output.platform-107c701400.hdmi.hdmi-stereo',
        backgroundMusicVolume: 70,
        effectsVolume: 100,
        speechVolume: 90,
        duckingVolume: 40
    });

    await audioManager.initialize();
    return audioManager;
}

async function testBackgroundMusic(audioManager) {
    try {
        await audioManager.playBackgroundMusic(BACKGROUND_MUSIC, 80);
        await new Promise(resolve => setTimeout(resolve, 3000));
        await audioManager.setBackgroundMusicVolume(50);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await audioManager.setBackgroundMusicVolume(80);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
    } catch (e) {
        return false;
    }
}

async function testSoundEffects(audioManager) {
    try {
        for (let i = 0; i < 5; i++) {
            await audioManager.playSoundEffect(SOUND_EFFECT, 100);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        return true;
    } catch (e) {
        return false;
    }
}

async function testSpeechWithDucking(audioManager) {
    try {
        await audioManager.playSpeech(SPEECH_AUDIO, 90);
        await new Promise(resolve => setTimeout(resolve, 8000));
        return true;
    } catch (e) {
        return false;
    }
}

async function testMultipleStreams(audioManager) {
    try {
        await audioManager.playSoundEffect(SOUND_EFFECT, 100);
        await new Promise(resolve => setTimeout(resolve, 500));
        await audioManager.playSpeech(SPEECH_AUDIO, 90);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await audioManager.playSoundEffect(SOUND_EFFECT, 100);
        await new Promise(resolve => setTimeout(resolve, 500));
        await audioManager.playSoundEffect(SOUND_EFFECT, 100);
        await new Promise(resolve => setTimeout(resolve, 10000));
        return true;
    } catch (e) {
        return false;
    }
}

async function testQueueManagement(audioManager) {
    try {
        await audioManager.playSpeech(SPEECH_AUDIO, 90);
        await audioManager.playSpeech(SPEECH_AUDIO, 90);
        await audioManager.playSpeech(SPEECH_AUDIO, 90);
        await new Promise(resolve => setTimeout(resolve, 3000));
        await audioManager.clearSpeechQueue();
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
    } catch (e) {
        return false;
    }
}

async function runTests() {
    let audioManager = null;
    const results = {
        initialization: false,
        backgroundMusic: false,
        soundEffects: false,
        speechDucking: false,
        multipleStreams: false,
        queueManagement: false
    };

    audioManager = await testInitialization();
    results.initialization = true;

    results.backgroundMusic = await testBackgroundMusic(audioManager);
    results.soundEffects = await testSoundEffects(audioManager);
    results.speechDucking = await testSpeechWithDucking(audioManager);
    results.multipleStreams = await testMultipleStreams(audioManager);
    results.queueManagement = await testQueueManagement(audioManager);

    if (audioManager) {
        await audioManager.shutdown();
    }

    const allPassed = Object.values(results).every(r => r);
    return { allPassed, results };
}

// Check if test media files exist
const testFiles = [BACKGROUND_MUSIC, SOUND_EFFECT, SPEECH_AUDIO];
const missingFiles = testFiles.filter(file => !fs.existsSync(file));

if (missingFiles.length > 0 && require.main === module) {
    console.error('❌ Missing test media files:');
    missingFiles.forEach(file => console.error(`   - ${file}`));
    console.error('\nPlease ensure test media files are available in media/test/defaults/');
    process.exit(1);
}

// If run directly as CLI, execute and exit with appropriate code
if (require.main === module) {
    runTests().then(({ allPassed }) => {
        if (allPassed) process.exit(0);
        else process.exit(2);
    }).catch(err => {
        console.error('Test suite failed:', err);
        process.exit(1);
    });
}

module.exports = { runTests };
