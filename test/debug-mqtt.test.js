/**
 * Minimal MQTT Jest test to debug hanging issue.
 * Uses ensureBroker; gated by LONG_TESTS for routine runs.
 */

const MqttClient = require('../lib/core/mqtt-client');
const { ensureBroker } = require('./utils/broker-helper');
const longTestsEnabled = process.env.LONG_TESTS === '1';
const maybe = longTestsEnabled ? describe : describe.skip;

maybe('Debug MQTT', () => {
    let mqttClient; let brokerControl; let host = 'localhost'; let port = 1883;

    beforeAll(async () => {
        brokerControl = await ensureBroker();
        const u = new URL(brokerControl.url);
        host = u.hostname; port = parseInt(u.port, 10);
        console.log(`Debug test using broker ${brokerControl.url} (embedded: ${brokerControl.usedEmbedded})`);
    });

    afterAll(async () => {
        if (brokerControl && brokerControl.usedEmbedded) { await brokerControl.stop(); }
    });

    beforeEach(() => {
        mqttClient = new MqttClient({
            mqttServer: host,
            mqttPort: port,
            heartbeatTopic: 'test/debug/heartbeat',
            heartbeatInterval: 5000,
            mqttMaxAttempts: 2,
            mqttConnectTimeoutMs: 1500,
            mqttOverallTimeoutMs: 4000
        });
    });

    afterEach(async () => {
        if (mqttClient && mqttClient.connected) {
            await mqttClient.disconnect();
        }
    });

    test('minimal connection test', async () => {
        await mqttClient.connect();
        expect(mqttClient.connected).toBe(true);
    }, 20000);
});
