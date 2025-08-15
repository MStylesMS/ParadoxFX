#!/usr/bin/env node
/**
 * Proof-of-approach: Launch MPV (with IPC) and Chromium, switch between them,
 * publish MQTT fadeIn/fadeout to the clock, then clean up.
 *
 * Requirements:
 * - X11 session (DISPLAY set, Openbox or similar)
 * - mpv, xdotool, wmctrl, chromium/chromium-browser binaries in PATH
 * - MQTT broker on localhost (for clock commands)
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const mqtt = require('mqtt');
const http = require('http');

const VIDEO = '/opt/paradox/media/test/defaults/default.mp4';
const DEFAULT_IMAGE = '/opt/paradox/media/test/defaults/default.png';
const MPV_IPC = '/tmp/proof-mpv.sock';
const CHROME_PROFILE = '/tmp/paradox-clock-profile';
const CHROME_CLASS = 'ParadoxBrowser';
const CHROME_URL = process.env.PARADOX_CLOCK_URL || 'http://localhost/clock/';
const MQTT_URL = process.env.PARADOX_MQTT_URL || 'mqtt://localhost';
const DISPLAY = process.env.DISPLAY || ':0';

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function binExists(cmd) {
  try {
    execSync(`command -v ${cmd} >/dev/null 2>&1`);
    return true;
  } catch {
    return false;
  }
}

function pickChromiumBinary() {
  const candidates = ['chromium-browser', 'chromium'];
  for (const c of candidates) {
    if (binExists(c)) return c;
  }
  throw new Error('Chromium binary not found (tried chromium-browser, chromium). Install chromium.');
}

function ensureDeps() {
  const missing = [];
  for (const b of ['mpv', 'xdotool', 'wmctrl']) {
    if (!binExists(b)) missing.push(b);
  }
  if (missing.length) {
    log(`WARNING: Missing system binaries: ${missing.join(', ')}. Script will try to proceed but stacking may not work.`);
  }
}

function safeUnlink(p) {
  try { fs.unlinkSync(p); } catch (_) {}
}

async function waitForSocket(sockPath, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(sockPath)) return true;
    await sleep(100);
  }
  return false;
}

async function waitForWindowByClass(className, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
  const out = execSync(`xdotool search --class ${className} | tail -n1`, { env: { ...process.env, DISPLAY } }).toString().trim();
  if (out) return out.split('\n').slice(-1)[0].trim();
    } catch (_) {}
    await sleep(200);
  }
  return null;
}

function findChromiumWindowId() {
  // Try our custom class first
  try {
    const out = execSync(`xdotool search --class ${CHROME_CLASS} | tail -n1`, { env: { ...process.env, DISPLAY } }).toString().trim();
    if (out) return out.split('\n').slice(-1)[0].trim();
  } catch {}
  // Fallback to common chromium classes
  for (const cls of ['chromium-browser', 'chromium', 'Chromium']) {
    try {
      const out = execSync(`xdotool search --class ${cls} | tail -n1`, { env: { ...process.env, DISPLAY } }).toString().trim();
      if (out) return out.split('\n').slice(-1)[0].trim();
    } catch {}
  }
  // Last resort: parse wmctrl -lx
  try {
    const out = execSync('wmctrl -lx', { env: { ...process.env, DISPLAY } }).toString();
    const line = out.split('\n').filter(l => /chrom/i.test(l)).slice(-1)[0];
    if (line) {
      const m = line.match(/^(0x[0-9a-fA-F]+)/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

function activateWindow(winId) {
  try {
    execSync(`xdotool windowactivate ${winId}`, { env: { ...process.env, DISPLAY } });
    return true;
  } catch (e) {
    log(`xdotool windowactivate failed: ${e.message}`);
    try {
      execSync(`wmctrl -i -a ${winId}`, { env: { ...process.env, DISPLAY } });
      return true;
    } catch (e2) {
      log(`wmctrl activate failed: ${e2.message}`);
      return false;
    }
  }
}

function getWindowIdByNameExact(name) {
  try {
    const out = execSync(`xdotool search --name '^${name}$' | head -n1`, { env: { ...process.env, DISPLAY } }).toString().trim();
    return out || null;
  } catch { return null; }
}

function moveWindowToDisplay(winId, display) {
  try {
    execSync(`xdotool windowmove ${winId} ${display.x} ${display.y}`, { env: { ...process.env, DISPLAY } });
  } catch (e) {
    log(`windowmove failed: ${e.message}`);
  }
}

function fullscreenWindow(winId) {
  try {
    execSync(`wmctrl -i -r ${winId} -b add,fullscreen`, { env: { ...process.env, DISPLAY } });
  } catch (e) {
    log(`wmctrl fullscreen failed: ${e.message}`);
  }
}

function raiseWindow(winId) {
  try {
    execSync(`wmctrl -i -a ${winId}`, { env: { ...process.env, DISPLAY } });
  } catch (e) { log(`wmctrl raise failed: ${e.message}`); }
}

function lowerWindow(winId) {
  try {
    execSync(`wmctrl -i -r ${winId} -b add,below`, { env: { ...process.env, DISPLAY } });
  } catch (e) { log(`wmctrl lower failed: ${e.message}`); }
}

function xdotoolRaiseWindow(winId) {
  try {
    execSync(`xdotool windowraise ${winId}`, { env: { ...process.env, DISPLAY } });
  } catch (e) { log(`xdotool windowraise failed: ${e.message}`); }
}

function xdotoolLowerWindow(winId) {
  try {
    execSync(`xdotool windowlower ${winId}`, { env: { ...process.env, DISPLAY } });
  } catch (e) { log(`xdotool windowlower failed: ${e.message}`); }
}

function wmctrlRestackAbove(winId, referenceWinId) {
  try {
    // Restack winId above referenceWinId
    execSync(`wmctrl -i -r ${winId} -e 0,-1,-1,-1,-1`, { env: { ...process.env, DISPLAY } });
    execSync(`wmctrl -i -r ${winId} -b add,above`, { env: { ...process.env, DISPLAY } });
  } catch (e) { log(`wmctrl restack above failed: ${e.message}`); }
}

function wmctrlRestackBelow(winId, referenceWinId) {
  try {
    // Restack winId below referenceWinId  
    execSync(`wmctrl -i -r ${winId} -b remove,above`, { env: { ...process.env, DISPLAY } });
    execSync(`wmctrl -i -r ${winId} -b add,below`, { env: { ...process.env, DISPLAY } });
  } catch (e) { log(`wmctrl restack below failed: ${e.message}`); }
}

function xdotoolActivateWindow(winId) {
  try {
    execSync(`xdotool windowactivate ${winId}`, { env: { ...process.env, DISPLAY } });
  } catch (e) { log(`xdotool windowactivate failed: ${e.message}`); }
}

function addWinState(winId, state) {
  try {
    execSync(`wmctrl -i -r ${winId} -b add,${state}`, { env: { ...process.env, DISPLAY } });
  } catch (e) { log(`wmctrl add ${state} failed: ${e.message}`); }
}

function removeWinState(winId, state) {
  try {
    execSync(`wmctrl -i -r ${winId} -b remove,${state}`, { env: { ...process.env, DISPLAY } });
  } catch (e) { log(`wmctrl remove ${state} failed: ${e.message}`); }
}

function minimizeWindow(winId) {
  try {
    execSync(`xdotool windowminimize ${winId}`, { env: { ...process.env, DISPLAY } });
  } catch (e) { log(`xdotool windowminimize failed: ${e.message}`); }
}

function mapWindow(winId) {
  try {
    execSync(`xdotool windowmap ${winId}`, { env: { ...process.env, DISPLAY } });
  } catch (e) { /* best-effort */ }
}

