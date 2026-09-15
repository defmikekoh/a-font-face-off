#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'ztemp', 'chromium-mv3-src');
const OUTPUT_PATH = path.join(ROOT, 'web-ext-artifacts', 'a-font-face-off-chromium-mv3.zip');

const build = spawnSync(process.execPath, [path.join(__dirname, 'build-chromium-mv3.js')], {
  cwd: ROOT,
  stdio: 'inherit'
});
if (build.error) throw build.error;
if (build.status !== 0) throw new Error(`MV3 build exited with status ${build.status}`);

if (!fs.existsSync(path.join(SOURCE_DIR, 'manifest.json'))) {
  throw new Error('No manifest.json found. Run npm run build:chromium-mv3 first.');
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.rmSync(OUTPUT_PATH, { force: true });

const result = spawnSync('zip', ['-qr', OUTPUT_PATH, '.'], {
  cwd: SOURCE_DIR,
  stdio: 'inherit'
});

if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`zip exited with status ${result.status}`);

console.log(`Packaged MV3 ZIP: ${path.relative(ROOT, OUTPUT_PATH)}`);
