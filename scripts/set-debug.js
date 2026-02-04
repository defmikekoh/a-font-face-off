// Toggle AFFO_DEBUG flag in all JS files
// Usage: node scripts/set-debug.js [true|false]
const fs = require('fs');
const path = require('path');

const value = process.argv[2];
if (value !== 'true' && value !== 'false') {
  console.error('Usage: node scripts/set-debug.js [true|false]');
  process.exit(1);
}

const files = ['popup.js', 'content.js', 'background.js', 'left-toolbar.js'];
const root = path.resolve(__dirname, '..');

for (const file of files) {
  const filePath = path.join(root, file);
  const src = fs.readFileSync(filePath, 'utf8');
  const updated = src.replace(/^(\s*var AFFO_DEBUG = )(true|false)/m, `$1${value}`);
  if (updated === src) {
    console.error(`No AFFO_DEBUG found in ${file}`);
    process.exit(1);
  }
  fs.writeFileSync(filePath, updated, 'utf8');
}

console.log(`AFFO_DEBUG set to ${value} in ${files.join(', ')}`);
