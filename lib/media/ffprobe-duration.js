const { spawn } = require('child_process');
const path = require('path');

class FfprobeDurationCache {
    constructor() {
        this.cache = new Map(); // key: abs path, value: number seconds
    }
    get(p) { return this.cache.get(p); }
    set(p, v) { this.cache.set(p, v); }
}

const globalCache = new FfprobeDurationCache();

function probeDurationSeconds(absPath, { timeoutMs = 4000 } = {}) {
    const cached = globalCache.get(absPath);
    if (cached != null) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
        const ff = spawn('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            absPath
        ]);
        let out = ''; let err = '';
        const to = setTimeout(() => {
            try { ff.kill('SIGKILL'); } catch (_) { }
            reject(new Error('ffprobe timeout'));
        }, timeoutMs);
        ff.stdout.on('data', d => out += d);
        ff.stderr.on('data', d => err += d);
        ff.on('close', code => {
            clearTimeout(to);
            if (code === 0) {
                const dur = parseFloat(out.trim());
                if (!isNaN(dur)) {
                    globalCache.set(absPath, dur);
                    resolve(dur);
                } else {
                    reject(new Error('invalid duration output'));
                }
            } else {
                reject(new Error(err.trim() || ('ffprobe exited code ' + code)));
            }
        });
    });
}

module.exports = { probeDurationSeconds, ffprobeDurationCache: globalCache };
