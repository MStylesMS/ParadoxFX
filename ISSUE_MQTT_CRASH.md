# ISSUE: PFX Application Crashes on Malformed MQTT Messages

## Problem Description
The ParadoxFX application crashes and shuts down completely whenever it receives an incorrect or malformed MQTT message. This makes debugging and development extremely difficult as every typo or test message causes a full application restart.

## Current Behavior
- Send any malformed JSON to an MQTT topic (e.g., missing quotes, invalid command, etc.)
- Application immediately crashes with unhandled rejection
- All MPV processes are terminated
- Full application restart required

## Expected Behavior
- Application should gracefully handle malformed MQTT messages
- Log errors without crashing
- Continue processing other valid messages
- Maintain system stability during development and production

## Root Cause Analysis
Looking at the logs, the crash appears to originate from:
1. `lib/core/message-router.js` - MQTT message parsing
2. Unhandled promise rejections propagating up to main application
3. No error boundaries or try-catch blocks around critical MQTT handling code

## Example Crash Scenarios
1. **Missing file path**: `{"command":"playSpeech","filePath":"/nonexistent/file.mp3"}`
2. **Malformed JSON**: `{"command":"playSpeech","filePath":"/path/file.mp3"`  (missing closing brace)
3. **Invalid command**: `{"command":"invalidCommand","param":"value"}`
4. **Wrong data types**: `{"command":"playSpeech","filePath":123}`

## Required Fixes
1. **Error Boundary in MessageRouter**: Wrap all MQTT message handling in try-catch
2. **Validation Layer**: Validate MQTT payloads before processing
3. **Graceful Degradation**: Log errors and continue operation instead of crashing
4. **Promise Rejection Handling**: Properly handle async errors in command processing
5. **Input Sanitization**: Validate file paths, command parameters, etc.

## Files to Investigate/Fix
- `lib/core/message-router.js` - Primary MQTT handling
- `lib/core/zone-manager.js` - Zone command processing  
- `lib/devices/*-device.js` - Individual device command handlers
- `start.js` - Main application error handling
- `lib/media/audio-manager.js` - Audio command processing

## Testing Strategy
After fixes, test with various malformed messages:
```bash
# Test malformed JSON
mosquitto_pub -h localhost -t paradox/zone1/command -m '{"command":"playSpeech"'

# Test missing required fields
mosquitto_pub -h localhost -t paradox/zone1/command -m '{"command":"playSpeech"}'

# Test invalid file paths
mosquitto_pub -h localhost -t paradox/zone1/command -m '{"command":"playSpeech","filePath":"/does/not/exist.mp3"}'

# Test invalid commands
mosquitto_pub -h localhost -t paradox/zone1/command -m '{"command":"fakeCommand","param":"test"}'
```

Application should log errors but continue running in all cases.

## Priority
**HIGH** - This blocks all development and testing workflows.

---

**To Copilot**: Please implement robust error handling throughout the MQTT message processing pipeline to prevent application crashes from malformed input. Focus on graceful error recovery and comprehensive logging.
