# Z-Order Window Stacking Test Resu### ❌ Option 5: wmctrl restack command
**Approach**: Use `wmctrl -r window -e` to restack windows relative to each other
- **Show browser**: `wmctrl -i -r ${chromeWin} -b add,above` (restack above MPV)
- **Show MPV**: `wmctrl -i -r ${mpvWin} -b add,above` (restack above browser)
- **Result**: FAILED - Browser never showed during transitions

### 🚧 Option 6: xdotool windowactivate (PENDING)Testing different approaches for switching between MPV and Chromium browser windows without geometry changes.

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

### 🚧 Option 5: wmctrl restack command (PENDING)
**Approach**: Use `wmctrl -r window -e` to restack windows relative to each other
- **Status**: Not yet implemented

### 🚧 Option 6: xdotool windowactivate (PENDING)  
**Approach**: Use `xdotool windowactivate` (focus + raise)
- **Status**: Not yet implemented

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
**Best working approach so far**: Option 3 (wmctrl activate/raise)

**Next to test**: Option 4 (xdotool windowraise) - prepared and ready

## Notes
- Options 1-2 using wmctrl above/below states had reliability issues
- Option 3's explicit activation approach works much more reliably
- GBM DMA-BUF errors from Chromium are cosmetic (expected on X11)
- X11 BadWindow errors during startup are cosmetic (rapid window queries)
