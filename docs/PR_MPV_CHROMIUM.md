# PR Implementation Plan: MPV/Chromium Window Switching (Option 6)

## Overview

This document outlines the detailed implementation plan for integrating the proven Option 6 window switching approach (xdotool windowactivate) into the ParadoxFX production system. Based on successful testing, this will enable seamless transitions between MPV video content and Chromium browser content (e.g., clock displays) on screen zones.

## Architecture Integration

### Current State Analysis

**Existing Screen Zone Architecture:**
- `ScreenZone` class handles MPV media playback via `MpvZoneManager`
- MQTT command handling through `ZoneManager` 
- Status publishing via `BaseZone.publishStatus()`
- Window management currently limited to MPV instances

**MQTT API Gap:**
- Browser/Clock commands documented but not implemented
- No window focus tracking in zone state
- No browser process management in screen zones

### Proposed Integration Strategy

**Phase 1: Core Browser Management**
- Add browser process management to `ScreenZone` class
- Implement window detection and switching functions
- Add browser lifecycle commands (enable/disable/show/hide)

**Phase 2: Enhanced Status Reporting**
- Extend zone status to include window focus and content tracking
- Enhance heartbeat messages with per-zone screen status

**Phase 3: Configuration Integration**
- Add browser configuration options to zone configs
- Implement browser auto-launch behavior (controlled by external applications)

## Detailed Implementation Plan

### 1. Documentation Updates

#### 1.1 MQTT_API.md Browser Commands (IMPLEMENT EXISTING SPEC)
The browser commands are already documented but need implementation:

**Commands to implement:**
- `enableBrowser` - Launch browser and position on zone's display
- `disableBrowser` - Terminate browser instance  
- `showBrowser` - Bring browser to front using Option 6 technique
- `hideBrowser` - Hide browser and return focus to MPV
- `setBrowserUrl` - Update browser URL (launch if needed)
- `setBrowserKeepAlive` - Enable/disable auto-restart behavior

**Status:** ✅ Already documented, needs code implementation

#### 1.2 Enhanced Status Fields
Update status documentation to include new fields in zone status messages:

```json
{
  "timestamp": "2025-08-15T10:30:00.000Z",
  "zone": "living-room-screen",
  "type": "status", 
  "current_state": {
    "status": "showing_browser",
    "focus": "chromium",
    "content": "http://localhost/clock/",
    "currentVideo": null,
    "currentImage": null,
    "browser": {
      "enabled": true,
      "url": "http://localhost/clock/",
      "process_id": 1234,
      "window_id": "0x2400001"
    }
  }
}
```

**New fields:**
- `focus`: "mpv" | "chromium" | "none" - Which window has focus
- `content`: File path, URL, or "none" - What content is currently displayed
- `browser`: Object with browser process and window details

#### 1.3 Heartbeat Enhancement
Extend system heartbeat to include aggregated zone status:

```json
{
  "timestamp": "2025-08-15T10:30:00.000Z",
  "application": "pfx",
  "device_name": "media-controller-01",
  "status": "online",
  "uptime": 3600.5,
  "zones": [
    {
      "name": "living-room-screen",
      "type": "screen",
      "focus": "chromium",
      "content": "http://localhost/clock/"
    },
    {
      "name": "kitchen-audio", 
      "type": "audio",
      "focus": "none",
      "content": "background-music.mp3"
    }
  ]
}
```

### 2. Core Implementation

#### 2.1 Screen Zone Browser Management

**File:** `lib/zones/screen-zone.js`

**New Properties:**
```javascript
// Add to constructor
this.browserManager = {
  process: null,
  windowId: null,
  url: null,
  enabled: false,
  keepAlive: false,
  profilePath: `/tmp/pfx-browser-${config.name}`
};

// Add to currentState
this.currentState = {
  ...this.currentState,
  focus: 'mpv',  // 'mpv' | 'chromium' | 'none'
  content: null, // current file/url being displayed
  browser: {
    enabled: false,
    url: null,
    process_id: null,
    window_id: null
  }
};
```

**New Methods:**
```javascript
// Window management (from Option 6 proof)
_findChromiumWindowId()
_findMpvWindowId() 
_activateWindow(windowId)
_waitForWindowByClass(className, timeout)

// Browser lifecycle
async _enableBrowser(url, focus = true)
async _disableBrowser()
async _showBrowser(effect = 'fade')
async _hideBrowser(effect = 'fade')
async _setBrowserUrl(url)
async _setBrowserKeepAlive(enabled)

// Window switching core
async _switchToMpv()
async _switchToBrowser()
```

**Command Handler Extensions:**
```javascript
// Add to handleCommand() switch statement
case 'enableBrowser':
  await this._enableBrowser(command.url, command.focus);
  break;
case 'disableBrowser':
  await this._disableBrowser();
  break;
case 'showBrowser':
  await this._showBrowser(command.effect);
  break;
case 'hideBrowser':
  await this._hideBrowser(command.effect);
  break;
case 'setBrowserUrl':
  await this._setBrowserUrl(command.url);
  break;
case 'setBrowserKeepAlive':
  await this._setBrowserKeepAlive(command.enabled);
  break;
```

