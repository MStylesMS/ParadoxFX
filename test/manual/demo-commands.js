#!/usr/bin/env node
/**
 * Quick MQTT Command Demo
 * 
 * Shows all device commands without interactive mode
 */

const ConfigLoader = require('../../lib/core/config-loader');

async function showCommands() {
    console.log('🎮 PxFx MQTT Command Examples\n');

    try {
        const config = await ConfigLoader.load('pxfx-test.ini');

        for (const [deviceName, deviceConfig] of Object.entries(config.devices)) {
            console.log(`\n🔧 Device: ${deviceName} (${deviceConfig.type})`);
            console.log(`📡 Command Topic: ${deviceConfig.baseTopic}/command`);
            console.log('='.repeat(60));

            switch (deviceConfig.type) {
                case 'screen':
                    showScreenCommands();
                    break;
                case 'light':
                    showLightCommands();
                    break;
                case 'light_group':
                    showLightGroupCommands();
                    break;
                case 'relay':
                    showRelayCommands();
                    break;
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

function showScreenCommands() {
    const examples = [
        {
            name: 'setImage (minimal)',
            json: { Command: 'setImage', Image: 'test-image.jpg' }
        },
        {
            name: 'playVideo (with options)',
            json: { Command: 'playVideo', Video: 'videos/intro.mp4', VolumeAdjust: -10, Channel: 'default' }
        },
        {
            name: 'playAudio (minimal)',
            json: { Command: 'playAudio', Audio: 'background.mp3' }
        },
        {
            name: 'playAudioFx (loop)',
            json: { Command: 'playAudioFx', Audio: 'effects/ambient.wav', Type: 'loop', VolumeAdjust: -30 }
        },
        {
            name: 'transition',
            json: { Command: 'transition', Video: 'intro.mp4', Image: 'final.jpg' }
        }
    ];

    examples.forEach(ex => {
        console.log(`\n📝 ${ex.name}:`);
        console.log(`   ${JSON.stringify(ex.json, null, 2)}`);
    });
}

function showLightCommands() {
    const examples = [
        {
            name: 'on (with brightness)',
            json: { Command: 'on', Brightness: 80 }
        },
        {
            name: 'setColor (RGB)',
            json: { Command: 'setColor', Color: { r: 255, g: 100, b: 0 }, Brightness: 90 }
        }
    ];

    examples.forEach(ex => {
        console.log(`\n📝 ${ex.name}:`);
        console.log(`   ${JSON.stringify(ex.json, null, 2)}`);
    });
}

function showLightGroupCommands() {
    const examples = [
        {
            name: 'setGroupColor',
            json: { Command: 'setGroupColor', Color: { r: 255, g: 100, b: 0 }, Brightness: 80, Lights: ['light1', 'light2'] }
        }
    ];

    examples.forEach(ex => {
        console.log(`\n📝 ${ex.name}:`);
        console.log(`   ${JSON.stringify(ex.json, null, 2)}`);
    });
}

function showRelayCommands() {
    const examples = [
        {
            name: 'pulse (with duration)',
            json: { Command: 'pulse', Duration: 5000 }
        }
    ];

    examples.forEach(ex => {
        console.log(`\n📝 ${ex.name}:`);
        console.log(`   ${JSON.stringify(ex.json, null, 2)}`);
    });
}

if (require.main === module) {
    showCommands().catch(console.error);
}
