/**
 * Unit Tests for ConfigLoader
 */

const ConfigLoader = require('../../lib/core/config-loader');
const fs = require('fs').promises;

// Mock fs module for testing
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn()
    }
}));

describe('ConfigLoader', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('load', () => {
        test('should load valid configuration file', async () => {
            const mockConfig = `
[global]
MQTT_SERVER=localhost
MQTT_PORT=1883
HEARTBEAT_TOPIC=Paradox/Devices

[TestScreen]
DEVICE_TYPE=screen
DISPLAY=:0
BASE_TOPIC=Paradox/Room/TestScreen
STATUS_TOPIC=Paradox/Room/TestScreen/Status
MEDIA_DIR=/opt/paradox/media
`;

            fs.readFile.mockResolvedValue(mockConfig);

            const config = await ConfigLoader.load('test.ini');

            expect(config).toHaveProperty('global');
            expect(config).toHaveProperty('devices');
            expect(config.global.mqttServer).toBe('localhost');
            expect(config.global.mqttPort).toBe(1883);
            expect(config.devices.TestScreen.type).toBe('screen');
            expect(config.devices.TestScreen.display).toBe(':0');
        });

        test('should throw error if global section is missing', async () => {
            const mockConfig = `
[TestScreen]
DEVICE_TYPE=screen
DISPLAY=:0
`;

            fs.readFile.mockResolvedValue(mockConfig);

            await expect(ConfigLoader.load('test.ini')).rejects.toThrow('No [global] section found');
        });

        test('should throw error if required global fields are missing', async () => {
            const mockConfig = `
[global]
MQTT_PORT=1883

[TestScreen]
DEVICE_TYPE=screen
`;

            fs.readFile.mockResolvedValue(mockConfig);

            await expect(ConfigLoader.load('test.ini')).rejects.toThrow('Required global configuration field missing: MQTT_SERVER');
        });

        test('should handle device without DEVICE_TYPE', async () => {
            const mockConfig = `
[global]
MQTT_SERVER=localhost
HEARTBEAT_TOPIC=Paradox/Devices

[TestDevice]
BASE_TOPIC=Paradox/Room/TestDevice
`;

            fs.readFile.mockResolvedValue(mockConfig);

            await expect(ConfigLoader.load('test.ini')).rejects.toThrow('Device TestDevice missing DEVICE_TYPE');
        });

        test('should process screen device configuration correctly', async () => {
            const mockConfig = `
[global]
MQTT_SERVER=localhost
HEARTBEAT_TOPIC=Paradox/Devices

[TestScreen]
DEVICE_TYPE=screen
DISPLAY=:1
BASE_TOPIC=Paradox/Room/TestScreen
STATUS_TOPIC=Paradox/Room/TestScreen/Status
MEDIA_DIR=/custom/media
VIDEO_QUEUE_MAX=10
AUDIO_QUEUE_MAX=8
TRANSITION_DELAY_MS=200
`;

            fs.readFile.mockResolvedValue(mockConfig);

            const config = await ConfigLoader.load('test.ini');
            const device = config.devices.TestScreen;

            expect(device.type).toBe('screen');
            expect(device.display).toBe(':1');
            expect(device.mediaDir).toBe('/custom/media');
            expect(device.videoQueueMax).toBe(10);
            expect(device.audioQueueMax).toBe(8);
            expect(device.transitionDelay).toBe(200);
        });

        test('should process light device configuration correctly', async () => {
            const mockConfig = `
[global]
MQTT_SERVER=localhost
HEARTBEAT_TOPIC=Paradox/Devices

[TestLight]
DEVICE_TYPE=light
CONTROLLER=hue
DEVICE_ID=AX30F2
BASE_TOPIC=Paradox/Room/TestLight
STATUS_TOPIC=Paradox/Room/TestLight/Status
`;

            fs.readFile.mockResolvedValue(mockConfig);

            const config = await ConfigLoader.load('test.ini');
            const device = config.devices.TestLight;

            expect(device.type).toBe('light');
            expect(device.controller).toBe('hue');
            expect(device.deviceId).toBe('AX30F2');
        });

        test('should handle file read errors', async () => {
            fs.readFile.mockRejectedValue(new Error('File not found'));

            await expect(ConfigLoader.load('nonexistent.ini')).rejects.toThrow('File not found');
        });
    });
});
