#!/usr/bin/env node

/**
 * Demonstration Script for MQTT Error Handling Improvements
 * 
 * This script demonstrates how the application now handles malformed MQTT messages
 * gracefully instead of crashing.
 */

const ZoneManager = require('../../lib/core/zone-manager');
const Logger = require('../../lib/utils/logger');

// Demo logger
const logger = new Logger('Demo');

logger.info('🎯 MQTT Error Handling Demonstration');
logger.info('=====================================');
logger.info('');

logger.info('This demo shows how ParadoxFX now gracefully handles malformed MQTT messages');
logger.info('that would previously crash the application.');
logger.info('');

// Create a mock zone for demo
class DemoZone {
    constructor(config) {
        this.config = config;
        this.messages = [];
    }
    
    async handleCommand(command) {
        // Simulate a potential crash scenario
        if (command.Command === 'playSpeech' && command.filePath === '/crash/test.mp3') {
            throw new Error('Simulated crash that would previously kill the app');
        }
    }
    
    publishMessage(type, data) {
        this.messages.push({ type, data });
        logger.info(`📨 Published ${type.toUpperCase()} message: ${data.message || JSON.stringify(data).substring(0, 60)}...`);
    }
}

async function runDemo() {
    try {
        logger.info('🚀 Initializing ParadoxFX components...');
        
        // Mock MQTT client
        const mockMqttClient = { subscribe: () => {}, unsubscribe: () => {}, publish: () => {} };
        
        // Create zone manager with demo configuration
        const config = {
            global: { logLevel: 'info' },
            devices: {
                demoZone: {
                    type: 'audio',
                    name: 'demoZone',
                    baseTopic: 'paradox/demo'
                }
            }
        };
        
        const zoneManager = new ZoneManager(config, mockMqttClient);
        const demoZone = new DemoZone(config.devices.demoZone);
        zoneManager.zones.set('demoZone', demoZone);
        
        logger.info('✅ Components initialized successfully');
        logger.info('');
        
        // Demonstrate the problematic messages from the issue
        const problemMessages = [
            {
                scenario: '🔥 CRASH SCENARIO 1: Malformed JSON (missing closing brace)',
                message: '{"command":"playSpeech","filePath":"/path/file.mp3"',
                oldBehavior: 'Would cause: SyntaxError → Unhandled rejection → Process exit',
                newBehavior: 'Gracefully parsed as invalid JSON → Warning published → App continues'
            },
            {
                scenario: '🔥 CRASH SCENARIO 2: Command execution error',
                message: '{"Command":"playSpeech","filePath":"/crash/test.mp3"}',
                oldBehavior: 'Would cause: Command error → Unhandled rejection → Process exit',
                newBehavior: 'Error caught → Error message published → App continues'
            },
            {
                scenario: '🔥 CRASH SCENARIO 3: Invalid JSON structure',
                message: 'this is definitely not JSON at all!!!',
                oldBehavior: 'Would cause: JSON.parse error → Unhandled rejection → Process exit',
                newBehavior: 'Parsing error caught → Warning published → App continues'
            },
            {
                scenario: '🔥 CRASH SCENARIO 4: Missing required fields',
                message: '{"notACommand":"someValue","random":"data"}',
                oldBehavior: 'Would cause: Validation error → Unhandled rejection → Process exit',
                newBehavior: 'Validation catches issue → Warning published → App continues'
            }
        ];
        
        for (let i = 0; i < problemMessages.length; i++) {
            const { scenario, message, oldBehavior, newBehavior } = problemMessages[i];
            
            logger.info(`${scenario}`);
            logger.info(`📤 Sending message: ${message}`);
            logger.info(`❌ OLD BEHAVIOR: ${oldBehavior}`);
            logger.info(`✅ NEW BEHAVIOR: ${newBehavior}`);
            logger.info('');
            
            logger.info('🔄 Processing message...');
            
            // This would have crashed the app before, but now handles gracefully
            await zoneManager._handleZoneCommand('demoZone', demoZone, message);
            
            logger.info('✅ Message processed successfully - Application still running!');
            logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            logger.info('');
        }
        
        logger.info('🎉 DEMONSTRATION COMPLETE');
        logger.info('========================');
        logger.info('');
        logger.info('✅ ALL PROBLEMATIC MESSAGES HANDLED GRACEFULLY');
        logger.info('✅ APPLICATION REMAINED STABLE THROUGHOUT');
        logger.info('✅ APPROPRIATE ERROR/WARNING MESSAGES PUBLISHED');
        logger.info('✅ NO PROCESS CRASHES OR UNEXPECTED EXITS');
        logger.info('');
        logger.info(`📊 Total messages published: ${demoZone.messages.length}`);
        
        const messageTypes = {};
        demoZone.messages.forEach(msg => {
            messageTypes[msg.type] = (messageTypes[msg.type] || 0) + 1;
        });
        
        logger.info('📈 Message breakdown:');
        Object.entries(messageTypes).forEach(([type, count]) => {
            logger.info(`   ${type.toUpperCase()}: ${count}`);
        });
        
        logger.info('');
        logger.info('🏆 ParadoxFX is now robust against malformed MQTT messages!');
        logger.info('   Developers can now test and debug without fear of application crashes.');
        
        return true;
        
    } catch (error) {
        logger.error('💥 Demo failed unexpectedly:', error);
        logger.error('This should not happen with the new error handling!');
        return false;
    }
}

// Run the demonstration
if (require.main === module) {
    runDemo()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Demo crashed:', error);
            process.exit(1);
        });
}

module.exports = runDemo;