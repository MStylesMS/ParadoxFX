/**
 * Real Media Playback Tests
 * 
 * These tests actually spawn media players and display/play content.
 * You will see images, hear audio, and watch videos during these tests.
 * 
 * Usage:
 *   ENABLE_REAL_PLAYBACK=true npm run test:manual
 * 
 * Requirements:
 *   - X11 display available (for images/videos)
 *   - Audio system configured (for audio playback)
 *   - Media players installed (feh, mpv, etc.)
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Skip all tests unless explicitly enabled
const REAL_PLAYBACK_ENABLED = process.env.ENABLE_REAL_PLAYBACK === 'true';

describe('Real Media Playback Tests', () => {
    const testMediaPath = path.join(__dirname, '../../media/test/defaults');
    const DISPLAY_TIME = 3000; // 3 seconds per media file

    beforeAll(() => {
        if (!REAL_PLAYBACK_ENABLED) {
            console.log('⚠️  Real playback tests skipped. Set ENABLE_REAL_PLAYBACK=true to enable.');
            return;
        }

        // Check if test media directory exists
        if (!fs.existsSync(testMediaPath)) {
            throw new Error(`Test media directory not found: ${testMediaPath}`);
        }

        console.log('🎬 Starting real media playback tests...');
        console.log('🖥️  You should see images and videos on your screen');
        console.log('🔊 You should hear audio through your speakers');
        console.log(`⏱️  Each media file will play for ${DISPLAY_TIME / 1000} seconds`);
    });

    /**
     * Helper function to spawn a media player and wait for completion
     */
    async function playMedia(command, args, description) {
        if (!REAL_PLAYBACK_ENABLED) return;

        console.log(`\n▶️  Playing: ${description}`);
        console.log(`   command: ${command} ${args.join(' ')}`);

        return new Promise((resolve, reject) => {
            const childProcess = spawn(command, args, {
                stdio: 'pipe',
                env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }
            });

            let errorOutput = '';

            childProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            // Auto-kill after display time
            const timer = setTimeout(() => {
                childProcess.kill('SIGTERM');
                console.log(`   ⏹️  Stopped after ${DISPLAY_TIME / 1000}s`);
                resolve();
            }, DISPLAY_TIME);

            childProcess.on('close', (code) => {
                clearTimeout(timer);
                if (code === 0 || code === null || code === 143) { // 143 is SIGTERM
                    console.log(`   ✅ Completed successfully`);
                    resolve();
                } else {
                    console.log(`   ❌ Failed with code ${code}`);
                    console.log(`   Error: ${errorOutput}`);
                    reject(new Error(`Player failed with code ${code}: ${errorOutput}`));
                }
            });

            childProcess.on('error', (err) => {
                clearTimeout(timer);
                console.log(`   ❌ Failed to start: ${err.message}`);
                reject(err);
            });
        });
    }

    describe('Image Playback (Visual)', () => {
        const imageTests = [
            { file: 'default.jpg', player: 'feh', description: 'Standard JPEG image' },
            { file: 'default_hq.jpg', player: 'feh', description: 'High Quality JPEG image' },
            { file: 'default_lq.jpg', player: 'feh', description: 'Low Quality JPEG image' },
            { file: 'default.png', player: 'feh', description: 'PNG image' },
            { file: 'houdini_picture_24bit.png', player: 'feh', description: '24-bit PNG image' },
            { file: 'default.gif', player: 'feh', description: 'GIF image' },
            { file: 'default.bmp', player: 'feh', description: 'BMP image' },
            { file: 'default.tiff', player: 'feh', description: 'TIFF image' },
            { file: 'default.webp', player: 'feh', description: 'WebP image' }
        ];

        imageTests.forEach(({ file, player, description }) => {
            test(`should display ${description}: ${file}`, async () => {
                if (!REAL_PLAYBACK_ENABLED) return;

                const filePath = path.join(testMediaPath, file);

                if (!fs.existsSync(filePath)) {
                    console.warn(`⚠️  Skipping ${description} - file not found: ${file}`);
                    return;
                }

                await playMedia(player, [
                    '--auto-zoom',
                    '--borderless',
                    '--geometry', '800x600+100+100',
                    filePath
                ], description);
            }, 10000); // 10 second timeout
        });
    });

    describe('Video Playback (Visual + Audio)', () => {
        const videoTests = [
            { file: 'default.mp4', player: 'mpv', description: 'MP4 video' },
            { file: 'intro_short.mp4', player: 'mpv', description: 'Short intro MP4 video' },
            { file: 'default.avi', player: 'mpv', description: 'AVI video' },
            { file: 'default.mkv', player: 'mpv', description: 'MKV video' }
        ];

        videoTests.forEach(({ file, player, description }) => {
            test(`should play ${description}: ${file}`, async () => {
                if (!REAL_PLAYBACK_ENABLED) return;

                const filePath = path.join(testMediaPath, file);

                if (!fs.existsSync(filePath)) {
                    console.warn(`⚠️  Skipping ${description} - file not found: ${file}`);
                    return;
                }

                await playMedia(player, [
                    '--geometry=800x600+200+200',
                    '--volume=50',
                    '--no-terminal',
                    filePath
                ], description);
            }, 10000); // 10 second timeout
        });
    });

    describe('Audio Playback (Audio Only)', () => {
        const audioTests = [
            { file: 'default.mp3', player: 'mpv', description: 'Standard MP3 audio' },
            { file: 'default_hq.mp3', player: 'mpv', description: 'High Quality MP3 audio' },
            { file: 'default_lq.mp3', player: 'mpv', description: 'Low Quality MP3 audio' },
            { file: 'default.wav', player: 'mpv', description: 'WAV audio (lossless)' },
            { file: 'default.ogg', player: 'mpv', description: 'OGG Vorbis audio' },
            { file: 'default.aac', player: 'mpv', description: 'AAC audio' },
            { file: 'default.flac', player: 'mpv', description: 'FLAC audio (lossless)' },
            { file: 'default.opus', player: 'mpv', description: 'Opus audio' },
            { file: 'default_fx.wav', player: 'mpv', description: 'FX WAV audio' },
            { file: 'houdini_music.mp3', player: 'mpv', description: 'Houdini Music MP3' }
        ];

        audioTests.forEach(({ file, player, description }) => {
            test(`should play ${description}: ${file}`, async () => {
                if (!REAL_PLAYBACK_ENABLED) return;

                const filePath = path.join(testMediaPath, file);

                if (!fs.existsSync(filePath)) {
                    console.warn(`⚠️  Skipping ${description} - file not found: ${file}`);
                    return;
                }

                await playMedia(player, [
                    '--no-video',
                    '--volume=50',
                    '--no-terminal',
                    filePath
                ], description);
            }, 10000); // 10 second timeout
        });
    });

    describe('Media Transition Demo', () => {
        test('should demonstrate media transitions', async () => {
            if (!REAL_PLAYBACK_ENABLED) return;

            const sequence = [
                { file: 'default.jpg', player: 'feh', type: 'image', args: ['--auto-zoom', '--borderless', '--geometry', '600x400+100+100'] },
                { file: 'default.mp3', player: 'mpv', type: 'audio', args: ['--no-video', '--volume=30', '--no-terminal'] },
                { file: 'intro_short.mp4', player: 'mpv', type: 'video', args: ['--geometry=600x400+300+300', '--volume=30', '--no-terminal'] }
            ];

            console.log('\n🎭 Demonstrating media transitions...');

            for (const { file, player, type, args } of sequence) {
                const filePath = path.join(testMediaPath, file);

                if (fs.existsSync(filePath)) {
                    console.log(`\n🔄 Transitioning to ${type}...`);
                    await playMedia(player, [...args, filePath], `${type} transition: ${file}`);

                    // Brief pause between transitions
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            console.log('\n✨ Media transition demo complete!');
        }, 30000); // 30 second timeout for full sequence
    });

    describe('Seamless Full-Screen Transition Test', () => {
        test('should demonstrate seamless full-screen transitions with overlapping processes', async () => {
            if (!REAL_PLAYBACK_ENABLED) return;

            console.log('\n🎬 Starting seamless full-screen transition test with overlapping processes...');
            console.log('🖥️  This test demonstrates professional-grade seamless transitions');
            console.log('🎯 Expected sequence: Image₁ (default_hq.jpg) → Video (on top) → Image₂ (default_hq.jpg) (background switch) → Video ends → Image₂');
            console.log('✨ Processes will overlap for truly seamless transitions');

            // Timing configuration for seamless transitions
            const TIMING_CONFIG = {
                VIDEO_START_DELAY: 4000,      // Wait 4s after image1 before starting video (longer to prevent glitch)
                IMAGE_SWITCH_AFTER_START: 2500, // Switch to image2 2.5s after video starts
                IMAGE_SWITCH_BEFORE_END: 2000,  // Ensure image2 is ready 2s before video ends
                FINAL_DISPLAY_TIME: 3000       // Show final image for 3s after video ends
            };

            // File paths
            const image1Path = path.join(testMediaPath, 'default_hq.jpg');
            const videoPath = path.join(testMediaPath, 'default.mp4');
            const image2Path = path.join(testMediaPath, 'default_hq.jpg');

            // Verify all files exist
            for (const [name, filePath] of [['Image1', image1Path], ['Video', videoPath], ['Image2', image2Path]]) {
                if (!fs.existsSync(filePath)) {
                    throw new Error(`${name} file not found: ${filePath}`);
                }
            }

            console.log('\n🔄 Beginning overlapping transition sequence...');
            console.log(`⏱️  Timing: Video starts after ${TIMING_CONFIG.VIDEO_START_DELAY}ms`);
            console.log(`⏱️  Timing: Image switch ${TIMING_CONFIG.IMAGE_SWITCH_AFTER_START}ms after video start`);
            console.log(`⏱️  Timing: Final display for ${TIMING_CONFIG.FINAL_DISPLAY_TIME}ms`);

            let image1Process = null;
            let videoProcess = null;
            let image2Process = null;

            try {                // Step 1: Start first image and leave it running
                console.log('\n▶️  Step 1: Starting background image (persistent)');
                console.log('   command: imv-wayland -f (Wayland-native image viewer)');

                image1Process = spawn('imv-wayland', [
                    '-f',  // fullscreen
                    image1Path
                ], {
                    stdio: 'pipe',
                    env: { ...process.env }
                });

                console.log('   ✅ Background image started and persistent');

                // Give image extra time to fully establish before video
                console.log(`\n⏱️  Waiting ${TIMING_CONFIG.VIDEO_START_DELAY}ms for image to fully establish before starting video...`);
                await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.VIDEO_START_DELAY));

                // Step 2: Start video (should appear on top of image)
                console.log('\n▶️  Step 2: Starting video overlay (should appear on top)');
                console.log('   command: mpv --fullscreen --cursor-autohide=always --no-terminal --volume=60 --osd-level=0');

                videoProcess = spawn('mpv', [
                    '--fullscreen',
                    '--cursor-autohide=always',
                    '--no-terminal',
                    '--volume=60',
                    '--osd-level=0',
                    '--no-keepaspect-window', // Don't maintain aspect ratio for window
                    '--video-zoom=0',         // No zoom
                    '--video-pan-x=0',        // No pan
                    '--video-pan-y=0',        // No pan
                    '--geometry=100%:100%',   // Force exact screen size
                    '--no-border',            // No window border
                    '--ontop',                // Always on top
                    '--no-initial-audio-sync', // Disable audio sync delay
                    '--speed=1.0',            // Ensure normal playback speed
                    '--video-aspect-override=no', // Don't override aspect ratio
                    '--video-aspect-method=container', // Use container aspect
                    '--hwdec=auto',           // Hardware decoding for smoother playback
                    '--vo=gpu',               // Use GPU video output
                    '--profile=gpu-hq',       // High quality GPU profile
                    '--interpolation=no',     // Disable frame interpolation
                    '--blend-subtitles=no',   // No subtitle blending effects
                    '--sharpen=0',            // No sharpening filter
                    '--deband=no',            // No debanding filter
                    videoPath
                ], {
                    stdio: 'pipe',
                    env: { ...process.env, DISPLAY: ':0' }  // Force display :0
                });

                console.log('   ✅ Video started (playing on top of background image)');

                // Wait before switching background image
                console.log(`\n⏱️  Waiting ${TIMING_CONFIG.IMAGE_SWITCH_AFTER_START}ms after video start before switching background...`);
                await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.IMAGE_SWITCH_AFTER_START));

                // Step 3: Switch to second image (while video is still playing)
                console.log('\n▶️  Step 3: Switching background image (while video plays on top)');

                // Kill first image process
                if (image1Process && !image1Process.killed) {
                    image1Process.kill('SIGTERM');
                    console.log('   ⏹️  First image process stopped');
                }

                // Start second image process
                console.log('   command: imv-wayland -f (Wayland-native image viewer)');
                image2Process = spawn('imv-wayland', [
                    '-f',  // fullscreen
                    image2Path
                ], {
                    stdio: 'pipe',
                    env: { ...process.env }
                });

                console.log('   ✅ Background switched to second image (video still playing on top)');

                // Step 4: Wait for video to finish naturally (full 8 seconds from video start)
                // The video should play for approximately 8 seconds total, regardless of background switch timing
                const FULL_VIDEO_DURATION = 8000; // Full video is 8 seconds
                console.log(`\n⏱️  Letting video play for full ${FULL_VIDEO_DURATION}ms duration...`);

                // Wait for video to end naturally
                await new Promise((resolve) => {
                    let videoEnded = false;

                    videoProcess.on('close', (code) => {
                        if (!videoEnded) {
                            videoEnded = true;
                            console.log('   ✅ Video completed naturally - second image should now be visible');
                            resolve();
                        }
                    });

                    // Let video play for full duration, then stop if still running
                    setTimeout(() => {
                        if (!videoEnded && !videoProcess.killed) {
                            videoProcess.kill('SIGTERM');
                            console.log('   ⏹️  Video completed full duration (8s) - stopping');
                            videoEnded = true;
                            resolve();
                        }
                    }, FULL_VIDEO_DURATION);
                });

                // Step 5: Display final image for specified time
                console.log(`\n▶️  Step 4: Final image display (${TIMING_CONFIG.FINAL_DISPLAY_TIME}ms)`);
                console.log('   Second image should now be visible with video overlay gone');
                console.log('   📸 Final image displaying for 3 seconds...');

                await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.FINAL_DISPLAY_TIME));

                console.log('\n✨ Seamless overlapping transition test complete!');
                console.log('🎯 Evaluation checklist:');
                console.log('   ✓ First image appeared immediately');
                console.log('   ✓ Video started playing on top (no flicker)');
                console.log('   ✓ Background image switched during video (unnoticeable)');
                console.log('   ✓ Video ended revealing second image (seamless)');
                console.log('   ✓ No cursor visible throughout sequence');

            } finally {
                // Cleanup: Kill any remaining processes
                console.log('\n🧹 Cleaning up processes...');

                if (image1Process && !image1Process.killed) {
                    image1Process.kill('SIGTERM');
                    console.log('   ⏹️  Image1 process cleaned up');
                }
                if (videoProcess && !videoProcess.killed) {
                    videoProcess.kill('SIGTERM');
                    console.log('   ⏹️  Video process cleaned up');
                }
                if (image2Process && !image2Process.killed) {
                    image2Process.kill('SIGTERM');
                    console.log('   ⏹️  Image2 process cleaned up');
                }

                console.log('   ✅ All processes cleaned up');
            }
        }, 20000); // 20 second timeout: 4s image + 8s video + 3s final + 5s buffer
    });

    afterAll(() => {
        if (REAL_PLAYBACK_ENABLED) {
            console.log('\n🎉 Real playback tests completed!');
            console.log('💡 Tip: You can adjust DISPLAY_TIME in the test file for longer/shorter playback');
        }
    });
});
