#!/usr/bin/env node

/**
 * @fileoverview Integration Test for Enhanced Audio System
 * @description Test script to validate the integrated AudioManager in ParadoxFX
 * 
 * This script tests the complete audio system integration including:
 * - AudioManager initialization and configuration
 * - Background music with volume control and ducking
 * - Speech queue with automatic background music coordination
 * - Sound effects with low latency and parallel playback
 * - Integration with screen device and MQTT commands
 * 
 * @author ParadoxFX Team
 * @version 1.0.0
 * @since 2025-01-16
 */

const AudioManager = require('../../lib/media/audio-manager');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Test media files
const BACKGROUND_MUSIC = path.resolve(__dirname, '../../media/test/defaults/default.mp3');
const SOUND_EFFECT = path.resolve(__dirname, '../../media/test/defaults/default_fx.wav');
const SPEECH_AUDIO = path.resolve(__dirname, '../../media/test/defaults/stuff_to_do.mp3');

console.log('🎵 Enhanced Audio System Integration Test');
console.log('==========================================');

/**
 * Test AudioManager initialization
 */
async function testInitialization() {
    console.log('\n=== Test 1: AudioManager Initialization ===');

    try {
        const audioManager = new AudioManager({
            audioDevice: 'pulse/alsa_output.platform-107c701400.hdmi.hdmi-stereo',
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
        console.error('❌ AudioManager initialization failed:', error);
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

        await new Promise(resolve => setTimeout(resolve, 3000));

        // Test volume control
        console.log('Testing volume control...');
        await audioManager.setBackgroundMusicVolume(50);
        console.log('✓ Volume set to 50');

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Restore volume
        await audioManager.setBackgroundMusicVolume(80);
        console.log('✓ Volume restored to 80');

        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('✓ Background music system test passed');
        return true;

    } catch (error) {
        console.error('❌ Background music test failed:', error);
        return false;
    }
}

/**
 * Test sound effects system
 */
async function testSoundEffects(audioManager) {
    console.log('\n=== Test 3: Sound Effects System ===');

    try {
        console.log('Testing rapid sound effect playback...');

        // Test rapid fire effects
        for (let i = 0; i < 5; i++) {
            console.log(`Playing sound effect ${i + 1}/5...`);
            await audioManager.playSoundEffect(SOUND_EFFECT, 100);
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        console.log('✓ Sound effects system test passed');
        return true;

    } catch (error) {
        console.error('❌ Sound effects test failed:', error);
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
        await new Promise(resolve => setTimeout(resolve, 8000));

        console.log('✓ Speech with ducking test passed');
        return true;

    } catch (error) {
        console.error('❌ Speech with ducking test failed:', error);
        return false;
    }
}

/**
 * Test multiple simultaneous audio streams
 */
async function testMultipleStreams(audioManager) {
    console.log('\n=== Test 5: Multiple Simultaneous Audio Streams ===');

    try {
        console.log('Playing multiple audio streams simultaneously...');

        // Background music should still be playing
        // Add sound effects
        await audioManager.playSoundEffect(SOUND_EFFECT, 100);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Add speech (should duck background music)
        await audioManager.playSpeech(SPEECH_AUDIO, 90);

        // Add more sound effects while speech is playing
        await new Promise(resolve => setTimeout(resolve, 1000));
        await audioManager.playSoundEffect(SOUND_EFFECT, 100);
        await new Promise(resolve => setTimeout(resolve, 500));
        await audioManager.playSoundEffect(SOUND_EFFECT, 100);

        console.log('✓ Multiple streams test initiated');

        // Wait for completion
        await new Promise(resolve => setTimeout(resolve, 10000));

        console.log('✓ Multiple streams test passed');
        return true;

    } catch (error) {
        console.error('❌ Multiple streams test failed:', error);
        return false;
    }
}

/**
 * Test fade functionality
 */
async function testFadeFunctionality(audioManager) {
    console.log('\n=== Test 7: Fade Functionality ===');

    try {
        // Start background music for fade testing
        console.log('Starting background music for fade test...');
        await audioManager.playBackgroundMusic(BACKGROUND_MUSIC, 80);
        console.log('✓ Background music started');

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test fade out background music
        console.log('Testing fade out background music...');
        await audioManager.fadeBackgroundMusic(0, 3000); // Fade to 0 over 3 seconds
        console.log('✓ Background music fade initiated');

        await new Promise(resolve => setTimeout(resolve, 3500));

        // Restart background music
        console.log('Restarting background music...');
        await audioManager.playBackgroundMusic(BACKGROUND_MUSIC, 80);
        console.log('✓ Background music restarted');

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test fade out speech (if speech is playing)
        console.log('Testing speech fade...');
        await audioManager.playSpeech(SPEECH_AUDIO, 90);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Let speech start

        await audioManager.fadeSpeech(0, 2000); // Fade speech to 0 over 2 seconds
        console.log('✓ Speech fade initiated');

        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('✓ Fade functionality test passed');
        return true;

    } catch (error) {
        console.error('❌ Fade functionality test failed:', error);
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
        multipleStreams: false,
        queueManagement: false,
        fadeFunctionality: false
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

        // Test 5: Multiple Streams
        results.multipleStreams = await testMultipleStreams(audioManager);

        // Test 6: Queue Management
        results.queueManagement = await testQueueManagement(audioManager);

        // Test 7: Fade Functionality
        results.fadeFunctionality = await testFadeFunctionality(audioManager);

        // Display results
        console.log('\n🏁 Test Results Summary');
        console.log('========================');
        console.log(`Initialization: ${results.initialization ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Background Music: ${results.backgroundMusic ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Sound Effects: ${results.soundEffects ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Speech with Ducking: ${results.speechDucking ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Multiple Streams: ${results.multipleStreams ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Queue Management: ${results.queueManagement ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Fade Functionality: ${results.fadeFunctionality ? '✅ PASS' : '❌ FAIL'}`);

        const allPassed = Object.values(results).every(result => result);
        console.log(`\nOverall Result: ${allPassed ? '🎉 ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED'}`);

        if (allPassed) {
            console.log('\n✅ Enhanced Audio System is ready for production use!');
            console.log('The AudioManager is successfully integrated and all features are working.');
        } else {
            console.log('\n⚠️  Some audio features may need additional configuration or debugging.');
        }

        return { allPassed, results };

    } catch (error) {
        console.error('Fatal error during testing:', error);
        throw error;
    } finally {
        // Cleanup
        if (audioManager) {
            console.log('Shutting down audio system...');
            await audioManager.shutdown();
            console.log('✓ Audio system shutdown complete');
        }
    }
}

// Export runTests so wrapper tests can import and run it under Jest
module.exports = module.exports || {};
module.exports.runTests = runTests;

// Check if test media files exist
const testFiles = [BACKGROUND_MUSIC, SOUND_EFFECT, SPEECH_AUDIO];
const missingFiles = testFiles.filter(file => !fs.existsSync(file));

if (missingFiles.length > 0) {
    const msg = ['❌ Missing test media files:'];
    missingFiles.forEach(file => msg.push(`   - ${file}`));
    msg.push('\nPlease ensure test media files are available in media/test/defaults/');

    // If this file is executed as a script, print and exit with error.
    if (require.main === module) {
        console.error(msg.join('\n'));
        process.exit(1);
    } else {
        // If imported (e.g., by Jest), throw so the caller can handle it.
        throw new Error(msg.join('\n'));
    }
}

// NOTE: This file is now importable for Jest wrappers. Do not run automatically.
// If you need to run as CLI, use the companion CLI script or run via Node explicitly.
