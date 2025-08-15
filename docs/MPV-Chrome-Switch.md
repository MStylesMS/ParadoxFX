# Z-Order Window Stacking Test Results

Testing different approaches for switching between MPV and Chromium browser windows without geometry changes.

## Test Environment
- **OS**: Raspberry Pi OS Bookworm with X11/Openbox
- **Setup**: MPV and Chromium both positioned fullscreen on secondary display (HDMI-2)
- **Goal**: Only change Z-order (which window is on top), never move/resize/fullscreen toggle

## Test Results

### ❌ Option 1: MPV-only manipulation
**Approach**: Only manipulate MPV window states, leave browser alone
- **Show browser**: `removeWinState(mpvWin, 'above')` + `addWinState(mpvWin, 'below')`
- **Show MPV**: `removeWinState(mpvWin, 'below')` + `addWinState(mpvWin, 'above')`
- **Result**: FAILED - Script completed but transitions didn't work visually

### ❌ Option 2: Browser-only manipulation  
**Approach**: Only manipulate browser window states, leave MPV alone
- **Show browser**: `removeWinState(chromeWin, 'below')` + `addWinState(chromeWin, 'above')`
- **Show MPV**: `removeWinState(chromeWin, 'above')` + `addWinState(chromeWin, 'below')`
- **Result**: PARTIAL - First transition (MPV → browser) worked, but MPV never came back to front

### ✅ Option 3: wmctrl activate/raise
**Approach**: Use `wmctrl -i -a ${winId}` to explicitly activate/raise desired window
- **Show browser**: `wmctrl -i -a ${chromeWin}`
- **Show MPV**: `wmctrl -i -a ${mpvWin}`
- **Result**: SUCCESS - Both transitions worked properly, cycles completed cleanly

### ❌ Option 4: xdotool windowraise
**Approach**: Use `xdotool windowraise` and `xdotool windowlower` for Z-order
- **Show browser**: `xdotool windowraise ${chromeWin}`
- **Show MPV**: `xdotool windowraise ${mpvWin}`
- **Result**: FAILED - Browser window never showed during transitions

### ❌ Option 5: wmctrl restack command
**Approach**: Use `wmctrl -r window -e` to restack windows relative to each other
- **Show browser**: `wmctrl -i -r ${chromeWin} -b add,above` (restack above MPV)
- **Show MPV**: `wmctrl -i -r ${mpvWin} -b add,above` (restack above browser)
- **Result**: FAILED - Browser never showed during transitions

### ✅ Option 6: xdotool windowactivate
**Approach**: Use `xdotool windowactivate` (focus + raise) 
- **Show browser**: `xdotool windowactivate ${chromeWin}`
- **Show MPV**: `xdotool windowactivate ${mpvWin}`
- **Result**: SUCCESS - Both transitions worked properly, cycles completed cleanly

### 🚧 Option 7: wmctrl desktop switching (PENDING)
**Approach**: Keep windows on different virtual desktops, switch desktops
- **Status**: Not yet implemented

### 🚧 Option 8: Combined focus+raise (PENDING)
**Approach**: Use both `xdotool windowfocus` and `xdotool windowraise`
- **Status**: Not yet implemented

### 🚧 Option 9: Alternating bring-to-front (PENDING)
**Approach**: Always bring desired window to front, never send to back
- **Status**: Not yet implemented

### 🚧 Option 10: Alternating send-to-back (PENDING)
**Approach**: Always send current front window to back, never bring to front
- **Status**: Not yet implemented

## Current Status
**Working approaches**: 
- ✅ **Option 3** (wmctrl activate/raise) - `wmctrl -i -a ${winId}`
- ✅ **Option 6** (xdotool windowactivate) - `xdotool windowactivate ${winId}`

**Failed approaches**: Options 1, 2, 4, 5

**Pending tests**: Options 7-10

## Notes
- Options 1-2 using wmctrl above/below states had reliability issues
- Options 3 and 6 both use explicit activation (focus + raise) which works reliably  
- Option 4 failed because it only raises without focusing
- Option 5 failed because it manipulates window states without activation
- GBM DMA-BUF errors from Chromium are cosmetic (expected on X11)
- X11 BadWindow errors during startup are cosmetic (rapid window queries)

---

## Implementation Guide: MPV ↔ Chromium Window Switching

Based on successful testing of Options 3 and 6, here's how to implement reliable window switching between MPV and Chromium browser:

### Prerequisites

**System Requirements:**
- X11 session (DISPLAY set, Openbox or similar window manager)
- Required binaries in PATH: `mpv`, `xdotool`, `wmctrl`, `chromium-browser` or `chromium`
- Node.js with `mqtt` package for optional clock integration

**Media Files:**
- Default static image: `/opt/paradox/media/test/defaults/default.png`
- Video content: `/opt/paradox/media/test/defaults/default.mp4`

### Architecture Overview

The implementation uses a **two-phase approach**:

1. **Setup Phase**: Launch and position both windows (flicker acceptable)
2. **Operation Phase**: Only change Z-order (seamless switching)

### Core Implementation

