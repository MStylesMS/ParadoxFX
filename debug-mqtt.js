/**
 * Debug MQTT integration test to find where it hangs
 */

const MqttClient = require('./lib/core/mqtt-client');

async function debugTest() {
    console.log('=== Starting debug test ===');
    
    const config = {
        mqttServer: 'localhost',
        mqttPort: 1883,
        heartbeatTopic: 'test/integration/heartbeat',
        heartbeatInterval: 5000
    };

    console.log('1. Creating MqttClient...');
    const mqttClient = new MqttClient(config);
    
    console.log('2. Starting connection...');
    console.time('connect');
    
    try {
        await mqttClient.connect();
        console.timeEnd('connect');
        console.log('3. ✅ Connection successful');
        console.log('   Connected:', mqttClient.connected);
        
        console.log('4. Starting disconnection...');
        console.time('disconnect');
        
        await mqttClient.disconnect();
        console.timeEnd('disconnect');
        console.log('5. ✅ Disconnection successful');
        
        console.log('6. Test complete!');
        process.exit(0);
        
    } catch (error) {
        console.log('❌ Error:', error.message);
        console.log(error.stack);
        process.exit(1);
    }
}

// Run the test with timeout
debugTest();

setTimeout(() => {
    console.log('❌ DEBUG TEST TIMEOUT - Something is hanging');
    process.exit(1);
}, 20000);
