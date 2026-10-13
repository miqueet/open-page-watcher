// Fails if a file the manifest points to is missing from a package folder.
// Usage: node scripts/check-package.mjs <folder>
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || '.';
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const refs = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_page,
  manifest.storage?.managed_schema,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
].filter(Boolean);
const missing = refs.filter((ref) => !fs.existsSync(path.join(dir, ref)));
if (missing.length) {
  console.error(`Missing from ${dir}: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`All ${refs.length} files the manifest names are present in ${dir}.`);
