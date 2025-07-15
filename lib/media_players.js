const { spawn } = require('child_process');

class AudioPlayer {
    constructor(audioVolume, maxPolyphony) {
        this.audioVolume = audioVolume || 100;
        this.maxPolyphony = maxPolyphony || 4;
        this.activePlayers = [];
    }

    playAudio(file, volume = 1.0, type = 'plain') {
        const adjustedVolume = this.audioVolume * volume;
        const args = [
            '--no-video',
            `--volume=${adjustedVolume}`,
            '--gain=1.0',
            '--file-caching=100',
            '--audio-output=alsa',
            file
        ];

        if (type === 'one-shot') {
            args.push('--play-and-exit');
        } else if (type === 'looping') {
            args.push('--loop');
        }

        if (this.activePlayers.length >= this.maxPolyphony) {
            console.error(`[ParadoxFX] Max polyphony reached, cannot play: ${file}`);
            return;
        }

        const player = spawn('cvlc', args);
        this.activePlayers.push(player);

        player.on('exit', () => {
            console.log(`[ParadoxFX] Audio playback finished: ${file}`);
            this.activePlayers = this.activePlayers.filter(p => p !== player);
        });

        player.on('error', (err) => {
            console.error(`[ParadoxFX] Error during audio playback: ${file}`, err);
        });

        console.log(`[ParadoxFX] Playing audio: ${file} at volume ${adjustedVolume}`);
    }

    stopAllAudio() {
        console.log('[ParadoxFX] Stopping all audio playback');
        this.activePlayers.forEach(player => player.kill());
        this.activePlayers = [];
    }
}

module.exports = AudioPlayer;