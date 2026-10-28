#!/usr/bin/env node
/**
 * Milestone "definition of done" guard rails:
 *  1. No master key / server secrets in anything that ships in the app bundle.
 *  2. No float money math in app or shared code.
 *  3. No database/backend dependency other than Parse/Back4App.
 *  4. expo-sqlite is only used as the Parse key-value store.
 *  5. No hard-coded third-party secrets in cloud/main.js.
 *
 * Usage: node scripts/check-safety.js   (exits 1 on any finding)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const APP_DIRS = ['src', 'shared'];
const APP_FILES = ['app.json', '.env', '.env.local', '.env.example', 'metro.config.js'];
const failures = [];

function walk(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(rel);
    return /\.(ts|tsx|js|jsx|json)$/.test(entry.name) ? [rel] : [];
  });
}

function scan(files, rules) {
  for (const file of files) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const { pattern, message, allow } of rules) {
        if (pattern.test(line) && !(allow && allow(file, line))) {
          failures.push(`${file}:${i + 1}  ${message}\n    ${line.trim()}`);
        }
      }
    });
  }
}

const appFiles = [...APP_DIRS.flatMap(walk), ...APP_FILES];

// 1. Secrets
scan(appFiles, [
  { pattern: /master[_-]?key/i, message: 'Master key reference in app code' },
  { pattern: /X-Parse-Master-Key|useMasterKey/, message: 'Master key usage in app code' },
  { pattern: /REST_API_KEY|X-Parse-REST-API-Key/i, message: 'REST API key in app code' },
  { pattern: /EXPO_ACCESS_TOKEN|sk_live_|sk_test_|AKIA[0-9A-Z]{16}/, message: 'Server/third-party secret in app code' },
  {
    pattern: /^EXPO_PUBLIC_(?!PARSE_APP_ID|PARSE_JS_KEY|PARSE_SERVER_URL)\w+=\S/,
    message: 'Unexpected public env var — only the Parse app id, JS key and server URL may ship',
  },
]);

// 2. Float money
scan(
  APP_DIRS.flatMap(walk).filter((f) => /\.(ts|tsx)$/.test(f)),
  [
    { pattern: /\bparseFloat\s*\(/, message: 'parseFloat — use parseMoney() for amounts' },
    { pattern: /\.toFixed\s*\(/, message: 'toFixed — use formatMoney()/toMajorString()' },
    { pattern: /Minor\s*[*/]\s*\d*\.\d+|\d*\.\d+\s*\*\s*\w*Minor/, message: 'Float arithmetic on a *Minor amount' },
    { pattern: /Minor\s*\/\s*100\b|\*\s*100\s*\)?\s*;?\s*\/\/\s*cents/i, message: 'Manual /100 conversion — use money helpers' },
  ],
);

// 3. Request budget: the app never saves, deletes or queries Parse objects one by one.
//    Writes go through the Outbox → syncPush (≤ 200 rows per request); reads come from the Local Datastore.
scan(
  APP_DIRS.flatMap(walk).filter((f) => /\.(ts|tsx)$/.test(f)),
  [
    {
      pattern: /\.(save|saveAll|saveEventually|destroy|destroyAll|destroyEventually)\s*\(/,
      message: 'Direct Parse write — queue it in the Outbox (saveRecord) instead',
      // Receipt photos are uploaded as Parse Files (one request per photo, by design).
      allow: (file) => file.endsWith(path.join('features', 'attachments', 'attachments.ts')),
    },
    {
      pattern: /new Parse\.Query\(/,
      message: 'Server query from the app — read the Local Datastore (fromPinWithName) instead',
      // The diagnostics probe queries the Local Datastore only.
      allow: (file) => file.endsWith(path.join('parse', 'self-check.ts')),
    },
  ],
);

// 4. Banned backends
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const banned = [
  /^firebase$/,
  /^@react-native-firebase\//,
  /^@supabase\//,
  /^drizzle-/,
  /^@op-engineering\/op-sqlite$/,
  /^react-native-sqlite/,
  /^@nozbe\/watermelondb$/,
  /^realm$/,
  /^@realm\//,
  /^aws-amplify$/,
  /^@aws-amplify\//,
  /^appwrite$/,
  /^pocketbase$/,
  /^@instantdb\//,
  /^convex$/,
  /^express$/,
  /^fastify$/,
  /^mongoose$/,
  /^prisma$/,
  /^@prisma\//,
];
for (const dep of deps) {
  if (banned.some((re) => re.test(dep))) failures.push(`package.json  Banned backend/database dependency: ${dep}`);
}

// 4. expo-sqlite only as the Parse kv-store
scan(
  APP_DIRS.flatMap(walk),
  [
    {
      pattern: /from ['"]expo-sqlite(?!\/kv-store)['"/]/,
      message: 'expo-sqlite may only be imported as expo-sqlite/kv-store (Parse storage)',
    },
  ],
);

// 5. Cloud Code runs on Back4App with master access, but third-party secrets
// (price providers, Expo access token) must come from Back4App environment
// variables via process.env, never be pasted into cloud/main.js.
scan(walk('cloud'), [
  {
    pattern: /sk_live_|sk_test_|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._-]{20,}|['"][A-Za-z0-9]{40}['"]/,
    message: 'Hard-coded secret in Cloud Code — use a Back4App environment variable',
  },
]);

if (failures.length) {
  console.error(`Safety check failed (${failures.length}):\n\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`Safety check passed: ${appFiles.length} app files scanned, ${deps.length} dependencies checked.`);
