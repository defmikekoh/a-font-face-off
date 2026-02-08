#!/usr/bin/env node
/*
 Update local GF metadata from Google Fonts

 - Fetches https://fonts.google.com/metadata/fonts
 - Strips XSSI prefix ")]}'\n" if present
 - Removes unused fields (popularity, trending, defaultSort)
 - Sorts classifications arrays for stable git diffs
 - Writes pretty-printed JSON to data/gf-axis-registry.json
*/

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(process.cwd(), 'src', 'data');
const OUT_FILE = path.join(OUT_DIR, 'gf-axis-registry.json');
const SRC_URL = process.env.GF_METADATA_URL || 'https://fonts.google.com/metadata/fonts';

async function main() {
  try {
    const res = await fetch(SRC_URL, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const json = text.replace(/^\)\]\}'\n?/, '');

    let obj;
    try {
      obj = JSON.parse(json);
    } catch (e) {
      throw new Error('Failed to parse JSON from Google Fonts metadata: ' + e.message);
    }

    // Strip unused fields to reduce file size
    const fieldsToRemove = ['popularity', 'trending', 'defaultSort'];
    let strippedCount = 0;

    if (obj.familyMetadataList && Array.isArray(obj.familyMetadataList)) {
      obj.familyMetadataList.forEach(font => {
        // Remove unused fields
        fieldsToRemove.forEach(field => {
          if (field in font) {
            delete font[field];
            strippedCount++;
          }
        });

        // Sort classifications array to prevent ordering changes in git diffs
        if (Array.isArray(font.classifications)) {
          font.classifications.sort();
        }
      });
    }

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    const pretty = JSON.stringify(obj, null, 2) + '\n';
    fs.writeFileSync(OUT_FILE, pretty);
    console.log(`Wrote ${OUT_FILE} (${pretty.length} bytes) from ${SRC_URL}`);
    console.log(`Stripped ${strippedCount} unused fields (${fieldsToRemove.join(', ')})`);
  } catch (err) {
    console.error('Failed to update local GF metadata:', err.message || err);
    process.exit(1);
  }
}

main();
