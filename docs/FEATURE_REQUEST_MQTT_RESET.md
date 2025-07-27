# Feature Request: MQTT Reset/Cleanup Command

## Summary
Add an MQTT command that can reset and clean up ParadoxFX system state without requiring a full machine reboot.

## Problem Statement
During development and production use, the ParadoxFX system can encounter situations where:

1. **Orphaned MPV processes** remain running after crashes or improper shutdowns
2. **Stale IPC socket files** accumulate in `/tmp/` and prevent new instances from starting
3. **Lingering PulseAudio combined sinks** from dual-output configurations remain loaded
4. **Background/speech MPV instances** become unresponsive but continue consuming resources
5. **System recovery** requires manual intervention or machine reboot

## Proposed Solution

### Option A: PFX Restart Command
```bash
# MQTT command
mosquitto_pub -t "paradox/system/command" -m '{"command":"restart","reason":"cleanup"}'
```

**Behavior:**
- Gracefully shutdown all devices and MPV instances
- Clean up socket files and combined sinks
- Reinitialize all devices and audio systems
- Publish status updates during restart process

### Option B: Selective Reset Command
```bash
# MQTT commands for targeted cleanup
mosquitto_pub -t "paradox/system/command" -m '{"command":"reset_audio","zones":["zone1","zone3"]}'
mosquitto_pub -t "paradox/system/command" -m '{"command":"reset_sockets"}'
mosquitto_pub -t "paradox/system/command" -m '{"command":"cleanup_orphans"}'
```

**Behavior:**
- Allow selective reset of specific components
- Keep PFX main process running
- Targeted cleanup without full system restart

## Technical Implementation Considerations

### Core Components to Reset
1. **MPV Process Management**
   - Kill all MPV instances spawned by PFX
   - Preserve process tracking to avoid killing external MPV instances
   - Handle both IPC and spawn-based MPV processes

2. **IPC Socket Cleanup**
   - Remove socket files: `/tmp/pfx-*.sock`, `/tmp/mpv-*.sock`
   - Verify sockets are not in use before removal
   - Recreate sockets during reinitialization

3. **PulseAudio Combined Sink Management**
   - Track loaded combine modules by PFX
   - Unload only PFX-created combined sinks
   - Preserve user-created audio configurations

4. **Device State Reset**
   - Reset device internal state machines
   - Clear queued commands and pending operations
   - Reinitialize background music and speech systems

### Integration with Keep-Alive Systems

⚠️ **Important Consideration**: This feature may interact with future keep-alive functionality:

- **Background Music Keep-Alive**: If background music instances are designed to stay persistent, the reset command should account for this
- **Speech Queue Management**: Ongoing speech operations should complete gracefully before reset
- **Health Check Integration**: Reset command could be triggered automatically by health monitoring
- **State Recovery**: System should be able to restore previous playing state after reset

### MQTT Command Structure

```json
{
  "command": "system_reset",
  "type": "full|audio|sockets|orphans",
  "zones": ["zone1", "zone2", "zone3"],  // optional: specific zones
  "preserve_state": true,                // optional: try to restore playing state
  "force": false,                        // optional: force kill processes
  "timeout": 30                          // optional: timeout in seconds
}
### Status Reporting

```json
{
  "timestamp": "2025-07-23T18:00:00.000Z",
  "type": "system_reset_status",
  "phase": "starting|cleanup|reinit|complete|failed",
  "progress": {
    "mpv_processes_killed": 3,
    "sockets_cleaned": 5,
    "sinks_unloaded": 1,
    "devices_reinitialized": 3
  },
  "errors": [],
  "duration_ms": 2500
}
```

## Benefits

1. **Reduced Downtime**: Avoid full machine reboots for system recovery
2. **Development Efficiency**: Quick recovery during development and testing
3. **Production Reliability**: Self-healing capability for production deployments
4. **Remote Management**: System administrators can reset remotely via MQTT
5. **Selective Recovery**: Target specific problems without affecting working components

## Implementation Priority

**Phase 1**: Basic cleanup command (sockets, orphaned processes)  
**Phase 2**: Full PFX restart command with state preservation  
**Phase 3**: Selective reset with granular control  
**Phase 4**: Integration with keep-alive and health monitoring

---

**Priority**: Medium-High  
**Complexity**: Medium  
**Impact**: High (significantly improves system reliability and maintainability)
3. **Audio Sink Issues**: Combined audio sinks for dual output may accumulate over time
4. **Resource Leaks**: Memory or audio device locks from improperly terminated processes

Currently, these issues require either:
- Manual intervention via shell commands
- Full system reboot (heavy-handed approach)
- PFX restart (requires stopping/starting the entire application)

## **Proposed Solution**

Implement an MQTT command-based reset/cleanup system that can be triggered remotely:

### **Core Feature: Reset Command**

```bash
# MQTT command to trigger system cleanup
mosquitto_pub -t "paradox/system/command" -m '{"command":"reset","level":"soft"}'
mosquitto_pub -t "paradox/system/command" -m '{"command":"reset","level":"hard"}'
```

### **Reset Levels**

#### **Soft Reset (Recommended Default)**
- Keep ParadoxFX running
- Gracefully restart all device managers
- Clean up orphaned MPV processes
- Remove stale socket files
- Recreate audio sinks if needed
- Preserve MQTT connections and configuration

#### **Hard Reset (Nuclear Option)**
- Stop all MPV processes immediately
- Remove all socket files
- Unload all audio sink modules
- Reinitialize entire device system
- Reset all device states to defaults

## **Technical Implementation**

### **1. System Device Addition**
Add a new system-level device type:

```ini
[system:main]
type = system
topic = paradox/system
commands = reset,health_check,diagnostics
```

### **2. Reset Command Handler**
```javascript
async handleResetCommand(params) {
    const level = params.level || 'soft';
    
    switch (level) {
        case 'soft':
            await this._softReset();
            break;
        case 'hard':
            await this._hardReset();
            break;
        default:
            throw new Error(`Unknown reset level: ${level}`);
    }
    
    this._publishResetStatus(level, 'completed');
}
```

### **3. Cleanup Operations**
```javascript
async _softReset() {
    // 1. Gracefully stop all audio/video streams
    await this._stopAllStreams();
    
    // 2. Clean up processes and sockets
    await this._cleanupResources();
    
    // 3. Reinitialize all devices
    await this._reinitializeDevices();
}

