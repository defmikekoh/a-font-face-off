#!/usr/bin/env node
/*
 Generate data/css2-axis-ranges.json from docs/fonts

 - Reads per-family axes (tag/min/max)
 - Adds 'ital' tag when italic styles exist in family (e.g., keys ending with 'i')
 - Keeps only css2-registered tags: ital, wdth, wght, slnt, opsz
 - Writes tags (ordered with ital first when present) and numeric ranges for non-boolean tags
*/
const fs = require('fs');
const path = require('path');

const SRC = path.join(process.cwd(), 'docs', 'fonts');
const OUTDIR = path.join(process.cwd(), 'data');
const OUT = path.join(OUTDIR, 'css2-axis-ranges.json');

function roundMaybe(x) {
  // Keep integers as ints; otherwise keep number as-is
  return Number.isInteger(x) ? x : +x;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Source file not found: ${SRC}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(SRC, 'utf8');
  const data = JSON.parse(raw);
  const list = data.familyMetadataList || data.familyMetadata || data.families || [];
  // We will write ALL axes found in docs/fonts into the JSON output
  // (css2 URL builder will later filter to standard tags for tuples)
  const orderHint = ['ital', 'wdth', 'wght', 'slnt', 'opsz'];

  const out = {};
  for (const fam of list) {
    const name = fam.family || fam.name;
    if (!name) continue;

    const axes = Array.isArray(fam.axes) ? fam.axes : [];
    const tagsSet = new Set();
    const ranges = {};

    // Collect ranges from axes entries — include all axes present
    for (const ax of axes) {
      const tag = String(ax.tag || ax.axis || '').trim();
      if (!tag) continue;
      // Add the tag regardless; ranges below if min/max exist
      if (tag === 'ital') {
        tagsSet.add('ital');
      } else {
        tagsSet.add(tag);
      }
      tagsSet.add(tag);
      const min = roundMaybe(ax.min);
      const max = roundMaybe(ax.max);
      if (typeof min === 'number' && typeof max === 'number') {
        ranges[tag] = [min, max];
      }
    }

    // Add ital if family has italic styles in `fonts` map
    const fontsMap = fam.fonts || {};
    const hasItalic = Object.keys(fontsMap).some(k => /i$/.test(k));
    if (hasItalic) tagsSet.add('ital');

    // Order tags alphabetically with lowercase first, then uppercase (to mirror css2 builder)
    const allTags = Array.from(tagsSet);
    const lower = allTags.filter(t => /^[a-z]+$/.test(t)).sort();
    const upper = allTags.filter(t => /^[A-Z]+$/.test(t)).sort();
    const tags = [...lower, ...upper];
    if (tags.length === 0) continue; // nothing to emit

    out[name] = { tags, ranges };
  }

  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${OUT} with ${Object.keys(out).length} families`);
}

main();