function getActiveDesktop() {
  try {
    const out = execSync('wmctrl -d', { env: { ...process.env, DISPLAY } }).toString();
    const line = out.split('\n').find(l => l.includes('*'));
    if (!line) return 0;
    const idx = parseInt(line.split(' ')[0], 10);
    return Number.isFinite(idx) ? idx : 0;
  } catch { return 0; }
}

function moveToDesktop(winId, desktopIdx) {
  try {
    execSync(`wmctrl -i -r ${winId} -t ${desktopIdx}`, { env: { ...process.env, DISPLAY } });
  } catch (e) { log(`wmctrl move to desktop failed: ${e.message}`); }
}

async function waitForHttpOk(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 400);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
    if (ok) return true;
    await sleep(250);
  }
  return false;
}

function getDisplays() {
  try {
    const out = execSync('xrandr --current', { env: { ...process.env, DISPLAY } }).toString();
    const lines = out.split('\n');
    const displays = [];
    for (const line of lines) {
      const m = line.match(/^(\S+)\s+connected(\s+primary)?\s+(\d+)x(\d+)\+(\d+)\+(\d+)/);
      if (m) {
        const name = m[1];
        const isPrimary = !!m[2];
        const width = parseInt(m[3], 10);
        const height = parseInt(m[4], 10);
        const x = parseInt(m[5], 10);
        const y = parseInt(m[6], 10);
        displays.push({ name, isPrimary, width, height, x, y });
      }
    }
    return displays;
  } catch (e) {
    log(`Failed to parse xrandr: ${e.message}`);
    return [];
  }
}