**Supported Commands Update:**
```javascript
getSupportedCommands() {
  return [
    // Existing commands...
    'enableBrowser', 'disableBrowser', 'showBrowser', 'hideBrowser',
    'setBrowserUrl', 'setBrowserKeepAlive'
  ];
}
```

#### 2.2 Window Management Module

**New File:** `lib/utils/window-manager.js`

Extract window management functions from proof script into reusable module:

```javascript
class WindowManager {
  constructor(display = ':0') {
    this.display = display;
  }

  // Core window detection
  async findWindowByClass(className, timeout = 5000)
  async findWindowByName(name, timeout = 5000)
  
  // Window activation (Option 6)
  activateWindow(windowId)
  
  // Window positioning
  moveWindow(windowId, x, y)
  resizeWindow(windowId, width, height)
  fullscreenWindow(windowId)
  
  // Display detection
  getDisplays()
  pickTargetDisplay(preferSecondary = true)
  
  // Process management
  async launchChromium(options)
  killProcess(process)
}
```

#### 2.3 Status and Focus Tracking

**Enhanced publishStatus():**
```javascript
publishStatus() {
  // Update focus and content fields
  this._updateFocusAndContent();
  
  // Call parent with enhanced state
  super.publishStatus();
}

_updateFocusAndContent() {
  // Determine current focus based on active window
  if (this.browserManager.windowId && this._isWindowActive(this.browserManager.windowId)) {
    this.currentState.focus = 'chromium';
    this.currentState.content = this.browserManager.url;
  } else if (this.mpvWin && this._isWindowActive(this.mpvWin)) {
    this.currentState.focus = 'mpv';
    this.currentState.content = this.currentState.currentVideo || this.currentState.currentImage;
  } else {
    this.currentState.focus = 'none';
    this.currentState.content = 'none';
  }
  
  // Update browser status
  this.currentState.browser = {
    enabled: this.browserManager.enabled,
    url: this.browserManager.url,
    process_id: this.browserManager.process?.pid || null,
    window_id: this.browserManager.windowId
  };
}
```

#### 2.4 Enhanced Heartbeat

**File:** `lib/core/mqtt-client.js`

**Modify _startHeartbeat():**
```javascript
_startHeartbeat() {
  setInterval(() => {
    if (this.connected) {
      const heartbeat = {
        timestamp: new Date().toISOString(),
        application: 'pfx',
        device_name: this.config.deviceName,
        ip_address: this._getLocalIpAddress(),
        status: 'online',
        uptime: process.uptime()
      };

      // Add zone status summary if ZoneManager available
      if (this.zoneManager) {
        heartbeat.zones = this._getZonesSummary();
      }

      this.publish(this.config.heartbeatTopic, heartbeat);
    }
  }, this.config.heartbeatInterval);
}

_getZonesSummary() {
  return this.zoneManager.getAllZones().map(zone => ({
    name: zone.config.name,
    type: zone.config.type,
    focus: zone.currentState.focus || 'none',
    content: zone.currentState.content || 'none'
  }));
}
```

#### 2.5 MQTT Integration for Clock Fade Commands

**Enhanced Browser Show/Hide:**
```javascript
async _showBrowser(effect = 'fade') {
  if (!this.browserManager.enabled) {
    throw new Error('Browser not enabled');
  }

  // Optional fade-in effect
  if (effect === 'fade') {
    await this._publishClockCommand({ command: 'fadeIn' });
    await this._delay(500); // Allow fade to start
  }

  // Switch focus to browser
  await this._switchToBrowser();
  
  this.currentState.focus = 'chromium';
  this.currentState.content = this.browserManager.url;
  this.publishStatus();
  this.publishEvent({ browser_shown: true, effect });
}

async _hideBrowser(effect = 'fade') {
  // Optional fade-out effect  
  if (effect === 'fade') {
    await this._publishClockCommand({ command: 'fadeOut' });
    await this._delay(2000); // Allow fade to complete
  }

  // Switch focus back to MPV
  await this._switchToMpv();
  
  this.currentState.focus = 'mpv';
  this.currentState.content = this.currentState.currentVideo || this.currentState.currentImage;
  this.publishStatus();
  this.publishEvent({ browser_hidden: true, effect });
}

async _publishClockCommand(command) {
  const topic = 'paradox/houdini/clock/commands';
  this.mqttClient.publish(topic, command);
}
```

### 3. Testing Strategy

#### 3.1 Unit Tests

**New Test Files:**
- `test/unit/window-manager.test.js` - Window management functions
- `test/unit/screen-zone-browser.test.js` - Browser management in ScreenZone

**Test Coverage:**
- Window detection and activation
- Browser process lifecycle  
- MQTT command handling
- Status field updates
- Error handling and recovery

