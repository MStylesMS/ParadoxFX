#!/usr/bin/env node
/**
 * ParadoxFX Pi3 Screen Test Script
 * 
 * Optimized for Raspberry Pi 3 running Raspberry Pi OS Bullseye (Legacy)
 * with hardware video acceleration via VideoCore IV GPU.
 * 
 * ==========================================
 * RASPBERRY PI 3 SETUP INSTRUCTIONS
 * ==========================================
 * 
 * 1. INSTALL RASPBERRY PI OS BULLSEYE (LEGACY)
 *    - Download from: https://www.raspberrypi.com/software/operating-systems/
 *    - Choose "Raspberry Pi OS (Legacy)" - this includes the old GPU drivers
 *    - Flash to SD card using Raspberry Pi Imager
 * 
 * 2. CONFIGURE GPU MEMORY SPLIT
 *    Add to /boot/config.txt:
 *    ```
 *    gpu_mem=128
 *    # For 1GB Pi3, you can use gpu_mem=256 for better video performance
 *    ```
 * 
 * 3. INSTALL REQUIRED PACKAGES
 *    ```bash
 *    sudo apt update
 *    sudo apt install mpv vlc-bin vlc-plugin-base fbi nodejs npm git
 *    ```
 * 
 * 4. CONFIGURE AUDIO (if using HDMI)
 *    ```bash
 *    # Force HDMI audio output
 *    sudo amixer cset numid=3 2
 *    
 *    # Or add to /boot/config.txt:
 *    hdmi_drive=2
 *    hdmi_force_hotplug=1
 *    ```
 * 
 * 5. VERIFY GPU ACCELERATION
 *    ```bash
 *    # Check GPU memory
 *    vcgencmd get_mem gpu
 *    
 *    # Test hardware decode
 *    mpv --hwdec=mmal --vo=gpu /opt/vc/src/hello_pi/hello_video/test.h264
 *    ```
 * 
 * 6. PERFORMANCE RECOMMENDATIONS
 *    - Use H.264 encoded videos (best hardware acceleration)
 *    - Limit to 1080p @ 30fps maximum
 *    - Use moderate bitrates (2-8 Mbps)
 *    - Avoid 4K content (will fallback to software decode)
 * 
 * ==========================================
 * OPTIMIZED MEDIA PLAYER SETTINGS
 * ==========================================
 * 
 * This script uses Pi3-optimized player configurations:
 * 
 * VIDEO (MPV with MMAL hardware decode):
 * - --hwdec=mmal              # Use hardware decoder
 * - --vo=gpu                  # Use GPU video output
 * - --cache=yes --cache-secs=10  # Buffer for smooth playback
 * - --profile=gpu-hq          # High quality GPU rendering
 * 
 * VIDEO FALLBACK (VLC with hardware acceleration):
 * - --codec=avcodec           # Use hardware-accelerated codecs
 * - --avcodec-hw=mmal         # MMAL hardware acceleration
 * 
 * IMAGES (FBI for framebuffer):
 * - Optimized for console/framebuffer display
 * - Lower memory usage than X11-based viewers
 * 
 */

const fs = require('fs').promises;
const { spawn, exec } = require('child_process');
const path = require('path');

class Pi3ScreenTester {
    constructor() {
        this.testResults = [];
        this.mediaDir = '/opt/paradox/apps/pfx/test/fixtures/test-media';

        // Pi3-optimized player configurations
        this.playerConfigs = {
            mpv: {
                video: [
                    '--hwdec=mmal',           // Hardware decode via MMAL
                    '--vo=gpu',               // GPU video output
                    '--cache=yes',            // Enable caching
                    '--cache-secs=10',        // 10 second cache
                    '--profile=gpu-hq',       // High quality GPU profile
                    '--fullscreen',           // Full screen display
                    '--quiet',                // Reduce log output
                    '--no-terminal',          // No terminal control
                    '--osd-level=0'           // No on-screen display
                ],
                audio: [
                    '--no-video',             // Audio only
                    '--quiet',
                    '--no-terminal'
                ]
            },
            vlc: {
                video: [
                    '--intf', 'dummy',        // No interface
                    '--fullscreen',           // Full screen
                    '--no-audio-display',     // No audio visualization
                    '--codec=avcodec',        // Use hardware codecs
                    '--avcodec-hw=mmal',      // MMAL acceleration
                    '--play-and-exit'         // Exit after playing
                ],
                audio: [
                    '--intf', 'dummy',
                    '--no-video',
                    '--play-and-exit'
                ]
            },
            fbi: {
                image: [
                    '--noverbose',            // Quiet operation
                    '--autozoom',             // Auto-fit to screen
                    '--timeout', '5'          // 5 second timeout for test
                ]
            }
        };
    }

