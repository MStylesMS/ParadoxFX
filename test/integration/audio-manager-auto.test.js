#!/usr/bin/env node

/**
 * @fileoverview Automated Integration Test for Enhanced Audio System
 * @description Non-interactive test script for CI/CD validation
 * 
 * This script runs all audio system tests automatically without user interaction
 * 
 * @author ParadoxFX Team
 * @version 1.0.0
 * @since 2025-01-16
 */

const AudioManager = require('../../lib/media/audio-manager');
const path = require('path');
const fs = require('fs');

// Test media files
const BACKGROUND_MUSIC = path.resolve(__dirname, '../fixtures/test-media/houdini_music.mp3');
const SOUND_EFFECT = path.resolve(__dirname, '../fixtures/test-media/default_fx.wav');
const SPEECH_AUDIO = path.resolve(__dirname, '../fixtures/test-media/stuff_to_do.mp3');

console.log('🎵 Enhanced Audio System Automated Test');
console.log('=======================================');

/**
 * Test AudioManager initialization
 */
async function testInitialization() {
    console.log('\n=== Test 1: AudioManager Initialization ===');

    try {
        const audioManager = new AudioManager({
            audioDevice: 'pulse/alsa_output.platform-fe00b840.mailbox.stereo-fallback',
            backgroundMusicVolume: 70,
            effectsVolume: 100,
            speechVolume: 90,
            duckingVolume: 40
        });

        console.log('✓ AudioManager created with configuration');

        await audioManager.initialize();
        console.log('✓ AudioManager initialized successfully');

        return audioManager;

    } catch (error) {
        console.error('❌ AudioManager initialization failed:', error.message);
        throw error;
    }
}

/**
 * Test background music functionality
 */
async function testBackgroundMusic(audioManager) {
    console.log('\n=== Test 2: Background Music System ===');

    try {
        // Start background music
        console.log('Starting background music...');
        await audioManager.playBackgroundMusic(BACKGROUND_MUSIC, 80);
        console.log('✓ Background music started at volume 80');

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test volume control
        console.log('Testing volume control...');
        await audioManager.setBackgroundMusicVolume(50);
        console.log('✓ Volume set to 50');

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Restore volume
        await audioManager.setBackgroundMusicVolume(80);
        console.log('✓ Volume restored to 80');

        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('✓ Background music system test passed');
        return true;

    } catch (error) {
        console.error('❌ Background music test failed:', error.message);
        return false;
    }
}

/**
 * Test sound effects system
 */
async function testSoundEffects(audioManager) {
    console.log('\n=== Test 3: Sound Effects System ===');

    try {
        console.log('Testing sound effect playback with proper timing...');

        // Test sequential effects with enough time for each to complete
        for (let i = 0; i < 3; i++) {
            console.log(`Playing sound effect ${i + 1}/3...`);
            await audioManager.playSoundEffect(SOUND_EFFECT, 100);
            // Wait longer for effect to complete before playing next one
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('Testing rapid overlapping effects...');
        // Test rapid fire effects to show they can overlap
        for (let i = 0; i < 3; i++) {
            console.log(`Rapid effect ${i + 1}/3...`);
            await audioManager.playSoundEffect(SOUND_EFFECT, 100);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Wait for all rapid effects to finish
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('✓ Sound effects system test passed');
        return true;

    } catch (error) {
        console.error('❌ Sound effects test failed:', error.message);
        return false;
    }
}

/**
 * Test speech with ducking
 */
async function testSpeechWithDucking(audioManager) {
    console.log('\n=== Test 4: Speech with Background Music Ducking ===');

    try {
        console.log('Playing speech with automatic ducking...');

        // Play speech - should automatically duck background music
        await audioManager.playSpeech(SPEECH_AUDIO, 90);
        console.log('✓ Speech queued with automatic ducking');

        // Wait for speech to complete
        console.log('Waiting for speech completion...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('✓ Speech with ducking test passed');
        return true;

    } catch (error) {
        console.error('❌ Speech with ducking test failed:', error.message);
        return false;
    }
}

/**
 * Test queue management
 */
async function testQueueManagement(audioManager) {
    console.log('\n=== Test 5: Queue Management ===');

    try {
        console.log('Testing speech queue management...');

        // Queue multiple speech items
        await audioManager.playSpeech(SPEECH_AUDIO, 90);
        await audioManager.playSpeech(SPEECH_AUDIO, 90);

        console.log('✓ Multiple speech items queued');

        // Wait a bit then clear queue
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('Clearing speech queue...');
        await audioManager.clearSpeechQueue();
        console.log('✓ Speech queue cleared');

        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('✓ Queue management test passed');
        return true;

    } catch (error) {
        console.error('❌ Queue management test failed:', error.message);
        return false;
    }
}

/**
 * Main test execution
 */
async function runTests() {
    console.log('Starting enhanced audio system integration tests...\n');

    let audioManager = null;
    const results = {
        initialization: false,
        backgroundMusic: false,
        soundEffects: false,
        speechDucking: false,
        queueManagement: false
    };

    try {
        // Test 1: Initialization
        audioManager = await testInitialization();
        results.initialization = true;

        // Test 2: Background Music
        results.backgroundMusic = await testBackgroundMusic(audioManager);

        // Test 3: Sound Effects
        results.soundEffects = await testSoundEffects(audioManager);

        // Test 4: Speech with Ducking
        results.speechDucking = await testSpeechWithDucking(audioManager);

        // Test 5: Queue Management
        results.queueManagement = await testQueueManagement(audioManager);

        // Display results
        console.log('\n🏁 Test Results Summary');
        console.log('========================');
        console.log(`Initialization: ${results.initialization ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Background Music: ${results.backgroundMusic ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Sound Effects: ${results.soundEffects ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Speech with Ducking: ${results.speechDucking ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Queue Management: ${results.queueManagement ? '✅ PASS' : '❌ FAIL'}`);

        const allPassed = Object.values(results).every(result => result);
        console.log(`\nOverall Result: ${allPassed ? '🎉 ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED'}`);

        if (allPassed) {
            console.log('\n✅ Enhanced Audio System is ready for production use!');
            console.log('The AudioManager is successfully integrated and all features are working.');
        } else {
            console.log('\n⚠️  Some audio features may need additional configuration or debugging.');
        }

    } catch (error) {
        console.error('Fatal error during testing:', error.message);
        process.exit(1);
    } finally {
        // Cleanup
        if (audioManager) {
            console.log('\nShutting down audio system...');
            await audioManager.shutdown();
            console.log('✓ Audio system shutdown complete');
        }
    }

    console.log('\nIntegration test complete!');

    const allPassed = Object.values(results).every(result => result);
    process.exit(allPassed ? 0 : 1);
}

// Check if test media files exist
const testFiles = [BACKGROUND_MUSIC, SOUND_EFFECT, SPEECH_AUDIO];
const missingFiles = testFiles.filter(file => !fs.existsSync(file));

if (missingFiles.length > 0) {
    console.error('❌ Missing test media files:');
    missingFiles.forEach(file => console.error(`   - ${file}`));
    console.error('\nPlease ensure test media files are available in test/fixtures/test-media/');
    process.exit(1);
}

// Run the tests
runTests().catch(error => {
    console.error('Test suite failed:', error.message);
    process.exit(1);
});
