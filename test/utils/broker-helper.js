/**
 * Broker Helper
 * Tries to connect to a real broker (localhost:1883). If connection fails quickly,
 * spins up an embedded Aedes broker on an ephemeral port and returns its URL.
 * Provides ensureBroker() that yields { url, stop, usedEmbedded }.
 */
const net = require('net');
let aedesInstance = null;
let serverInstance = null;

async function testRealBroker(host = 'localhost', port = 1883, timeoutMs = 1000) {
    return new Promise(resolve => {
        const socket = net.createConnection({ host, port });
        let done = false;
        const finish = (ok) => {
            if (done) return; done = true;
            socket.destroy();
            resolve(ok);
        };
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
        setTimeout(() => finish(false), timeoutMs);
    });
}

async function startEmbeddedBroker() {
    if (aedesInstance) {
        return aedesInstance._url;
    }
    const aedes = require('aedes')();
    const server = require('net').createServer(aedes.handle);
    const listenPort = await new Promise((resolve, reject) => {
        server.listen(0, (err) => {
            if (err) return reject(err);
            resolve(server.address().port);
        });
    });
    aedesInstance = aedes;
    serverInstance = server;
    const url = `mqtt://127.0.0.1:${listenPort}`;
    aedes._url = url;
    return url;
}

async function ensureBroker() {
    const real = await testRealBroker();
    if (real) {
        return { url: 'mqtt://localhost:1883', usedEmbedded: false, stop: async () => { } };
    }
    const url = await startEmbeddedBroker();
    return {
        url,
        usedEmbedded: true,
        stop: async () => {
            try {
                if (aedesInstance) aedesInstance.close();
                if (serverInstance) serverInstance.close();
            } catch (_) { }
            aedesInstance = null; serverInstance = null;
        }
    };
}

module.exports = { ensureBroker };