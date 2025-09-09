# PR CUE REFACTOR - Speech Queue Inspection Command

## Issue Description

The README.md documents a `speechQueue` command for inspecting the current speech queue, but this command is not implemented in the codebase. The similar `videoQueue` command exists and works properly for video queues.

## Analysis

1. **Documented but Missing Command**: The README shows:
   ```bash
   # Show current speech queue
   mosquitto_pub -h localhost -t "paradox/zone1/commands" -m '{"command": "speechQueue"}'
   ```

2. **Existing Similar Functionality**:
   - `videoQueue` command exists in `screen-device.js` and returns queue information
   - `clearSpeechQueue` command exists in `audio-zone.js` and works properly

3. **Current Speech Queue Infrastructure**:
   - `AudioManager` has `speechQueue` array and related processing logic
   - `AudioZone` has state tracking for speech queue length and processing status
   - Missing only the inspection command implementation

## Required Changes

### 1. Add speechQueue Command Support in AudioZone

File: `lib/zones/audio-zone.js`

- Add `speechQueue` to the supported commands list
- Add case handler for `speechQueue` command
- Implement `_speechQueue()` method to return queue information

### 2. Add Queue Inspection Method in AudioManager

File: `lib/media/audio-manager.js`

- Add `getSpeechQueueStatus()` method to expose queue information

## Implementation Plan

1. **Minimal Changes Only**: Add the missing `speechQueue` inspection command
2. **Follow Existing Patterns**: Mirror the implementation pattern used by `videoQueue`
3. **Maintain Consistency**: Use same message format and structure as video queue inspection
4. **No Breaking Changes**: Only add new functionality, don't modify existing working code

## Expected Behavior

The `speechQueue` command should return:
```json
{
  "type": "speech_queue",
  "queue": ["file1.wav", "file2.mp3"],
  "current": "current_file.wav",
  "length": 2,
  "isProcessing": true
}
```

This matches the pattern established by the `videoQueue` command and provides useful debugging information for speech queue management.