#### 3.2 Integration Tests

**Enhanced Files:**
- `test/integration/screen-zone.test.js` - Add browser switching tests
- `test/integration/mqtt-commands.test.js` - Add browser command tests

**Test Scenarios:**
- End-to-end browser launch and switching
- MQTT command validation
- Multi-cycle switching reliability
- Error recovery (process crashes)

#### 3.3 Manual Testing

**Test Script Enhancement:**
- Update existing proof script for production testing
- Add configuration validation
- Test on multiple Pi models
- Validate HDMI display targeting

### 4. Configuration Design Decision

#### Browser Auto-Launch Consideration

**Question:** Should PFX auto-launch browser on startup with default URL?

**Recommendation: NO - External Control**

**Reasoning:**
1. **Separation of Concerns:** PFX should focus on media playback, not UI policy
2. **Flexibility:** Different escape rooms may want different browser timing
3. **Resource Management:** Browser should only run when needed
4. **Configuration Complexity:** Avoids need for per-zone browser config
5. **Debugging:** Easier to troubleshoot when browser launch is explicit

**Implementation:**
- No `browser_enabled` or `default_url` config options
- Browser only launches via explicit `enableBrowser` command
- External control systems (Node-RED, custom apps) handle browser policy
- Zone status clearly indicates when browser is/isn't available

**Example Control Flow:**
```
1. PFX starts -> MPV ready, no browser
2. External app sends enableBrowser -> Browser launches
3. External app controls showBrowser/hideBrowser timing
4. External app sends disableBrowser when done
```

### 5. Implementation Timeline

#### Phase 1: Core Browser Management (Week 1)
- [ ] Create WindowManager utility class
- [ ] Add browser management to ScreenZone
- [ ] Implement basic browser commands (enable/disable)
- [ ] Add unit tests for window management

#### Phase 2: Window Switching (Week 2)  
- [ ] Implement showBrowser/hideBrowser with Option 6 technique
- [ ] Add MQTT clock fade integration
- [ ] Enhance status reporting with focus/content fields
- [ ] Add integration tests for switching

#### Phase 3: Status and Monitoring (Week 3)
- [ ] Enhance heartbeat with zone summaries
- [ ] Add browser process monitoring and auto-restart
- [ ] Implement setBrowserUrl and setBrowserKeepAlive
- [ ] Add comprehensive error handling

#### Phase 4: Testing and Validation (Week 4)
- [ ] Manual testing on Pi hardware
- [ ] Performance validation (switching latency)
- [ ] Multi-zone testing
- [ ] Documentation updates and examples

### 6. Success Criteria

#### Functional Requirements
- ✅ Browser launches and positions correctly on target display
- ✅ Window switching completes in <200ms (seamless)
- ✅ MQTT commands work reliably
- ✅ Status reporting includes accurate focus/content tracking
- ✅ Process recovery handles browser crashes gracefully

#### Performance Requirements  
- ✅ No visual artifacts during switching
- ✅ Fade effects coordinate properly with window switching
- ✅ Memory usage remains stable during extended operation
- ✅ CPU impact minimal (<5% additional load)

#### Reliability Requirements
- ✅ 1000+ switching cycles without failure
- ✅ Recovery from browser process crashes
- ✅ Graceful handling of window manager errors
- ✅ Proper cleanup on zone shutdown

### 7. Risk Mitigation

#### Technical Risks
1. **Window Manager Dependency:** Fallback to wmctrl if xdotool fails
2. **Browser Crashes:** Implement keepAlive monitoring and auto-restart
3. **Display Configuration:** Robust display detection and fallback to primary
4. **Resource Leaks:** Proper cleanup in shutdown and error paths

#### Operational Risks  
1. **Configuration Complexity:** Keep browser settings minimal and well-documented
2. **Debugging Difficulty:** Enhanced logging for window management operations
3. **Platform Differences:** Test on Pi3, Pi4, Pi5, and desktop Linux

### 8. Future Enhancements

#### Potential Extensions
- **Multi-Browser Support:** Different browser instances per zone
- **Browser Profiles:** Custom user-data-dir per application
- **Window Positioning:** More granular control over browser placement
- **Performance Monitoring:** Track switching latency and system impact

#### Integration Opportunities
- **Effect System:** Coordinate browser transitions with lighting effects
- **Zone Coordination:** Synchronize browser actions across multiple zones
- **Remote Management:** Web interface for browser control and monitoring

## Conclusion

This implementation plan provides a comprehensive approach to integrating the proven Option 6 window switching technique into ParadoxFX production. The design prioritizes reliability, maintainability, and separation of concerns while providing the necessary functionality for seamless MPV/browser transitions.

The decision to avoid auto-launch configuration keeps the system simple and flexible, allowing external applications to control browser policy while PFX focuses on its core media playback responsibilities.

**Next Step:** Review this plan and approve for implementation, then begin Phase 1 development.
