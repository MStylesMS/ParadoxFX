const mqtt = require('mqtt');
const assert = require('assert');

// Automated tests for MQTT command handling
const testCommands = [
    { Command: 'playVideo', Video: 'test.mp4', Volume: 0.8 },
    { Command: 'setImage', Image: 'test.png' },
    { Command: 'transition', Image: 'test.png', Video: 'test.mp4' },
    { Command: 'playAudio', Audio: 'test.mp3', Volume: 1.0 },
    { Command: 'playAudioFX', Audio: 'test.mp3', Type: 'one-shot', Volume: 0.5 },
    { Command: 'clearQueue' },
    { Command: 'pause' },
    { Command: 'resume' },
    { Command: 'skip' },
    { Command: 'stopAll' },
];

const client = mqtt.connect('mqtt://localhost');

client.on('connect', () => {
    console.log('Connected to MQTT broker');

    testCommands.forEach((command, index) => {
        const topic = `/Paradox/Test/Commands`;
        client.publish(topic, JSON.stringify(command), (err) => {
            assert.strictEqual(err, undefined, `Failed to publish command: ${command.Command}`);
            console.log(`Published command: ${command.Command}`);
        });
    });

    client.end();
});

client.on('error', (err) => {
    console.error('MQTT error:', err);
});