    async checkPi3Requirements() {
        console.log('🔍 Checking Raspberry Pi 3 Requirements...\n');

        const checks = [
            { name: 'GPU Memory', check: () => this.checkGpuMemory() },
            { name: 'MPV Installation', check: () => this.checkCommand('mpv') },
            { name: 'VLC Installation', check: () => this.checkCommand('vlc') },
            { name: 'FBI Installation', check: () => this.checkCommand('fbi') },
            { name: 'VideoCore Commands', check: () => this.checkCommand('vcgencmd') },
            { name: 'Test Media Files', check: () => this.checkTestMedia() }
        ];

        let allPassed = true;
        for (const check of checks) {
            try {
                const result = await check.check();
                console.log(`✅ ${check.name}: ${result}`);
            } catch (error) {
                console.log(`❌ ${check.name}: ${error.message}`);
                allPassed = false;
            }
        }

        if (!allPassed) {
            console.log('\n⚠️  Some requirements are missing. Please follow the setup instructions above.');
            return false;
        }

        console.log('\n✅ All Pi3 requirements satisfied!\n');
        return true;
    }

    async checkGpuMemory() {
        return new Promise((resolve, reject) => {
            exec('vcgencmd get_mem gpu', (error, stdout, stderr) => {
                if (error) {
                    reject(new Error('vcgencmd not available'));
                    return;
                }

                const match = stdout.match(/gpu=(\d+)M/);
                if (!match) {
                    reject(new Error('Could not parse GPU memory'));
                    return;
                }

                const gpuMem = parseInt(match[1]);
                if (gpuMem < 64) {
                    reject(new Error(`GPU memory too low: ${gpuMem}M (recommend 128M+)`));
                    return;
                }

                resolve(`${gpuMem}M allocated`);
            });
        });
    }

