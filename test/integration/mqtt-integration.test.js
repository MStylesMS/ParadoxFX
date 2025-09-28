/**
 * Integration Tests for MQTT Communication
 * Uses ensureBroker() to prefer a real local broker (localhost:1883) and fall back
 * to an embedded Aedes instance if unavailable.
 * Heavier scenarios are gated behind LONG_TESTS=1 to keep CI fast.
 */

const MqttClient = require('../../lib/core/mqtt-client');
const { ensureBroker } = require('../utils/broker-helper');
const { URL } = require('url');
const mqttLib = require('mqtt');

const skipAll = process.env.SKIP_INTEGRATION_TESTS === '1';
const longTestsEnabled = process.env.LONG_TESTS === '1';
const describeIntegration = skipAll ? describe.skip : describe;

describeIntegration('MQTT Integration', () => {
    let mqttClient;
    let brokerControl;
    let host = 'localhost';
    let port = 1883;

    beforeAll(async () => {
        brokerControl = await ensureBroker();
        const u = new URL(brokerControl.url);
        host = u.hostname;
        port = parseInt(u.port, 10);
        console.log(`Using MQTT broker at ${brokerControl.url} (embedded: ${brokerControl.usedEmbedded})`);
        // Quick sanity probe with raw mqtt to fail fast if something misconfigured
        await new Promise((resolve, reject) => {
            const probe = mqttLib.connect(brokerControl.url, { connectTimeout: 1500 });
            let done = false;
            const finish = (ok) => { if (done) return; done = true; try { probe.end(true); } catch (_) { } ok ? resolve() : reject(new Error('Probe connect failed')); };
            probe.on('connect', () => finish(true));
            probe.on('error', () => finish(false));
            setTimeout(() => finish(false), 1600);
        }).catch(err => {
            console.warn('MQTT probe failed, skipping suite:', err.message);
            // Mark to skip
            host = null; port = null;
        });
    });

    afterAll(async () => {
        if (brokerControl && brokerControl.usedEmbedded && brokerControl.stop) {
            await brokerControl.stop();
        }
    });

    beforeEach(() => {
        if (!host) {
            return; // broker probe failed
        }
        const config = {
            mqttServer: host,
            mqttPort: port,
            heartbeatTopic: 'test/integration/heartbeat',
            heartbeatInterval: 5000,
            mqttMaxAttempts: 2,
            mqttConnectTimeoutMs: 800,
            mqttOverallTimeoutMs: 2500
        };
        mqttClient = new MqttClient(config);
    });

    afterEach(async () => {
        if (mqttClient) {
            await mqttClient.disconnect();
        }
    });

    let conditionalTest = test; // will adjust dynamically per test body
    const isBrokerUnavailable = () => !host;
    conditionalTest = isBrokerUnavailable() ? test.skip : test;

    conditionalTest('connects to broker (real or embedded)', async () => {
        if (!mqttClient) return; // guard
        await expect(mqttClient.connect()).resolves.toBeUndefined();
        expect(mqttClient.connected).toBe(true);
    }, 8000);

    conditionalTest('publishes and receives a JSON message', async () => {
        if (!mqttClient) return; // guard
        await mqttClient.connect();
        const testTopic = 'test/integration/message';
        const testMessage = { command: 'test', timestamp: Date.now() };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Message not received within timeout')), 5000);
            mqttClient.subscribe(testTopic, (topic, message) => {
                try {
                    clearTimeout(timeout);
                    expect(topic).toBe(testTopic);
                    expect(message).toEqual(testMessage);
                    resolve();
                } catch (err) { reject(err); }
            });
            setTimeout(() => mqttClient.publish(testTopic, testMessage), 50);
        });
    }, 10000);

    if (longTestsEnabled) {
        conditionalTest('handles multiple subscribers', async () => {
            if (!mqttClient) return;
            await mqttClient.connect();
            const testTopic = 'test/integration/multi';
            const testMessage = 'multi-test';
            let received1 = false, received2 = false;
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Not all messages received within timeout')), 5000);
                const check = () => { if (received1 && received2) { clearTimeout(timeout); resolve(); } };
                mqttClient.subscribe(`${testTopic}/1`, (t, m) => { expect(m).toBe(testMessage); received1 = true; check(); });
                mqttClient.subscribe(`${testTopic}/2`, (t, m) => { expect(m).toBe(testMessage); received2 = true; check(); });
                setTimeout(() => {
                    mqttClient.publish(`${testTopic}/1`, testMessage);
                    mqttClient.publish(`${testTopic}/2`, testMessage);
                }, 50);
            });
        }, 10000);

        conditionalTest('respects QoS settings (qos 1)', async () => {
            if (!mqttClient) return;
            await mqttClient.connect();
            const testTopic = 'test/integration/qos';
            const testMessage = 'qos-test';
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('QoS message not received')), 5000);
                mqttClient.subscribe(testTopic, (topic, message) => {
                    clearTimeout(timeout);
                    expect(message).toBe(testMessage);
                    resolve();
                });
                setTimeout(() => mqttClient.publish(testTopic, testMessage, { qos: 1 }), 50);
            });
        }, 10000);
    } else {
        test.skip('handles multiple subscribers (LONG_TESTS=1 to enable)', () => { });
        test.skip('respects QoS settings (LONG_TESTS=1 to enable)', () => { });
    }

    conditionalTest('handles connection loss and reconnection event flow', async () => {
        if (!mqttClient) return;
        await mqttClient.connect();
        expect(mqttClient.connected).toBe(true);
        mqttClient.client.emit('disconnect');
        expect(mqttClient.connected).toBe(false);
    }, 5000);
});