function pickSecondaryDisplay() {
  const displays = getDisplays();
  const nonPrimary = displays.filter(d => !d.isPrimary);
  if (nonPrimary.length) {
    nonPrimary.sort((a, b) => (a.x - b.x));
    return nonPrimary[nonPrimary.length - 1];
  }
  const primary = displays.find(d => d.isPrimary) || displays[0];
  return primary;
}

function killProcessTree(proc, name, timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (!proc || proc.killed) return resolve();
    try { proc.kill('SIGTERM'); } catch (_) {}
    const t = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch (_) {}
      resolve();
    }, timeoutMs);
    proc.on('exit', () => { clearTimeout(t); resolve(); });
  });
}

class MpvIpcClient {
  constructor(sockPath) {
    this.sockPath = sockPath;
    this.socket = null;
    this.connected = false;
  }
  async connect(timeoutMs = 10000) {
    const ok = await waitForSocket(this.sockPath, timeoutMs);
    if (!ok) throw new Error(`MPV IPC socket not available at ${this.sockPath}`);
    await new Promise((resolve, reject) => {
      const s = net.createConnection(this.sockPath, () => {
        this.socket = s;
        this.connected = true;
        resolve();
      });
      s.on('error', reject);
    });
  }
  send(cmd) {
    if (!this.connected || !this.socket) throw new Error('MPV IPC not connected');
    const payload = JSON.stringify(cmd) + '\n';
    this.socket.write(payload);
  }
  set(prop, value) { this.send({ command: ['set_property', prop, value] }); }
  close() { try { this.socket?.end(); } catch (_) {} }
}

