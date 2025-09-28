/**
 * Test direct MQTT library in Jest environment.
 * Gated by LONG_TESTS to reduce default CI time.
 */

const mqtt = require('mqtt');
const { ensureBroker } = require('./utils/broker-helper');

const longTestsEnabled = process.env.LONG_TESTS === '1';
const maybe = longTestsEnabled ? describe : describe.skip;

maybe('Direct MQTT Library Test', () => {
    let brokerControl;

    beforeAll(async () => {
        brokerControl = await ensureBroker();
        console.log(`Direct test using broker ${brokerControl.url} (embedded: ${brokerControl.usedEmbedded})`);
    });

    afterAll(async () => {
        if (brokerControl && brokerControl.usedEmbedded) {
            await brokerControl.stop();
        }
    });

    test('direct mqtt connection', async () => {
        return new Promise((resolve, reject) => {
            const client = mqtt.connect(brokerControl.url, {
                clientId: 'jest-test-' + Date.now(),
                clean: true,
                connectTimeout: 3000
            });
            client.on('connect', () => { client.end(true, resolve); });
            client.on('error', (err) => { try { client.end(); } catch (_) { } reject(err); });
        });
    }, 15000);
});
