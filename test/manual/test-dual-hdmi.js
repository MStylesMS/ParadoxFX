#!/usr/bin/env node
/**
 * @fileoverview Pi5 Dual HDMI Audio Test
 * @description Test both HDMI outputs on Raspberry Pi 5 for multi-zone audio
 * 
 * This script validates that both HDMI outputs can handle audio independently,
 * which is crucial for ParadoxFX multi-screen audio routing.
 * 
 * @author ParadoxFX Team
 * @version 1.0.0
 * @since 2025-07-18
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Test media files
const BACKGROUND_MUSIC = path.resolve(__dirname, '../../media/test/defaults/houdini_music.mp3');
const SOUND_EFFECT = path.resolve(__dirname, '../../media/test/defaults/default_fx.wav');

// Pi5 HDMI audio devices
const HDMI_0_DEVICE = 'pulse/alsa_output.platform-107c701400.hdmi.hdmi-stereo';
const HDMI_1_DEVICE = 'pulse/alsa_output.platform-107c706400.hdmi.hdmi-stereo';

console.log('🍓 Pi5 Dual HDMI Audio Test');
console.log('===========================');
console.log('This test validates independent audio routing to both HDMI outputs.');
console.log('Make sure you have displays/speakers connected to both HDMI ports.\n');

function askQuestion(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase().trim());
        });
    });
}

function playAudio(device, audioFile, description) {
    return new Promise((resolve) => {
        console.log(`🎵 Playing: ${description}`);
        console.log(`   Device: ${device}`);
        console.log(`   File: ${audioFile}`);

        const mpv = spawn('mpv', [
            '--no-video',
            '--volume=80',
            `--audio-device=${device}`,
            '--really-quiet',
            audioFile
        ]);

        mpv.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Playback completed successfully');
            } else {
                console.log('❌ Playback failed');
            }
            resolve(code === 0);
        });

        mpv.on('error', (error) => {
            console.log(`❌ Playback error: ${error.message}`);
            resolve(false);
        });
    });
}

async function testSequentialAudio() {
    console.log('\n=== Test 1: Sequential Audio on Both HDMI Outputs ===');

    // Test HDMI-0
    console.log('\n📺 Testing HDMI-0 (first HDMI port)...');
    const hdmi0Result = await playAudio(HDMI_0_DEVICE, SOUND_EFFECT, 'HDMI-0 Audio Test');

    if (hdmi0Result) {
        const heard0 = await askQuestion('Did you hear audio from HDMI-0? (y/n): ');
        if (heard0 !== 'y') {
            console.log('⚠️  HDMI-0 audio may need attention');
        }
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test HDMI-1
    console.log('\n📺 Testing HDMI-1 (second HDMI port)...');
    const hdmi1Result = await playAudio(HDMI_1_DEVICE, SOUND_EFFECT, 'HDMI-1 Audio Test');

    if (hdmi1Result) {
        const heard1 = await askQuestion('Did you hear audio from HDMI-1? (y/n): ');
        if (heard1 !== 'y') {
            console.log('⚠️  HDMI-1 audio may need attention');
        }
    }

    return { hdmi0: hdmi0Result, hdmi1: hdmi1Result };
}

async function testSimultaneousAudio() {
    console.log('\n=== Test 2: Simultaneous Audio on Both HDMI Outputs ===');
    console.log('Playing different audio on both HDMI outputs simultaneously...');

    // Start background music on HDMI-0
    const hdmi0Process = spawn('mpv', [
        '--no-video',
        '--volume=70',
        `--audio-device=${HDMI_0_DEVICE}`,
        '--loop-file=inf',
        '--really-quiet',
        BACKGROUND_MUSIC
    ]);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start sound effects on HDMI-1
    const hdmi1Process = spawn('mpv', [
        '--no-video',
        '--volume=80',
        `--audio-device=${HDMI_1_DEVICE}`,
        '--loop-file=inf',
        '--really-quiet',
        SOUND_EFFECT
    ]);

    console.log('🎵 Background music playing on HDMI-0, sound effects on HDMI-1');
    console.log('You should hear different audio from each HDMI output...');

    await new Promise(resolve => setTimeout(resolve, 5000));

    const simultaneousHeard = await askQuestion('Did you hear different audio from each HDMI port? (y/n): ');

    // Cleanup
    hdmi0Process.kill();
    hdmi1Process.kill();

    await new Promise(resolve => setTimeout(resolve, 1000));

    return simultaneousHeard === 'y';
}

async function testAudioManagerWithBothOutputs() {
    console.log('\n=== Test 3: AudioManager Integration Test ===');
    console.log('Testing AudioManager with HDMI-0, then HDMI-1...');

    const AudioManager = require('../../lib/media/audio-manager');

    // Test with HDMI-0
    console.log('\n📺 Testing AudioManager with HDMI-0...');
    const audioManager0 = new AudioManager({
        audioDevice: HDMI_0_DEVICE,
        backgroundMusicVolume: 70,
        effectsVolume: 100
    });

    await audioManager0.initialize();
    await audioManager0.playBackgroundMusic(BACKGROUND_MUSIC, 70);

    await new Promise(resolve => setTimeout(resolve, 2000));

    await audioManager0.playSoundEffect(SOUND_EFFECT, 100);

    await new Promise(resolve => setTimeout(resolve, 2000));

    await audioManager0.shutdown();

    const manager0Heard = await askQuestion('Did AudioManager work correctly with HDMI-0? (y/n): ');

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test with HDMI-1
    console.log('\n📺 Testing AudioManager with HDMI-1...');
    const audioManager1 = new AudioManager({
        audioDevice: HDMI_1_DEVICE,
        backgroundMusicVolume: 70,
        effectsVolume: 100
    });

    await audioManager1.initialize();
    await audioManager1.playBackgroundMusic(BACKGROUND_MUSIC, 70);

    await new Promise(resolve => setTimeout(resolve, 2000));

    await audioManager1.playSoundEffect(SOUND_EFFECT, 100);

    await new Promise(resolve => setTimeout(resolve, 2000));

    await audioManager1.shutdown();

    const manager1Heard = await askQuestion('Did AudioManager work correctly with HDMI-1? (y/n): ');

    return { hdmi0: manager0Heard === 'y', hdmi1: manager1Heard === 'y' };
}

async function main() {
    // Check test files exist
    const testFiles = [BACKGROUND_MUSIC, SOUND_EFFECT];
    const missingFiles = testFiles.filter(file => !fs.existsSync(file));

    if (missingFiles.length > 0) {
        console.error('❌ Missing test media files:');
        missingFiles.forEach(file => console.error(`   - ${file}`));
        process.exit(1);
    }

    try {
        console.log('🔧 Verifying Pi5 HDMI audio devices are available...');

        // Test 1: Sequential audio
        const sequentialResults = await testSequentialAudio();

        // Test 2: Simultaneous audio
        const simultaneousResult = await testSimultaneousAudio();

        // Test 3: AudioManager integration
        const managerResults = await testAudioManagerWithBothOutputs();

        // Results summary
        console.log('\n🏁 Pi5 Dual HDMI Test Results');
        console.log('==============================');
        console.log(`HDMI-0 Sequential: ${sequentialResults.hdmi0 ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`HDMI-1 Sequential: ${sequentialResults.hdmi1 ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Simultaneous Audio: ${simultaneousResult ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`AudioManager HDMI-0: ${managerResults.hdmi0 ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`AudioManager HDMI-1: ${managerResults.hdmi1 ? '✅ PASS' : '❌ FAIL'}`);

        const allTests = [
            sequentialResults.hdmi0,
            sequentialResults.hdmi1,
            simultaneousResult,
            managerResults.hdmi0,
            managerResults.hdmi1
        ];

        const allPassed = allTests.every(result => result);

        console.log(`\nOverall Result: ${allPassed ? '🎉 ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED'}`);

        if (allPassed) {
            console.log('\n✅ Pi5 is ready for multi-zone ParadoxFX audio!');
            console.log('Both HDMI outputs can handle independent audio routing.');
        } else {
            console.log('\n⚠️  Some HDMI audio outputs may need configuration.');
            console.log('Check display connections and audio settings.');
        }

        console.log('\n💡 Configuration Summary for pfx.ini:');
        console.log(`   Zone 1 (HDMI-0): ${HDMI_0_DEVICE}`);
        console.log(`   Zone 2 (HDMI-1): ${HDMI_1_DEVICE}`);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
