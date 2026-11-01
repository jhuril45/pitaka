/**
 * After `expo export -p web`: write the list of built files into dist/sw.js so
 * the service worker saves the whole app at install (every screen works
 * offline), and stamp a version from the file contents so each deploy installs
 * a fresh worker and drops the previous build's cache.
 *
 *   node scripts/web-precache.js   (run by `npm run build:web`)
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const SW = path.join(DIST, 'sw.js');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const urlOf = (file) => '/' + path.relative(DIST, file).split(path.sep).join('/');
const files = walk(DIST)
  .map(urlOf)
  // The shell (/) and the worker itself are handled separately; metadata.json isn't used at runtime.
  .filter((url) => !['/index.html', '/sw.js', '/metadata.json'].includes(url))
  .sort();

const hash = crypto.createHash('sha256');
for (const url of files) hash.update(url).update(fs.readFileSync(path.join(DIST, url)));
hash.update(fs.readFileSync(path.join(DIST, 'index.html')));
const version = hash.digest('hex').slice(0, 12);

let sw = fs.readFileSync(SW, 'utf8');
if (!sw.includes("const VERSION = 'dev';") || !sw.includes('const PRECACHE = [];')) {
  throw new Error('dist/sw.js is missing the VERSION / PRECACHE placeholders');
}
sw = sw.replace("const VERSION = 'dev';", `const VERSION = '${version}';`).replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(files)};`);
fs.writeFileSync(SW, sw);

const bytes = files.reduce((n, url) => n + fs.statSync(path.join(DIST, url)).size, 0);
console.log(`sw.js ${version}: ${files.length} files precached (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
