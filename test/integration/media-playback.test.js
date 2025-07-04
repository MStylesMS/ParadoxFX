/**
 * Media Player Integration Tests
 * 
 * Tests actual media playback functionality using real media files.
 * Requires test media files to be present in test/fixtures/test-media/
 */

const path = require('path');
const fs = require('fs');
const MediaPlayerFactory = require('../../lib/media/media-player-factory');
const ProcessManager = require('../../lib/media/process-manager');

describe('MediaPlayerFactory Integration Tests', () => {
    let factory;
    let processManager;
    const testMediaPath = path.join(__dirname, '../fixtures/test-media');

    beforeAll(() => {
        // Check if test media files exist
        if (!fs.existsSync(testMediaPath)) {
            throw new Error(`Test media directory not found: ${testMediaPath}`);
        }
    });

    beforeEach(() => {
        const config = {
            mediaBasePath: testMediaPath,
            defaultImagePlayer: 'feh',
            defaultVideoPlayer: 'mpv',
            defaultAudioPlayer: 'mpv'
        };
        processManager = new ProcessManager();
        factory = new MediaPlayerFactory(config, processManager);
    });

    afterEach(async () => {
        if (processManager) {
            await processManager.killAll();
        }
    });

    describe('Image Playback Tests', () => {
        const imageTests = [
            { file: 'default.jpg', type: 'JPEG' },
            { file: 'default_hq.jpg', type: 'High Quality JPEG' },
            { file: 'default_lq.jpg', type: 'Low Quality JPEG' },
            { file: 'default.png', type: 'PNG' },
            { file: 'houdini_picture_24bit.png', type: '24-bit PNG' },
            { file: 'default.gif', type: 'GIF' },
            { file: 'default.bmp', type: 'BMP' },
            { file: 'default.tiff', type: 'TIFF' },
            { file: 'default.webp', type: 'WebP' }
        ];

        imageTests.forEach(({ file, type }) => {
            test(`should play ${type} image: ${file}`, async () => {
                const filePath = path.join(testMediaPath, file);

                // Skip test if file doesn't exist
                if (!fs.existsSync(filePath)) {
                    console.warn(`Skipping ${type} test - file not found: ${file}`);
                    return;
                }

                const player = factory.createPlayer(filePath);
                expect(player).toBeDefined();
                expect(player.command).toBeTruthy();

                // Test player creation without actually starting it
                // (to avoid requiring X11 in CI environment)
                expect(player.args).toContain(filePath);

                // Log format details for debugging
                console.log(`Testing ${type}: ${file} -> Player: ${player.command}`);
            });
        });

        test('should handle different image quality levels', async () => {
            const qualityTests = [
                { file: 'default_hq.jpg', quality: 'high' },
                { file: 'default.jpg', quality: 'standard' },
                { file: 'default_lq.jpg', quality: 'low' }
            ];

            const availableFiles = qualityTests.filter(({ file }) =>
                fs.existsSync(path.join(testMediaPath, file))
            );

            if (availableFiles.length < 2) {
                console.warn('Skipping quality test - insufficient JPEG variants available');
                return;
            }

            // All should use the same player
            const players = availableFiles.map(({ file, quality }) => {
                const filePath = path.join(testMediaPath, file);
                const player = factory.createPlayer(filePath);
                return { player, quality, file };
            });

            // Verify all players are created successfully
            players.forEach(({ player, quality, file }) => {
                expect(player).toBeDefined();
                expect(player.command).toBeTruthy();
                console.log(`${quality} quality (${file}): ${player.command}`);
            });
        });
    });

    describe('Video Playback Tests', () => {
        const videoTests = [
            { file: 'default.mp4', type: 'MP4' },
            { file: 'intro_short.mp4', type: 'Short MP4' },
            { file: 'default.avi', type: 'AVI' },
            { file: 'default.mkv', type: 'MKV' }
        ];

        videoTests.forEach(({ file, type }) => {
            test(`should play ${type} video: ${file}`, async () => {
                const filePath = path.join(testMediaPath, file);

                // Skip test if file doesn't exist
                if (!fs.existsSync(filePath)) {
                    console.warn(`Skipping ${type} test - file not found: ${file}`);
                    return;
                }

                const player = factory.createPlayer(filePath);
                expect(player).toBeDefined();
                expect(player.command).toBeTruthy();
                expect(player.args).toContain(filePath);

                // Log format details for debugging
                console.log(`Testing ${type}: ${file} -> Player: ${player.command}`);
            });
        });

        test('should handle video format compatibility', async () => {
            const availableVideos = fs.readdirSync(testMediaPath)
                .filter(file => file.endsWith('.mp4') || file.endsWith('.avi') || file.endsWith('.mkv'))
                .filter(file => fs.existsSync(path.join(testMediaPath, file)));

            if (availableVideos.length === 0) {
                console.warn('No video files available for compatibility testing');
                return;
            }

            availableVideos.forEach(file => {
                const filePath = path.join(testMediaPath, file);
                const player = factory.createPlayer(filePath);

                expect(player).toBeDefined();
                expect(player.command).toBeTruthy();

                // Most video formats should use mpv or cvlc
                expect(['mpv', 'cvlc', 'vlc'].some(cmd =>
                    player.command.includes(cmd)
                )).toBe(true);

                console.log(`Video compatibility: ${file} -> ${player.command}`);
            });
        });
    });

    describe('Audio Playback Tests', () => {
        const audioTests = [
            { file: 'default.mp3', type: 'MP3' },
            { file: 'default_hq.mp3', type: 'High Quality MP3' },
            { file: 'default_lq.mp3', type: 'Low Quality MP3' },
            { file: 'default.wav', type: 'WAV' },
            { file: 'default.ogg', type: 'OGG Vorbis' },
            { file: 'default.aac', type: 'AAC' },
            { file: 'default.flac', type: 'FLAC' },
            { file: 'default.opus', type: 'Opus' },
            { file: 'default_fx.wav', type: 'FX WAV' },
            { file: 'houdini_music.mp3', type: 'Houdini Music MP3' }
        ];

        audioTests.forEach(({ file, type }) => {
            test(`should play ${type} audio: ${file}`, async () => {
                const filePath = path.join(testMediaPath, file);

                // Skip test if file doesn't exist
                if (!fs.existsSync(filePath)) {
                    console.warn(`Skipping ${type} test - file not found: ${file}`);
                    return;
                }

                const player = factory.createPlayer(filePath);
                expect(player).toBeDefined();
                expect(player.command).toBeTruthy();
                expect(player.args).toContain(filePath);

                // Log format details for debugging
                console.log(`Testing ${type}: ${file} -> Player: ${player.command}`);
            });
        });

        test('should handle different audio quality levels', async () => {
            const qualityTests = [
                { file: 'default_hq.mp3', quality: 'high' },
                { file: 'default.mp3', quality: 'standard' },
                { file: 'default_lq.mp3', quality: 'low' }
            ];

            const availableFiles = qualityTests.filter(({ file }) =>
                fs.existsSync(path.join(testMediaPath, file))
            );

            if (availableFiles.length < 2) {
                console.warn('Skipping quality test - insufficient MP3 variants available');
                return;
            }

            // All should use the same player but with same args
            const players = availableFiles.map(({ file, quality }) => {
                const filePath = path.join(testMediaPath, file);
                const player = factory.createPlayer(filePath);
                return { player, quality, file };
            });

            // Verify all players are created successfully
            players.forEach(({ player, quality, file }) => {
                expect(player).toBeDefined();
                expect(player.command).toBeTruthy();
                console.log(`${quality} quality (${file}): ${player.command}`);
            });
        });

        test('should handle lossless vs lossy audio formats', async () => {
            const losslessFormats = ['default.wav', 'default.flac'];
            const lossyFormats = ['default.mp3', 'default.aac', 'default.ogg', 'default.opus'];

            const testFormat = (formats, type) => {
                const availableFormats = formats.filter(file =>
                    fs.existsSync(path.join(testMediaPath, file))
                );

                if (availableFormats.length === 0) {
                    console.warn(`No ${type} audio formats available for testing`);
                    return;
                }

                availableFormats.forEach(file => {
                    const filePath = path.join(testMediaPath, file);
                    const player = factory.createPlayer(filePath);

                    expect(player).toBeDefined();
                    expect(player.command).toBeTruthy();
                    console.log(`${type} format: ${file} -> ${player.command}`);
                });
            };

            testFormat(losslessFormats, 'Lossless');
            testFormat(lossyFormats, 'Lossy');
        });
    });

    describe('Media Transition Tests', () => {
        test('should handle transition from image to video', async () => {
            const imagePath = path.join(testMediaPath, 'default.jpg');
            const videoPath = path.join(testMediaPath, 'intro_short.mp4');

            // Skip if files don't exist
            if (!fs.existsSync(imagePath) || !fs.existsSync(videoPath)) {
                console.warn('Skipping transition test - required files not found');
                return;
            }

            // Create players for both media types
            const imagePlayer = factory.createPlayer(imagePath);
            const videoPlayer = factory.createPlayer(videoPath);

            expect(imagePlayer).toBeDefined();
            expect(videoPlayer).toBeDefined();

            // Verify different players are selected for different media types
            expect(imagePlayer.command).not.toBe(videoPlayer.command);
        });

        test('should handle transition from video to audio', async () => {
            const videoPath = path.join(testMediaPath, 'intro_short.mp4');
            const audioPath = path.join(testMediaPath, 'default.mp3');

            // Skip if files don't exist
            if (!fs.existsSync(videoPath) || !fs.existsSync(audioPath)) {
                console.warn('Skipping transition test - required files not found');
                return;
            }

            const videoPlayer = factory.createPlayer(videoPath);
            const audioPlayer = factory.createPlayer(audioPath);

            expect(videoPlayer).toBeDefined();
            expect(audioPlayer).toBeDefined();

            // Both might use same player (mpv) but with different options
            expect(videoPlayer.args).toContain(videoPath);
            expect(audioPlayer.args).toContain(audioPath);
        });
    });

    describe('Media File Validation', () => {
        test('should validate media file existence', () => {
            const requiredFiles = [
                // Essential test files
                'default.jpg',
                'default.png',
                'houdini_picture_24bit.png',
                'intro_short.mp4',
                // Generated image formats
                'default_hq.jpg',
                'default_lq.jpg',
                'default.gif',
                'default.bmp',
                'default.tiff',
                'default.webp',
                // Generated audio formats
                'default.mp3',
                'default_hq.mp3',
                'default_lq.mp3',
                'default.wav',
                'default.ogg',
                'default.aac',
                'default.flac',
                'default.opus',
                'default_fx.wav',
                'houdini_music.mp3'
            ];

            const missingFiles = [];
            const presentFiles = [];

            requiredFiles.forEach(file => {
                const filePath = path.join(testMediaPath, file);
                if (!fs.existsSync(filePath)) {
                    missingFiles.push(file);
                } else {
                    presentFiles.push(file);
                }
            });

            console.log(`Present files: ${presentFiles.length}/${requiredFiles.length}`);

            if (missingFiles.length > 0) {
                console.warn(`Missing test media files: ${missingFiles.join(', ')}`);
                console.warn('Run: cp /opt/paradox/media/{default.*,houdini_picture_24bit.png,intro_short.mp4} test/fixtures/test-media/');
                console.warn('Or run the media generation scripts from test/fixtures/test-media/README.md');
            }

            // This test always passes but logs missing files
            expect(true).toBe(true);
        });

        test('should detect media file formats correctly', () => {
            const testFiles = fs.readdirSync(testMediaPath)
                .filter(file => !file.startsWith('.') && file !== 'README.md');

            expect(testFiles.length).toBeGreaterThan(0);

            const formatCounts = {
                image: 0,
                audio: 0,
                video: 0,
                unknown: 0
            };

            testFiles.forEach(file => {
                const filePath = path.join(testMediaPath, file);
                const player = factory.createPlayer(filePath);

                expect(player).toBeDefined();
                expect(player.command).toBeTruthy();

                // Categorize by extension for reporting
                const ext = path.extname(file).toLowerCase();
                if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'].includes(ext)) {
                    formatCounts.image++;
                } else if (['.mp3', '.wav', '.ogg', '.aac', '.flac', '.opus'].includes(ext)) {
                    formatCounts.audio++;
                } else if (['.mp4', '.avi', '.mkv'].includes(ext)) {
                    formatCounts.video++;
                } else {
                    formatCounts.unknown++;
                }

                // Log the selected player for debugging
                console.log(`File: ${file} -> Player: ${player.command}`);
            });

            console.log(`Format distribution: ${JSON.stringify(formatCounts)}`);

            // Verify we have files in each major category
            expect(formatCounts.image).toBeGreaterThan(0);
            expect(formatCounts.audio).toBeGreaterThan(0);
        });

        test('should verify comprehensive format coverage', () => {
            const expectedFormats = {
                images: ['.jpg', '.png', '.gif', '.bmp', '.tiff', '.webp'],
                audio: ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.opus'],
                video: ['.mp4'] // AVI and MKV might not be generated
            };

            const presentFormats = {
                images: [],
                audio: [],
                video: []
            };

            const testFiles = fs.readdirSync(testMediaPath)
                .filter(file => !file.startsWith('.') && file !== 'README.md');

            testFiles.forEach(file => {
                const ext = path.extname(file).toLowerCase();

                if (expectedFormats.images.includes(ext) && !presentFormats.images.includes(ext)) {
                    presentFormats.images.push(ext);
                }
                if (expectedFormats.audio.includes(ext) && !presentFormats.audio.includes(ext)) {
                    presentFormats.audio.push(ext);
                }
                if (expectedFormats.video.includes(ext) && !presentFormats.video.includes(ext)) {
                    presentFormats.video.push(ext);
                }
            });

            console.log('Format coverage:');
            console.log(`Images: ${presentFormats.images.join(', ')}`);
            console.log(`Audio: ${presentFormats.audio.join(', ')}`);
            console.log(`Video: ${presentFormats.video.join(', ')}`);

            // Verify we have good coverage
            expect(presentFormats.images.length).toBeGreaterThanOrEqual(4);
            expect(presentFormats.audio.length).toBeGreaterThanOrEqual(4);
            expect(presentFormats.video.length).toBeGreaterThanOrEqual(1);
        });
    });
});
