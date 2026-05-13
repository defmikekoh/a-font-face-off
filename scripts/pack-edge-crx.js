#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SOURCE_DIR = path.join(ROOT, 'ztemp', 'edge-mv3-src');
const DEFAULT_KEY_PATH = path.join(ROOT, 'ztemp', 'edge-mv3-key.pem');
const DEFAULT_ZIP_PATH = path.join(ROOT, 'ztemp', 'edge-mv3.zip');
const DEFAULT_OUTPUT_PATH = path.join(ROOT, 'web-ext-artifacts', 'a-font-face-off-edge-mv3.crx');
const DEFAULT_PACK_PROFILE = path.join(ROOT, 'ztemp', 'chrome-pack-profile');
const MAC_PACKERS = [
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];
const PATH_PACKERS = [
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'microsoft-edge'
];

function parseArgs(argv) {
  const options = {
    sourceDir: DEFAULT_SOURCE_DIR,
    keyPath: DEFAULT_KEY_PATH,
    zipPath: DEFAULT_ZIP_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    packerPath: process.env.AFFO_EDGE_CRX_PACKER || null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--source-dir' && next) {
      options.sourceDir = path.resolve(next);
      i += 1;
    } else if (arg === '--key' && next) {
      options.keyPath = path.resolve(next);
      i += 1;
    } else if (arg === '--zip' && next) {
      options.zipPath = path.resolve(next);
      i += 1;
    } else if (arg === '--out' && next) {
      options.outputPath = path.resolve(next);
      i += 1;
    } else if (arg === '--packer' && next) {
      options.packerPath = path.resolve(next);
      i += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return options;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function generatePrivateKey(keyPath) {
  ensureDir(path.dirname(keyPath));
  const keyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001
  });
  const privatePem = keyPair.privateKey.export({
    type: 'pkcs8',
    format: 'pem'
  });
  fs.writeFileSync(keyPath, privatePem, { mode: 0o600 });
  return privatePem;
}

function loadPrivateKey(keyPath) {
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8');
  }
  return generatePrivateKey(keyPath);
}

function createZip(sourceDir, zipPath) {
  if (!fs.existsSync(path.join(sourceDir, 'manifest.json'))) {
    throw new Error(`No manifest.json found in ${sourceDir}. Run npm run build:edge-mv3 first.`);
  }

  ensureDir(path.dirname(zipPath));
  fs.rmSync(zipPath, { force: true });

  const result = spawnSync('zip', ['-qr', zipPath, '.'], {
    cwd: sourceDir,
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`zip exited with status ${result.status}`);
  }
}

function getPublicKeyDer(privatePem) {
  return crypto.createPublicKey(privatePem).export({
    type: 'spki',
    format: 'der'
  });
}

function getCrxId(publicKeyDer) {
  return crypto.createHash('sha256').update(publicKeyDer).digest().subarray(0, 16);
}

function crxIdToExtensionId(crxId) {
  const alphabet = 'abcdefghijklmnop';
  let extensionId = '';
  for (const byte of crxId) {
    extensionId += alphabet[(byte >> 4) & 0x0f];
    extensionId += alphabet[byte & 0x0f];
  }
  return extensionId;
}

function resolveFromPath(command) {
  const result = spawnSync('which', [command], {
    encoding: 'utf8'
  });

  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function findNativePacker(explicitPath) {
  if (explicitPath) {
    if (fs.existsSync(explicitPath)) return explicitPath;
    throw new Error(`Configured CRX packer was not found: ${explicitPath}`);
  }

  for (const packerPath of MAC_PACKERS) {
    if (fs.existsSync(packerPath)) return packerPath;
  }

  for (const command of PATH_PACKERS) {
    const packerPath = resolveFromPath(command);
    if (packerPath) return packerPath;
  }

  throw new Error(
    'Could not find Chrome, Chromium, or Edge for native CRX packing. ' +
    'Set AFFO_EDGE_CRX_PACKER or pass --packer /path/to/browser.'
  );
}

function runNativePacker(sourceDir, keyPath, packerPath) {
  const nativeOutputPath = `${sourceDir}.crx`;
  ensureDir(DEFAULT_PACK_PROFILE);

  const result = spawnSync(packerPath, [
    `--pack-extension=${sourceDir}`,
    `--pack-extension-key=${keyPath}`,
    `--user-data-dir=${DEFAULT_PACK_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-breakpad',
    '--disable-crash-reporter'
  ], {
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${packerPath} --pack-extension exited with status ${result.status}`);
  }
  if (!fs.existsSync(nativeOutputPath)) {
    throw new Error(`Native packer did not create ${nativeOutputPath}`);
  }

  return nativeOutputPath;
}

function main() {
  const options = parseArgs(process.argv);
  const privatePem = loadPrivateKey(options.keyPath);
  const publicKeyDer = getPublicKeyDer(privatePem);
  const extensionId = crxIdToExtensionId(getCrxId(publicKeyDer));
  const packerPath = findNativePacker(options.packerPath);
  createZip(options.sourceDir, options.zipPath);
  const nativeOutputPath = runNativePacker(options.sourceDir, options.keyPath, packerPath);

  ensureDir(path.dirname(options.outputPath));
  fs.copyFileSync(nativeOutputPath, options.outputPath);

  console.log(`Packed CRX: ${path.relative(ROOT, options.outputPath)}`);
  console.log(`Source ZIP: ${path.relative(ROOT, options.zipPath)}`);
  console.log(`Key: ${path.relative(ROOT, options.keyPath)}`);
  console.log(`Native packer: ${packerPath}`);
  console.log(`Extension ID: ${extensionId}`);
}

main();
