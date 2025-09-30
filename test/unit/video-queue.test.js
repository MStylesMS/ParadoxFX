/**
 * Video Queue Behavior Tests (Initial Implementation)
 *
 * Covers Test 1 of the requested scenarios:
 * 1. playVideo A -> after 6s (target duration) a unified completion event with reason 'natural_end' is emitted
 *    and mpv is paused (final frame held).
 *
 * Subsequent scenarios (2..9) will be added iteratively.
 */

// We use fake timers from the very beginning so we can deterministically advance
// through the ScreenZone.initialize() 250ms stabilization delay and the playback tracker.

// ------------------ Module Mocks ------------------

// Lightweight logger mock
jest.mock('../../lib/utils/logger', () => {
    return jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }));
});

// AudioManager mock (only minimal methods used by ScreenZone during initialize & validation)
jest.mock('../../lib/media/audio-manager', () => {
    return jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(true),
        resolveMediaPath: (p) => (p.startsWith('/') ? p : `/tmp/${p}`),
        checkAndRestartProcesses: jest.fn().mockResolvedValue(true)
    }));
});

// ScreenPowerManager mock
jest.mock('../../lib/utils/screen-power-manager', () => {
    return jest.fn().mockImplementation(() => ({
        disableScreenBlanking: jest.fn().mockResolvedValue(true),
        checkDpmsSupport: jest.fn().mockResolvedValue(true),
        autoWakeForMedia: jest.fn().mockResolvedValue(true)
    }));
});

// WindowManager mock (not heavily used in these tests)
jest.mock('../../lib/utils/window-manager', () => {
    return jest.fn().mockImplementation(() => ({
        getWindowIdByNameExact: jest.fn().mockReturnValue(null),
        isWindowActive: jest.fn().mockReturnValue(false),
        pickTargetDisplay: jest.fn().mockReturnValue({ width: 1920, height: 1080, x: 0, y: 0 }),
        getDisplays: jest.fn().mockReturnValue([{ width: 1920, height: 1080, x: 0, y: 0 }])
    }));
});

// ffprobe duration helper mock -> always 6 seconds
jest.mock('../../lib/media/ffprobe-duration', () => ({
    probeDurationSeconds: jest.fn().mockResolvedValue(6)
}));

// MediaPlayerFactory mock with a stubbed mpvZoneManager
const mockMpv = {
    loadMedia: jest.fn().mockResolvedValue(true),
    play: jest.fn().mockResolvedValue(true),
    pause: jest.fn().mockResolvedValue(true),
    stop: jest.fn().mockResolvedValue(true),
    sendCommand: jest.fn().mockResolvedValue({}),
    getProperty: jest.fn().mockResolvedValue(null),
    getDuration: jest.fn().mockRejectedValue(new Error('no direct duration')), // force ffprobe path
    observeProperty: jest.fn().mockResolvedValue(1),
    unobserveProperty: jest.fn().mockResolvedValue(true),
    on: jest.fn()
};

jest.mock('../../lib/media/media-player-factory', () => {
    return jest.fn().mockImplementation(() => ({
        createZoneManager: jest.fn().mockResolvedValue(mockMpv),
        getMediaType: (file) => file.toLowerCase().endsWith('.mp4') ? 'video' : 'image'
    }));
});

const ScreenZone = require('../../lib/zones/screen-zone');

function collectEvents(mockMqtt) {
    return mockMqtt.publish.mock.calls
        .filter(c => /\/events$/.test(c[0]))
        .map(c => c[1]);
}

// Helper to flush pending promises while using fake timers
async function flushAsync() {
    await Promise.resolve();
}

// Common setup for each test
async function setupZone() {
    jest.useFakeTimers();
    const mockMqtt = { publish: jest.fn() };
    const zone = new ScreenZone({
        name: 'zone-test',
        baseTopic: 'test/zone',
        mediaDir: '/tmp',
        videoQueueMax: 10,
        background_volume: 80,
        speech_volume: 70,
        effects_volume: 60,
        video_volume: 90
    }, mockMqtt, {});

    // Bypass actual file system lookups for default + any test file
    zone._validateMediaFile = jest.fn().mockImplementation(async (p) => ({ exists: true, path: p.startsWith('/') ? p : `/tmp/${p}` }));

    const initPromise = zone.initialize();
    // Advance past the internal 250ms wait inside initialize
    jest.advanceTimersByTime(300);
    await initPromise;
    return { zone, mockMqtt };
}

// ------------------ Tests ------------------

describe('Video Queue - Test 1 Natural End', () => {
    afterEach(() => {
        // Drain any remaining timers to avoid open handles
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    test('playVideo A completes naturally after 6s with final event and pause', async () => {
        const { zone, mockMqtt } = await setupZone();

        await zone.handleCommand({ command: 'playVideo', file: 'A.mp4' });
        // Flush any microtasks
        await flushAsync();
        let startEvent = null;
        for (let i = 0; i < 5 && !startEvent; i++) {
            const events = collectEvents(mockMqtt);
            startEvent = events.find(e => e.command === 'playVideo' && e.started);
            if (!startEvent) {
                jest.advanceTimersByTime(10);
                await flushAsync();
            }
        }
        expect(startEvent).toBeTruthy();
        expect(startEvent.file).toBe('A.mp4');
        expect(startEvent.duration_s).toBe(6);

        // Fast-forward 6.2s to trigger VideoPlaybackTracker natural end (epsilon 60ms)
        jest.advanceTimersByTime(6200);
        await flushAsync();

        let finalEvent = null;
        for (let i = 0; i < 10 && !finalEvent; i++) {
            const eventsNow = collectEvents(mockMqtt);
            finalEvent = eventsNow.find(e => e.command === 'playVideo' && e.done);
            if (!finalEvent) {
                jest.advanceTimersByTime(50);
                await flushAsync();
            }
        }
        expect(finalEvent).toBeTruthy();
        expect(finalEvent.reason).toBe('natural_end');
        expect(finalEvent.file).toBe('A.mp4');
        expect(finalEvent.message).toMatch(/natural end/i);

        // mpv pause called to hold last frame
        expect(mockMpv.pause).toHaveBeenCalled();
        // Prevent open handle from video playback tracker
        zone._videoPlaybackTracker && zone._videoPlaybackTracker.stop();
    });
});
