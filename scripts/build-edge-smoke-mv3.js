#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'ztemp', 'edge-smoke-mv3-src');
const ICON_SIZES = ['16', '32', '48', '128'];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(relativePath, text) {
  const outputPath = path.join(OUT_DIR, relativePath);
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, text);
}

function copyIcons() {
  const iconDir = path.join(OUT_DIR, 'icons');
  ensureDir(iconDir);

  for (const size of ICON_SIZES) {
    fs.copyFileSync(
      path.join(ROOT, 'src', 'icons', `icon-${size}.png`),
      path.join(iconDir, `icon-${size}.png`)
    );
  }
}

function buildManifest() {
  const icons = Object.fromEntries(
    ICON_SIZES.map(size => [size, `icons/icon-${size}.png`])
  );

  return {
    manifest_version: 3,
    name: 'AFFO Edge MV3 Smoke',
    version: '0.0.1',
    description: 'Minimal MV3 CRX install smoke test for Edge Android',
    action: {
      default_title: 'AFFO Smoke',
      default_popup: 'popup.html',
      default_icon: icons
    },
    icons
  };
}

function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(OUT_DIR);
  copyIcons();

  writeFile('manifest.json', `${JSON.stringify(buildManifest(), null, 2)}\n`);
  writeFile('popup.html', `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AFFO Smoke</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <main>
    <h1>AFFO Smoke</h1>
    <p id="status">Popup loaded.</p>
    <p id="time"></p>
  </main>
  <script src="popup.js"></script>
</body>
</html>
`);
  writeFile('popup.css', `html {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
}

body {
  margin: 0;
  min-width: 220px;
}

main {
  padding: 16px;
}

h1 {
  font-size: 18px;
  margin: 0 0 8px;
}

p {
  margin: 8px 0 0;
}
`);
  writeFile('popup.js', `'use strict';

document.getElementById('time').textContent = new Date().toISOString();
`);

  console.log(`Built smoke MV3 source: ${path.relative(ROOT, OUT_DIR)}`);
}

main();