async _hardReset() {
    // 1. Force kill all MPV processes
    await this._forceKillMpvProcesses();
    
    // 2. Remove all socket files
    await this._removeAllSockets();
    
    // 3. Reset audio system
    await this._resetAudioSystem();
    
    // 4. Full device reinitialization
    await this._fullReinitialize();
}
```

## **Integration with Keep-Alive System**

### **Relationship to Keep-Alive**
This feature would complement a potential keep-alive system:

1. **Keep-Alive**: Monitors device health and automatically restarts failed components
2. **Reset Command**: Manual intervention when keep-alive cannot resolve issues
3. **Diagnostics**: Provides information about what needs resetting

### **Suggested Keep-Alive Integration**
```javascript
// Keep-alive could trigger automatic soft resets
if (this.consecutiveFailures > 3) {
    this.logger.warn('Multiple failures detected, triggering automatic soft reset');
    await this.handleResetCommand({ level: 'soft', source: 'keep-alive' });
}
```

## **Additional Commands**

### **Health Check Command**
```bash
mosquitto_pub -t "paradox/system/command" -m '{"command":"health_check"}'
```
Returns:
- Active MPV process count
- Socket file status
- Audio sink status
- Device initialization status
- Memory usage

### **Diagnostics Command**
```bash
mosquitto_pub -t "paradox/system/command" -m '{"command":"diagnostics"}'
```
Returns:
- List of all running processes
- Socket file inventory
- Audio device status
- Recent error logs
- System resource usage

## **Benefits**

1. **Remote Management**: Fix issues without shell access
2. **Automation**: Integrate with monitoring systems
3. **Reliability**: Recover from common failure scenarios
4. **Maintenance**: Routine cleanup without downtime
5. **Debugging**: Better visibility into system state

## **Implementation Priority**

### **Phase 1: Core Reset**
- Basic soft/hard reset functionality
- MQTT command handling
- Resource cleanup operations

### **Phase 2: Enhanced Features**
- Health check and diagnostics
- Integration with keep-alive system
- Configurable reset policies

### **Phase 3: Advanced Management**
- Scheduled maintenance resets
- Automated failure recovery
- Comprehensive system monitoring

## **Configuration Example**

```ini
[system:main]
type = system
topic = paradox/system
status_topic = paradox/system/status
reset_timeout = 30000
auto_reset_enabled = false
auto_reset_threshold = 5
keep_alive_enabled = true
keep_alive_interval = 60000
```

## **Status Reporting**

The system would publish status updates during reset operations:

```json
{
  "timestamp": "2025-07-23T18:00:00.000Z",
  "device": "system:main",
  "type": "reset_status",
  "operation": "soft_reset",
  "stage": "cleanup_processes",
  "progress": 60,
  "message": "Cleaning up 3 orphaned MPV processes"
}
```

This feature would significantly improve ParadoxFX's operational reliability and reduce the need for manual intervention or system reboots.
