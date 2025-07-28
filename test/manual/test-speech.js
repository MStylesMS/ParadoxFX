// Minimal MPV IPC speech playback test script for ParadoxFX
// Usage: node test-speech.js
// This script will sequentially play two speech files via MPV IPC and print results.

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const MPV_PATH = 'mpv'; // Assumes mpv is in PATH
const IPC_SOCKET = '/tmp/mpv-speech-test.sock';
const SPEECH_FILES = [
  path.resolve(__dirname, '/opt/paradox/media/test/general/PFX.mp3'),
  path.resolve(__dirname, '/opt/paradox/media/test/general/ParadoxFX.mp3'),
  path.resolve(__dirname, '/opt/paradox/media/test/general/PFX_Vocal_Queuing.mp3'), // Add your third file here
  path.resolve(__dirname, '/opt/paradox/media/test/general/Welcome_ParadoxFX.mp3'), // Add your fourth file here
];

// Set your HDMI1 device name here if not using env var
const DEFAULT_HDMI1_DEVICE = 'alsa/hdmi:CARD=vc4hdmi1,DEV=0'; // HDMI1 output
const AUDIO_DEVICE = process.env.AUDIO_DEVICE || DEFAULT_HDMI1_DEVICE;
console.log('Using audio device:', AUDIO_DEVICE);

function waitForSocket(socketPath, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      net.connect(socketPath, () => resolve()).on('error', () => {
        if (Date.now() - start > timeout) reject(new Error('Timeout waiting for MPV IPC socket'));
        else setTimeout(check, 50);
      });
    })();
  });
}

function sendMPVCommand(socket, cmd) {
  return new Promise((resolve, reject) => {
    socket.write(JSON.stringify(cmd) + '\n');
    let buffer = '';
    const onData = (data) => {
      buffer += data.toString();
      let lines = buffer.split('\n');
      buffer = lines.pop(); // last may be incomplete
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const resp = JSON.parse(line);
          socket.removeListener('data', onData);
          resolve(resp);
          return;
        } catch (e) {
          // Ignore non-JSON lines
        }
      }
    };
    socket.on('data', onData);
  });
}

async function playSpeechFiles() {
  // Clean up any stale socket
  try { require('fs').unlinkSync(IPC_SOCKET); } catch {}

  // Start MPV with IPC and audio device (match PFX speech configuration exactly)
  const mpvArgs = [
    '--idle=yes',
    `--input-ipc-server=${IPC_SOCKET}`,
    '--no-terminal',
    '--no-video',
    `--volume=90`,      // Set initial volume like PFX
    '--cache=yes',      // Enable caching (like PFX)
    '--msg-level=all=info',  // Debug output
    `--audio-device=${AUDIO_DEVICE}`,
  ];
  console.log('Launching MPV with args:', mpvArgs.join(' '));
  const mpv = spawn(MPV_PATH, mpvArgs);

  mpv.stderr.on('data', d => process.stderr.write(d));
  mpv.on('exit', (code, sig) => {
    console.log(`MPV exited: code=${code}, signal=${sig}`);
  });

  await waitForSocket(IPC_SOCKET);
  const socket = net.connect(IPC_SOCKET);

  // Prime the audio path with a brief test to avoid HDMI startup delays
  console.log('Priming audio path...');
  // Load a very short silent file or use a small delay with volume changes
  await sendMPVCommand(socket, {command: ['set_property', 'volume', 50]});
  await new Promise(r => setTimeout(r, 1000)); // Longer prime delay
  console.log('Audio path primed');

  const fs = require('fs');
  for (let i = 0; i < SPEECH_FILES.length; ++i) {
    const file = SPEECH_FILES[i];
    if (!fs.existsSync(file)) {
      console.warn(`WARNING: File does not exist: ${file}`);
      continue;
    }
    console.log(`\nPlaying: ${file}`);
    await sendMPVCommand(socket, {command: ['loadfile', file, 'replace']});
    await sendMPVCommand(socket, {command: ['set_property', 'volume', 90]});
    
    // Use simpler approach - just wait for playback-time to reach duration
    let done = false;
    let debugCount = 0;
    
    const onData = (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          // Debug: Print all events we receive
          if (debugCount++ < 10) {
            console.log('Event:', JSON.stringify(msg));
          }
          // Look for end-file event (simpler than property watching)
          if (msg.event === 'end-file') {
            done = true;
          }
        } catch {}
      }
    };
    
    socket.on('data', onData);
    const start = Date.now();
    while (!done && Date.now() - start < 15000) { // Longer timeout
      await new Promise(r => setTimeout(r, 100));
    }
    socket.removeListener('data', onData);
    
    if (!done) console.log('Timeout waiting for end-file event');
    else console.log('Playback finished');
    // Add 5s pause after 1st and 2nd, but not after 3rd
    if (i === 0 || i === 1) {
      console.log('Pausing 5 seconds...');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  socket.end();
  mpv.kill();
}

playSpeechFiles().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
