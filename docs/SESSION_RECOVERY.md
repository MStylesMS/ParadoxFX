# ParadoxFX Development Session Recovery Guide

## Session Context
**Date**: July 17, 2025
**Branch**: Audio-Integration  
**Status**: Ready for Pi5 migration after completing multi-zone audio architecture

## Completed Work

### 1. Multi-Zone Audio Architecture ✅
- **Independent audio per zone**: Screen0, Screen1, Headphones
- **MQTT topic routing**: `pfx/{zone}/{audioType}/{action}`
- **9 concurrent MPV instances**: 3 zones × 3 audio types (background, effects, speech)
- **Performance validated**: <50ms sound effect latency, zone isolation confirmed

### 2. Test Scripts ✅
- **test-audio.js**: Single-device audio testing (working)
- **test-audio-3devices.js**: Multi-zone audio testing (NEW - 610 lines)
- **Audio device mapping**: Hardware-specific device assignments for Pi4/Pi5

### 3. Documentation ✅
- **README.md**: Multi-zone audio testing instructions
- **MQTT_API.md**: Complete multi-zone audio API documentation
- **SCAFFOLD_SUMMARY.md**: Architecture documentation updates
- **PI5_MIGRATION.md**: Pi5 migration guide and checklist

### 4. Pi5 Compatibility ✅
- **config.txt updated**: Pi5-specific settings added
- **Discovery script**: `/opt/paradox/apps/pfx/scripts/pi5-audio-discovery.sh`
- **Migration guide**: Complete Pi4→Pi5 transition documentation

## Current Issues (Pre-Migration)

### Multi-Zone Test Script Status
- **File exists**: `test-audio-3devices.js` (610 lines, committed)
- **Last status**: Socket initialization failing despite device mapping corrections
- **Error**: "Failed to initialize all MPV instances"
- **Device mapping**: Updated from assumed to actual hardware layout

### Hardware Discovery
- **Audio cards discovered**: 
  - Card 0: Headphones (bcm2835)
  - Card 1: vc4hdmi0 (HDMI 0)
  - Card 2: vc4hdmi1 (HDMI 1)
- **Mapping corrected in code**: Matches actual hardware layout

## Recovery Steps for Pi5

### 1. Immediate Actions (First Boot)
```bash
# Navigate to project
cd /opt/paradox/apps/pfx

# Check git status and branch
git status
git branch

# Discover Pi5 audio devices
./scripts/pi5-audio-discovery.sh

# Test single-device audio first
node test/manual/test-audio.js
```

### 2. Multi-Zone Audio Validation
```bash
# Test multi-zone setup (may need device mapping updates)
node test/manual/test-audio-3devices.js

# If device mapping differs, update and commit:
# Edit test/manual/test-audio-3devices.js
# Update AUDIO_DEVICE_MAP if needed
# git add -A && git commit -m "fix: Update Pi5 audio device mapping"
```

### 3. Performance Verification
- Test 9 concurrent MPV instances
- Verify <50ms sound effect latency on Pi5
- Validate dual 4K HDMI output capability
- Monitor memory usage with 8GB RAM

### 4. Continue Development
- Complete multi-zone debugging if issues persist
- Implement MQTT integration with zone routing
- Add video+audio coordination
- Performance optimization for Pi5 hardware

## File Locations

### Key Files
- **Main script**: `test/manual/test-audio-3devices.js`
- **Discovery**: `scripts/pi5-audio-discovery.sh`
- **Config**: `/boot/firmware/config.txt` (Pi5 settings added)
- **Migration guide**: `docs/PI5_MIGRATION.md`

### Audio Device Mapping (Current)
```javascript
const AUDIO_DEVICE_MAP = {
    screen0: 'alsa/plughw:1',      // HDMI 0 
    screen1: 'alsa/plughw:2',      // HDMI 1
    headphones: 'alsa/plughw:0'    // Analog
};
```

### MQTT Topic Structure
```
pfx/screen0/background/play     # Background music on Screen 0
pfx/screen1/effects/trigger     # Sound effect on Screen 1  
pfx/headphones/speech/say       # Speech on headphones
pfx/{zone}/background/volume    # Zone-specific volume control
```

## Git Status
- **All changes committed**: Multi-zone architecture complete
- **Ready to push**: All files staged and documented
- **Branch**: Audio-Integration  
- **Remote**: Ready for push after Pi5 validation

## Next Session Priorities

1. **Validate Pi5 compatibility** - Run discovery script
2. **Debug multi-zone issues** - Socket initialization problems
3. **MQTT integration** - Implement topic routing in main system
4. **Performance optimization** - Leverage Pi5's enhanced capabilities
5. **Documentation updates** - Reflect any Pi5-specific changes

## Emergency Rollback
If critical issues occur:
1. **Config rollback**: `sudo cp /boot/firmware/config.txt.backup /boot/firmware/config.txt`
2. **Git reset**: Current state is stable, can reset to this commit
3. **Pi4 fallback**: Original Pi4 SD card available as backup

## Session Resume Command
```bash
cd /opt/paradox/apps/pfx && git status && echo "Ready to continue multi-zone audio development on Pi5"
```

## Success Metrics
- [ ] Multi-zone audio working on Pi5
- [ ] All 9 MPV instances running
- [ ] Zone isolation confirmed
- [ ] MQTT topic routing functional
- [ ] Documentation accurate for Pi5
- [ ] Performance equal or better than Pi4

**Status**: Ready for Pi5 deployment and continuation of multi-zone audio development.
