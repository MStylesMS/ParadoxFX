const readline = require('readline');
const mqtt = require('mqtt');
const { exec, spawn } = require('child_process');

// Enable single-key input
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


// Use test config if specified, else default
const argv = require('minimist')(process.argv.slice(2));
const CONFIG_FILE = argv.config || argv.c || 'pxfx.ini';
const MQTT_BROKER = 'mqtt://localhost:1883';
const BASE_TOPIC = 'Paradox/Room/ScreenA'; // Corrected topic
const APP_PROCESS_NAME = 'pxfx';

let client;

const tests = [
    { description: 'Show a test image', command: { Command: 'setImage', Image: '/opt/paradox/production/media/images/TestPattern_1920x1080.png' } },
    { description: 'Play a test video', command: { Command: 'playVideo', Video: '/opt/paradox/production/media/videos/Test_1920x1080.mp4' } },
    { description: 'Play a test audio file', command: { Command: 'playAudio', Audio: '/opt/paradox/production/media/audio/Test_Audio.mp3' } },
    { description: 'Stop video playback', command: { Command: 'stopVideo' } },
    { description: 'Stop audio playback', command: { Command: 'stopAudio' } },
    { description: 'Stop all playback', command: { Command: 'stopAll' } },
];

let currentTest = 0;
const results = [];

function cleanupAndExit() {
    console.log('\nExiting test script.');
    if (client) {
        client.end();
    }
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
    }
    rl.close();
    process.exit();
}

// Handle Ctrl+C to exit gracefully
rl.on('SIGINT', cleanupAndExit);
process.on('SIGINT', cleanupAndExit);

function checkProcessRunning(processName, callback) {
    exec(`pgrep -f ${processName}`, (err, stdout, stderr) => {
        if (err) {
            callback(false);
            return;
        }
        callback(stdout.trim().length > 0);
    });
}

function runTest() {
    if (currentTest >= tests.length) {
        console.log('\n\n--- Test Summary ---');
        results.forEach(res => {
            console.log(`[${res.result.padEnd(4, ' ')}] ${res.description}`);
        });
        console.log('--------------------');
        console.log('All tests completed.');
        cleanupAndExit();
        return;
    }

    const test = tests[currentTest];
    console.log(`\nTest [${currentTest + 1} of ${tests.length}]: ${test.description}`);
    console.log(`Command: ${JSON.stringify(test.command)}`);

    const topic = `${BASE_TOPIC}/command`;
    client.publish(topic, JSON.stringify(test.command), (err) => {
        if (err) {
            console.error('Failed to publish command:', err);
            results.push({ description: test.description, result: 'ERROR' });
            currentTest++;
            runTest(); // Move to next test
        } else {
            console.log(`Published command. Did it work? (y = yes, n = no)`);

            const keypressHandler = (str, key) => {
                if (key.ctrl && key.name === 'c') {
                    cleanupAndExit();
                    return;
                }

                if (key.name === 'y' || key.name === 'n') {
                    process.stdin.removeListener('keypress', keypressHandler);

                    if (key.name === 'y') {
                        console.log('-> PASS');
                        results.push({ description: test.description, result: 'PASS' });
                    } else {
                        console.log('-> FAIL');
                        results.push({ description: test.description, result: 'FAIL' });
                    }
                    currentTest++;
                    runTest();
                }
            };
            process.stdin.on('keypress', keypressHandler);
        }
    });
}

function connectAndRunTests() {
    console.log(`Connecting to MQTT broker at ${MQTT_BROKER}...`);
    client = mqtt.connect(MQTT_BROKER);

    client.on('connect', () => {
        console.log('MQTT connected.');
        runTest();
    });

    client.on('error', (err) => {
        console.error('MQTT connection error:', err);
        cleanupAndExit();
    });
}

// Main execution
checkProcessRunning(APP_PROCESS_NAME, (running) => {
    if (running) {
        console.log(`${APP_PROCESS_NAME} is running. Starting tests.`);
        connectAndRunTests();
    } else {
        console.log(`${APP_PROCESS_NAME} is not running. Please start the application first.`);
        console.log(`Example: node /opt/paradox/apps/pxfx/pxfx.js --config pxfx-test.ini`);
        cleanupAndExit();
    }
});
