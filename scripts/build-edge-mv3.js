#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'ztemp', 'edge-mv3-src');

const IGNORED_NAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'custom-fonts-example.css',
  'custom-fonts-example-data-blob.css',
  'gdrive-config.example.js'
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(srcDir, destDir) {
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (IGNORED_NAMES.has(entry.name)) continue;

    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function addHtmlClass(fileName, className) {
  const filePath = path.join(OUT_DIR, fileName);
  let text = fs.readFileSync(filePath, 'utf8');

  text = text.replace(/<html([^>]*)>/, (match, attrs) => {
    if (new RegExp(`\\b${className}\\b`).test(match)) return match;
    if (/\sclass=/.test(attrs)) {
      return match.replace(/\sclass=(["'])(.*?)\1/, ` class=$1$2 ${className}$1`);
    }
    return `<html${attrs} class="${className}">`;
  });

  fs.writeFileSync(filePath, text);
}

// Firefox's manifest is the shared MV3 baseline. Chromium only changes
// background hosting and request-blocking permissions.
function buildManifest(sourceManifest) {
  if (sourceManifest.manifest_version !== 3) throw new Error('Shared source must use Manifest V3');
  const manifest = structuredClone(sourceManifest);
  delete manifest.browser_specific_settings;
  manifest.permissions = manifest.permissions.filter(permission => permission !== 'webRequestBlocking');
  manifest.permissions.push('declarativeNetRequestWithHostAccess');
  manifest.background = { service_worker: 'edge-mv3-service-worker.js' };
  return manifest;
}

function writeServiceWorker(sourceManifest) {
  const scripts = sourceManifest.background.scripts;
  const importList = scripts.map(script => `  ${JSON.stringify(script)}`).join(',\n');
  const text = `'use strict';\n\nimportScripts(\n${importList}\n);\n`;
  fs.writeFileSync(path.join(OUT_DIR, 'edge-mv3-service-worker.js'), text);
}

function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  copyDir(SRC_DIR, OUT_DIR);
  // Package production logging without changing the shared development source.
  for (const file of ['popup.js', 'content.js', 'background.js', 'left-toolbar.js']) {
    const filePath = path.join(OUT_DIR, file);
    const text = fs.readFileSync(filePath, 'utf8').replace(/^(\s*var AFFO_DEBUG = )(true|false)/m, '$1false');
    fs.writeFileSync(filePath, text);
  }

  const sourceManifest = readJson(path.join(SRC_DIR, 'manifest.json'));
  writeJson(path.join(OUT_DIR, 'manifest.json'), buildManifest(sourceManifest));
  writeServiceWorker(sourceManifest);
  addHtmlClass('options.html', 'affo-chromium-options');

  console.log(`Generated Chromium MV3 source (Chrome/Vivaldi/Edge): ${path.relative(ROOT, OUT_DIR)}`);
}

if (require.main === module) main();

module.exports = { buildManifest };
