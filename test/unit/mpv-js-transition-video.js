// seamless-transition-mpv.js
const MPV = require('node-mpv');
const path = require('path');

const mediaDir = '/opt/paradox/apps/pfx/test/fixtures/test-media/';
const videoFile = path.join(mediaDir, 'transition_video.mp4');

const mpv = new MPV({
    audio_only: false,
    auto_restart: false,
    time_update: 1,
    verbose: true,
    args: [
        '--fullscreen',
        '--keep-open=always',
        '--force-window=immediate',
        '--msg-level=all=info'
    ]
});

mpv.on('ready', async () => {
    console.log('[ParadoxFX] MPV ready, loading video and pausing on first frame...');
    await mpv.load(videoFile);
    await mpv.pause();
    setTimeout(async () => {
        console.log('[ParadoxFX] ...transition now....');
        await mpv.play();
    }, 2000);
});

mpv.on('stopped', async () => {
    console.log('[ParadoxFX] ...paused on last frame (window will stay)...');
    await mpv.pause();
    setTimeout(async () => {
        console.log('[ParadoxFX] ...done.');
        await mpv.quit();
        process.exit(0);
    }, 2000);
});

mpv.start();