#!/usr/bin/env node

// Backup of the original CLI-style audio-manager integration test

const fs = require('fs');
const path = require('path');

const original = fs.readFileSync(path.join(__dirname, '..', 'audio-manager.test.js'), 'utf8');
fs.writeFileSync(__filename, original);
