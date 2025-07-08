const MPV = require('node-mpv');

class MediaPlayer {
    constructor(display, defaultImage, videoVolume) {
        this.display = display;
        this.defaultImage = defaultImage || 'default.png';
        this.videoVolume = videoVolume || 100;
        this.mpv = new MPV({
            audio_only: false,
            auto_restart: true,
            time_update: 1,
            verbose: true,
            args: [
                `--display=${this.display}`,
                '--fullscreen',
                '--keep-open=always',
                '--force-window=immediate',
                '--msg-level=all=info'
            ]
        });

        this.mpv.on('ready', async () => {
            console.log(`[PxFx] MPV ready on display ${this.display}, loading default image...`);
            await this.mpv.load(this.defaultImage);
            await this.mpv.pause();
        });

        this.mpv.on('stopped', async () => {
            console.log(`[PxFx] MPV stopped on display ${this.display}, reloading default image...`);
            await this.mpv.load(this.defaultImage);
            await this.mpv.pause();
        });

        this.mpv.on('crashed', async () => {
            console.error(`[PxFx] MPV crashed on display ${this.display}, attempting restart...`);
            setTimeout(() => this.mpv.start(), 15000);
        });

        this.mpv.start();
    }

    async playMedia(file, volume = 1.0) {
        const adjustedVolume = this.videoVolume * volume;
        console.log(`[PxFx] Playing media on display ${this.display}: ${file} at volume ${adjustedVolume}`);
        await this.mpv.setProperty('volume', adjustedVolume);
        await this.mpv.load(file);
        await this.mpv.play();
    }

    async pauseMedia() {
        console.log(`[PxFx] Pausing media on display ${this.display}`);
        await this.mpv.pause();
    }

    async resumeMedia() {
        console.log(`[PxFx] Resuming media on display ${this.display}`);
        await this.mpv.play();
    }

    async stopMedia() {
        console.log(`[PxFx] Stopping media on display ${this.display}`);
        await this.mpv.stop();
    }
}

module.exports = MediaPlayer;