async function main() {
  log('Starting proof-of-approach script');
  process.env.DISPLAY = DISPLAY; // ensure X11 target
  ensureDeps();

  if (!fs.existsSync(VIDEO)) throw new Error(`Video not found at ${VIDEO}`);
  const hasDefaultImage = fs.existsSync(DEFAULT_IMAGE);
  if (!hasDefaultImage) log(`WARNING: Default image not found at ${DEFAULT_IMAGE}; will start MPV on video instead.`);

  // Clean previous artifacts
  safeUnlink(MPV_IPC);
  try { fs.rmSync(CHROME_PROFILE, { recursive: true, force: true }); } catch (_) {}

  // Choose target (secondary) display
  const targetDisplay = pickSecondaryDisplay();
  log(`Target display: ${targetDisplay.name} at ${targetDisplay.width}x${targetDisplay.height}+${targetDisplay.x}+${targetDisplay.y} (primary=${targetDisplay.isPrimary})`);

  // === SETUP PHASE: Get both MPV and browser running and positioned (flicker OK during this phase) ===
  log('=== SETUP PHASE: Launching and positioning both windows ===');

  // Launch Chromium browser positioned on target display, fullscreen
  const chromeBin = pickChromiumBinary();
  log(`Launching Chromium (${chromeBin}) to ${CHROME_URL} ...`);
  const chromeArgs = [
    `--user-data-dir=${CHROME_PROFILE}`,
    `--class=${CHROME_CLASS}`,
    '--no-first-run',
    '--disable-infobars',
    '--disable-session-crashed-bubble',
    '--no-default-browser-check',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--autoplay-policy=no-user-gesture-required',
    `--window-position=${targetDisplay.x},${targetDisplay.y}`,
    `--window-size=${targetDisplay.width},${targetDisplay.height}`,
    '--start-fullscreen',
    `--app=${CHROME_URL}`,
  ];
  const chrome = spawn(chromeBin, chromeArgs, { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, DISPLAY } });
  chrome.stderr.on('data', (d) => process.stderr.write(`[chromium] ${d}`));

  // Wait for Chromium window and ensure it's positioned correctly
  let chromeWin = await waitForWindowByClass(CHROME_CLASS, 4000);
  if (!chromeWin) chromeWin = findChromiumWindowId();
  if (chromeWin) {
    moveWindowToDisplay(chromeWin, targetDisplay);
    fullscreenWindow(chromeWin);
    const desk = getActiveDesktop();
    moveToDesktop(chromeWin, desk);
  } else {
    log('Chromium window not found; proceeding without positioning.');
  }

  // Launch MPV with default image, positioned on same display
  log('Launching MPV...');
  const initialMedia = hasDefaultImage ? DEFAULT_IMAGE : VIDEO;
  const mpvArgs = [
    '--no-terminal',
    '--force-window=yes',
    '--keep-open=yes',
    `--geometry=${targetDisplay.width}x${targetDisplay.height}+${targetDisplay.x}+${targetDisplay.y}`,
    '--no-border',
    '--title=ParadoxMPV',
    `--input-ipc-server=${MPV_IPC}`,
    initialMedia,
  ];
  const mpv = spawn('mpv', mpvArgs, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY } });
  mpv.stdout.on('data', (d) => process.stdout.write(`[mpv] ${d}`));
  mpv.stderr.on('data', (d) => process.stderr.write(`[mpv] ${d}`));
  
  // Connect to MPV IPC and position window
  const mpvIpc = new MpvIpcClient(MPV_IPC);
  await mpvIpc.connect();
  log('MPV IPC connected');
  let mpvWin = getWindowIdByNameExact('ParadoxMPV');
  if (mpvWin) {
    moveWindowToDisplay(mpvWin, targetDisplay);
    const desk = getActiveDesktop();
    moveToDesktop(mpvWin, desk);
  }

  // Wait for browser to be ready
  const httpReady = await waitForHttpOk(CHROME_URL, 8000);
  log(`Browser HTTP readiness: ${httpReady ? 'OK' : 'Not ready (continuing)'}`);
  
  // Load video content into MPV
  log('Loading default.mp4 into MPV');
  try { mpvIpc.send({ command: ['loadfile', VIDEO, 'replace'] }); } catch (e) { log(`Failed to load video: ${e.message}`); }
  
  // Ensure MPV is in front to start
  log('Bringing MPV to front for setup completion');
  mpvWin = getWindowIdByNameExact('ParadoxMPV') || mpvWin;
  chromeWin = findChromiumWindowId() || chromeWin;
  if (chromeWin) {
    removeWinState(chromeWin, 'above');
    addWinState(chromeWin, 'below'); // ensure browser starts behind MPV
  }
  if (mpvWin) {
    addWinState(mpvWin, 'above');
    activateWindow(mpvWin);
  }

  await sleep(2000);
  log('=== SETUP COMPLETE: Both windows positioned and ready ===');

  // === OPERATION PHASE: Only change Z-order, never move/resize/fullscreen ===
  // Connect to MQTT once for all operations
  log('Connecting to MQTT for clock commands...');
  const mqttClient = mqtt.connect(MQTT_URL);
  await new Promise((resolve, reject) => {
    mqttClient.once('connect', resolve);
    mqttClient.once('error', reject);
  });
  const topic = 'paradox/houdini/clock/commands';
  const publish = (payload) => new Promise((res, rej) => mqttClient.publish(topic, JSON.stringify(payload), { qos: 0 }, (err) => err ? rej(err) : res()));

  // === CYCLE 1 ===
  log('=== CYCLE 1 START ===');
  
  // 1. MPV shows static image (already in front)
  log('MPV showing static content (2 seconds)');
  await sleep(2000);

  // 2. Show browser using xdotool windowactivate
  log('Showing browser using xdotool windowactivate (focus + raise)');
  if (chromeWin) {
    xdotoolActivateWindow(chromeWin);
  }
  await sleep(2000);

  // 3. Do fade sequence
  log('Sending fadeIn');
  await publish({ command: 'fadeIn' });
  await sleep(5000);
  log('Sending fadeOut');
  await publish({ command: 'fadeOut' });
  await sleep(2000);

  // 4. Show MPV using xdotool windowactivate
  log('Showing MPV using xdotool windowactivate (focus + raise)');
  if (mpvWin) {
    xdotoolActivateWindow(mpvWin);
  }
  await sleep(5000);

  // === CYCLE 2 ===
  log('=== CYCLE 2 START ===');
  
  // 1. MPV already in front, hold for 2 seconds
  log('MPV showing content (2 seconds)');
  await sleep(2000);

  // 2. Show browser using xdotool windowactivate
  log('Showing browser using xdotool windowactivate (focus + raise)');
  if (chromeWin) {
    xdotoolActivateWindow(chromeWin);
  }
  await sleep(2000);

  // 3. Do fade sequence
  log('Sending fadeIn');
  await publish({ command: 'fadeIn' });
  await sleep(5000);
  log('Sending fadeOut');
  await publish({ command: 'fadeOut' });
  await sleep(2000);

  // 4. Show MPV using xdotool windowactivate
  log('Showing MPV using xdotool windowactivate (focus + raise)');
  if (mpvWin) {
    xdotoolActivateWindow(mpvWin);
  }
  await sleep(5000);

  log('=== CYCLES COMPLETE ===');  // Cleanup
  log('Cleaning up: killing Chromium and MPV, removing IPC socket and profile');
  try { mqttClient.end(true); } catch (_) {}
  try { mpvIpc.close(); } catch (_) {}
  await Promise.all([
    killProcessTree(chrome, 'chromium'),
    killProcessTree(mpv, 'mpv'),
  ]);
  safeUnlink(MPV_IPC);
  try { fs.rmSync(CHROME_PROFILE, { recursive: true, force: true }); } catch (_) {}
  log('Done.');
}

process.on('unhandledRejection', async (e) => {
  log(`Unhandled rejection: ${e?.stack || e}`);
  process.exitCode = 1;
});

process.on('SIGINT', () => { log('SIGINT received, exiting...'); process.exit(130); });
process.on('SIGTERM', () => { log('SIGTERM received, exiting...'); process.exit(143); });

main().catch((e) => {
  log(`Error: ${e?.stack || e}`);
  process.exitCode = 1;
});
