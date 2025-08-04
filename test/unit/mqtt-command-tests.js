const mqtt = require('mqtt');
const assert = require('assert');

// Automated tests for MQTT command handling
const testCommands = [
    { command: 'playVideo', video: 'test.mp4', volume: 0.8 },
    { command: 'setImage', image: 'test.png' },
    { command: 'transition', image: 'test.png', video: 'test.mp4' },
    { command: 'playAudio', audio: 'test.mp3', volume: 1.0 },
    { command: 'playAudioFx', audio: 'test.mp3', type: 'one-shot', volume: 0.5 },
    { command: 'clearQueue' },
    { command: 'pauseVideo' },
    { command: 'resumeVideo' },
    { command: 'skipVideo' },
    { command: 'pauseAll' },
    { command: 'resumeAll' },
    { command: 'stopAll' },
];

const client = mqtt.connect('mqtt://localhost');

client.on('connect', () => {
    console.log('Connected to MQTT broker');

    testCommands.forEach((command, index) => {
        const topic = `paradox/test/commands`;
        client.publish(topic, JSON.stringify(command), (err) => {
            assert.strictEqual(err, undefined, `Failed to publish command: ${command.command}`);
            console.log(`Published command: ${command.command}`);
        });
    });

    client.end();
});

client.on('error', (err) => {
    console.error('MQTT error:', err);
});