    async checkCommand(command) {
        return new Promise((resolve, reject) => {
            exec(`which ${command}`, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`${command} not installed`));
                    return;
                }
                resolve('installed');
            });
        });
    }

    async checkTestMedia() {
        try {
            const files = await fs.readdir(this.mediaDir);
            const mediaFiles = files.filter(f =>
                f.endsWith('.mp4') || f.endsWith('.jpg') || f.endsWith('.mp3')
            );

            if (mediaFiles.length === 0) {
                throw new Error('No test media files found');
            }

            return `${mediaFiles.length} test files found`;
        } catch (error) {
            throw new Error(`Test media directory not accessible: ${error.message}`);
        }
    }

    async testImageDisplay() {
        console.log('🖼️  Testing Image Display with FBI...\n');

        try {
            const imageFiles = await this.findMediaFiles('.jpg', '.png', '.bmp');
            if (imageFiles.length === 0) {
                throw new Error('No image files found for testing');
            }

            for (const imageFile of imageFiles.slice(0, 3)) { // Test first 3 images
                console.log(`📸 Displaying: ${imageFile}`);

                const success = await this.runPlayer('fbi', 'image', imageFile);
                this.testResults.push({
                    type: 'Image',
                    file: imageFile,
                    player: 'fbi',
                    result: success ? 'PASS' : 'FAIL'
                });

                if (success) {
                    console.log('✅ Image displayed successfully');
                } else {
                    console.log('❌ Image display failed');
                }

                // Brief pause between images
                await this.delay(1000);
            }
        } catch (error) {
            console.error('❌ Image test failed:', error.message);
        }
    }

    async testVideoPlayback() {
        console.log('\n🎥 Testing Video Playback with Hardware Acceleration...\n');

        try {
            const videoFiles = await this.findMediaFiles('.mp4', '.mkv', '.avi');
            if (videoFiles.length === 0) {
                throw new Error('No video files found for testing');
            }

            for (const videoFile of videoFiles.slice(0, 2)) { // Test first 2 videos
                // Test MPV with hardware acceleration first
                console.log(`🎬 Testing MPV (hardware): ${videoFile}`);
                let success = await this.runPlayer('mpv', 'video', videoFile);

                this.testResults.push({
                    type: 'Video',
                    file: videoFile,
                    player: 'mpv (hardware)',
                    result: success ? 'PASS' : 'FAIL'
                });

                if (success) {
                    console.log('✅ MPV hardware playback successful');
                } else {
                    console.log('⚠️  MPV hardware failed, trying VLC...');

                    // Fallback to VLC
                    success = await this.runPlayer('vlc', 'video', videoFile);
                    this.testResults.push({
                        type: 'Video',
                        file: videoFile,
                        player: 'vlc (fallback)',
                        result: success ? 'PASS' : 'FAIL'
                    });

                    if (success) {
                        console.log('✅ VLC fallback successful');
                    } else {
                        console.log('❌ Both MPV and VLC failed');
                    }
                }

                await this.delay(2000);
            }
        } catch (error) {
            console.error('❌ Video test failed:', error.message);
        }
    }

    async testAudioPlayback() {
        console.log('\n🔊 Testing Audio Playback...\n');

        try {
            const audioFiles = await this.findMediaFiles('.mp3', '.wav', '.ogg');
            if (audioFiles.length === 0) {
                throw new Error('No audio files found for testing');
            }

            for (const audioFile of audioFiles.slice(0, 2)) { // Test first 2 audio files
                console.log(`🎵 Playing audio: ${audioFile}`);

                const success = await this.runPlayer('mpv', 'audio', audioFile);
                this.testResults.push({
                    type: 'Audio',
                    file: audioFile,
                    player: 'mpv',
                    result: success ? 'PASS' : 'FAIL'
                });

                if (success) {
                    console.log('✅ Audio playback successful');
                } else {
                    console.log('❌ Audio playback failed');
                }

                await this.delay(1000);
            }
        } catch (error) {
            console.error('❌ Audio test failed:', error.message);
        }
    }

    async findMediaFiles(...extensions) {
        const files = await fs.readdir(this.mediaDir);
        return files.filter(file =>
            extensions.some(ext => file.toLowerCase().endsWith(ext))
        );
    }

    async runPlayer(player, mediaType, filename) {
        const filePath = path.join(this.mediaDir, filename);
        const config = this.playerConfigs[player];

        if (!config || !config[mediaType]) {
            throw new Error(`No configuration for ${player} ${mediaType}`);
        }

        const args = [...config[mediaType], filePath];

        // For testing, limit playback time
        if (player === 'mpv') {
            if (mediaType === 'video') {
                args.splice(-1, 0, '--length=5'); // Play 5 seconds of video
            } else if (mediaType === 'audio') {
                args.splice(-1, 0, '--length=3'); // Play 3 seconds of audio
            }
        }

        return new Promise((resolve) => {
            console.log(`   Command: ${player} ${args.join(' ')}`);

            const process = spawn(player, args, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let outputReceived = false;

            process.stdout.on('data', (data) => {
                outputReceived = true;
            });

            process.stderr.on('data', (data) => {
                const output = data.toString();
                // Check for hardware acceleration confirmation
                if (output.includes('mmal') || output.includes('gpu')) {
                    console.log('   ✓ Hardware acceleration detected');
                }
                outputReceived = true;
            });

            process.on('close', (code) => {
                // For media players, exit code 0 usually means success
                // Some players might exit with different codes after completing playback
                const success = (code === 0 || code === null) && outputReceived;
                resolve(success);
            });

            process.on('error', (error) => {
                console.log(`   ❌ Process error: ${error.message}`);
                resolve(false);
            });

            // Timeout for safety
            setTimeout(() => {
                if (!process.killed) {
                    process.kill('SIGTERM');
                    setTimeout(() => {
                        if (!process.killed) {
                            process.kill('SIGKILL');
                        }
                    }, 2000);
                }
            }, 15000);
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    printResults() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 PI3 SCREEN TEST RESULTS');
        console.log('='.repeat(60));

        const summary = { PASS: 0, FAIL: 0 };

        this.testResults.forEach(result => {
            const status = result.result === 'PASS' ? '✅' : '❌';
            console.log(`${status} ${result.type}: ${result.file} (${result.player})`);
            summary[result.result]++;
        });

        console.log('\n📈 Summary:');
        console.log(`   Passed: ${summary.PASS}`);
        console.log(`   Failed: ${summary.FAIL}`);
        console.log(`   Total:  ${this.testResults.length}`);

        if (summary.FAIL > 0) {
            console.log('\n💡 Troubleshooting Tips:');
            console.log('   - Ensure GPU memory is set to 128M+ in /boot/config.txt');
            console.log('   - Verify you are running Raspberry Pi OS Bullseye (Legacy)');
            console.log('   - Check that video files are H.264 encoded');
            console.log('   - Try rebooting after changing /boot/config.txt');
        }

        console.log('\n🎯 Pi3-Optimized ParadoxFX is ready for testing!');
    }

    async run() {
        console.log('🍓 ParadoxFX Raspberry Pi 3 Screen Test Suite');
        console.log('==========================================\n');

        const requirementsMet = await this.checkPi3Requirements();
        if (!requirementsMet) {
            console.log('❌ Please address the requirements above before running tests.');
            process.exit(1);
        }

        await this.testImageDisplay();
        await this.testVideoPlayback();
        await this.testAudioPlayback();

        this.printResults();
    }
}

// Main execution
if (require.main === module) {
    const tester = new Pi3ScreenTester();
    tester.run().catch(console.error);
}

module.exports = Pi3ScreenTester;