#### 1. Window Detection Functions

```javascript
function findChromiumWindowId() {
  // Try custom class first
  try {
    const out = execSync(`xdotool search --class ${CHROME_CLASS} | tail -n1`, { 
      env: { ...process.env, DISPLAY } 
    }).toString().trim();
    if (out) return out;
  } catch {}
  
  // Fallback to common chromium classes
  for (const cls of ['chromium-browser', 'chromium', 'Chromium']) {
    try {
      const out = execSync(`xdotool search --class ${cls} | tail -n1`, { 
        env: { ...process.env, DISPLAY } 
      }).toString().trim();
      if (out) return out;
    } catch {}
  }
  return null;
}

function getWindowIdByNameExact(name) {
  try {
    const out = execSync(`xdotool search --name '^${name}$' | head -n1`, { 
      env: { ...process.env, DISPLAY } 
    }).toString().trim();
    return out || null;
  } catch { 
    return null; 
  }
}
```

#### 2. Window Switching Function (Option 6 - Recommended)

```javascript
function xdotoolActivateWindow(winId) {
  try {
    execSync(`xdotool windowactivate ${winId}`, { 
      env: { ...process.env, DISPLAY } 
    });
  } catch (e) { 
    log(`xdotool windowactivate failed: ${e.message}`); 
  }
}
```

**Alternative Function (Option 3):**
```javascript
function wmctrlActivateWindow(winId) {
  try {
    execSync(`wmctrl -i -a ${winId}`, { 
      env: { ...process.env, DISPLAY } 
    });
  } catch (e) { 
    log(`wmctrl activate failed: ${e.message}`); 
  }
}
```

#### 3. Setup Phase Implementation

```javascript
// Launch Chromium with specific positioning
const chromeArgs = [
  `--user-data-dir=${CHROME_PROFILE}`,
  `--class=${CHROME_CLASS}`,
  '--no-first-run',
  '--disable-infobars', 
  '--disable-session-crashed-bubble',
  '--no-default-browser-check',
  `--window-position=${targetDisplay.x},${targetDisplay.y}`,
  `--window-size=${targetDisplay.width},${targetDisplay.height}`,
  '--start-fullscreen',
  `--app=${CHROME_URL}`
];
const chrome = spawn(chromeBin, chromeArgs, { 
  stdio: ['ignore', 'ignore', 'pipe'], 
  env: { ...process.env, DISPLAY } 
});

// Position and configure Chromium window
let chromeWin = await waitForWindowByClass(CHROME_CLASS, 4000);
if (chromeWin) {
  moveWindowToDisplay(chromeWin, targetDisplay);
  fullscreenWindow(chromeWin);
  addWinState(chromeWin, 'below'); // Start behind MPV
}

// Launch MPV with IPC enabled
const mpvArgs = [
  '--no-terminal',
  '--force-window=yes',
  '--keep-open=yes',
  `--geometry=${targetDisplay.width}x${targetDisplay.height}+${targetDisplay.x}+${targetDisplay.y}`,
  '--no-border',
  '--title=ParadoxMPV',
  `--input-ipc-server=${MPV_IPC}`,
  initialMedia
];
const mpv = spawn('mpv', mpvArgs, { 
  stdio: ['ignore', 'pipe', 'pipe'], 
  env: { ...process.env, DISPLAY } 
});

// Position MPV window
let mpvWin = getWindowIdByNameExact('ParadoxMPV');
if (mpvWin) {
  moveWindowToDisplay(mpvWin, targetDisplay);
  addWinState(mpvWin, 'above'); // Start in front
}
```

#### 4. Operation Phase Implementation

```javascript
// Show browser (from MPV)
log('SWITCHING TO BROWSER: xdotool windowactivate (focus + raise)');
if (chromeWin) {
  xdotoolActivateWindow(chromeWin);
}

// Show MPV (from browser)  
log('SWITCHING TO MPV: xdotool windowactivate (focus + raise)');
if (mpvWin) {
  xdotoolActivateWindow(mpvWin);
}
```

### Key Implementation Notes

**Why These Methods Work:**
- Both `xdotool windowactivate` and `wmctrl -i -a` perform **focus + raise** operations
- This combination ensures the target window becomes both active and topmost
- Unlike pure raise/lower operations, activation handles window manager focus properly

**Why Other Methods Failed:**
- **Options 1-2**: State manipulation (`above`/`below`) without activation is unreliable
- **Option 4**: `xdotool windowraise` only changes Z-order without focus
- **Option 5**: State manipulation with restack commands lacks proper activation

**Best Practices:**
- Always detect window IDs after launching applications (windows may take time to appear)
- Use fallback detection methods for robustness 
- Keep geometry operations separate from Z-order operations
- Include error handling for all window management commands
- Test both directions of switching (MPV→browser and browser→MPV)

**Performance Considerations:**
- Window activation is instantaneous (no visual delays)
- Setup phase positioning can flicker briefly (acceptable during initialization)
- Operation phase switching is seamless and smooth

This implementation provides reliable, seamless window switching suitable for production use in escape room or interactive media applications.
