// pxfx.js - Example main application structure for Paradox-FX (pxfx)
// This is a cleaned-up version of the original index.js, suitable as a reference for new projects.

const { parseNumberOr } = require('../lib/utils');
const { ImageSwitcherBroker } = require('../lib/broker');
const { AudioFxPlayer, ImageViewer, VideoPlayer, AudioPlayer } = require('../lib/media');
const { execSubShell } = require('../lib/subproc');

// Example: Load config from environment or .conf file (not implemented here)
const config = {};
// ...populate config from .conf file or process.env...

function main(config) {
    const imageViewer = new ImageViewer(config);
    const audioFxPlayer = new AudioFxPlayer(config);
    const videoPlayer = new VideoPlayer(config);
    const audioPlayer = new AudioPlayer(config);
    const broker = new ImageSwitcherBroker(config);
    const transDelayMs = parseNumberOr(config.transition_delay_ms, 1500);
    const shutdownDelayMs = parseNumberOr(config.shutdown_delay_ms, 1000);
    const rebootDelayMs = parseNumberOr(config.reboot_delay_ms, 1000);

    function errorHandler(warning) {
        return function (err, media) {
            if (media) warning = warning + ': ' + media;
            broker.logInfo(warning + ", " + err.message);
            broker.emitWarning(warning, err);
        }
    }

    function setHeartbeatStatus() {
        var messages = [];
        var video = videoPlayer.playingMediaName;
        var audio = audioPlayer.playingMediaName;
        if (video) messages.push("playing video: " + video);
        if (audio) messages.push("playing audio: " + audio);
        broker.setHeartbeatStatus(messages.join(", "));
    }

    imageViewer.show().then(() => {
        broker.reply("default image shown", "[init]");
    }, errorHandler("Error while setting image on startup"));

    // Register command handlers (see original for full list)
    broker
        .onCommand('getConfig', () => broker.reply(config))
        .onCommand('stopAll', () => {
            videoPlayer.stop();
            audioPlayer.stop();
            audioFxPlayer.stop();
            broker.reply("stop all");
        })
        // ...add other command handlers as needed...
        .heartbeatStart()
        .startListening();
}

// Example startup
try {
    main(config);
} catch (err) {
    console.error("Unrecoverable error while running: %s", err);
    process.exit(1);
}
