# playEffect vs playAudioFX - Comparison Analysis

## Overview
Both commands play sound effects but with different architectures and capabilities.

## Current Implementation: playAudioFX

### Description
Basic sound effect playback using the existing audio system.

### Features
- Simple fire-and-forget playback
- Uses existing MPV audio pipeline
- Basic volume control
- No special optimization for rapid effects

### Usage
```json
{
  "command": "playAudioFX", 
  "file": "click.wav",
  "volume": 80
}
```

### Implementation
- Routes through standard audio manager
- Uses speech MPV instance typically
- No special preloading or caching

## Proposed Implementation: playEffect

### Description
Advanced sound effect system optimized for low-latency, rapid-fire effects.

### Enhanced Features
- **Low latency**: Optimized for immediate playback
- **Preloading**: Cache frequently used effects in memory
- **Overlap support**: Multiple effects can play simultaneously
- **Dedicated pipeline**: Separate audio chain from speech/music
- **Fire-and-forget**: No queue management overhead

### Usage
```json
{
  "command": "playEffect",
  "file": "click.wav", 
  "volume": 75,
  "preload": true,
  "overlap": true
}
```

### Technical Differences

| Feature | playAudioFX | playEffect |
|---------|-------------|------------|
| Latency | Standard | Low (optimized) |
| Preloading | No | Yes (optional) |
| Overlap | Limited | Full support |
| Pipeline | Shared (speech) | Dedicated |
| Caching | No | Yes |
| Queue | Uses speech queue | None (immediate) |

### Use Cases

**playAudioFX (Current)**
- Notifications and alerts
- Longer audio clips
- When overlap isn't critical
- Integration with existing ducking system

**playEffect (Proposed)**
- UI feedback sounds (clicks, beeps)
- Game sound effects
- Rapid-fire audio cues
- When immediate response is critical

## Implementation Recommendations

### Phase 1: Keep playAudioFX
- Maintain backward compatibility
- Continue using for longer audio clips
- Good for notification sounds

### Phase 2: Add playEffect 
- Implement dedicated effects pipeline
- Add preloading system
- Support simultaneous playback
- Optimize for minimal latency

### Phase 3: Migration Strategy
- Keep both commands available
- Use playEffect for short, frequent sounds
- Use playAudioFX for longer notifications
- Document best practices for each

## Technical Implementation Notes

### playEffect Architecture
```
Command → Effects Manager → Preload Cache → Dedicated MPV Instance → Audio Output
```

### Key Components Needed
1. **Effects Manager**: Handles preloading, caching, overlap
2. **Dedicated MPV Instance**: Separate from speech/music pipeline  
3. **Preload System**: Load common effects into memory
4. **Overlap Coordinator**: Manage simultaneous playback

### Configuration Options
```ini
[effects]
preload_common=true
max_simultaneous=5
dedicated_instance=true
cache_size_mb=50
```

## Conclusion
Both commands serve different purposes:
- **playAudioFX**: General-purpose audio notifications
- **playEffect**: High-performance game/UI sound effects

The dual approach provides flexibility for different audio requirements while maintaining backward compatibility.
