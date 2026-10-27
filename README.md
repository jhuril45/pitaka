# Pitaka

Personal finance app for the Philippines: expenses, income, transfers, budgets, goals, debts,
recurring bills, cashflow forecast and investments, with typed and spoken quick entry.

Two platforms only:

- **App:** React Native + Expo SDK 58 (TypeScript strict, Expo Router, EAS dev builds)
- **Backend:** Back4App (hosted Parse Server): database, auth, files, Cloud Code, jobs, push

Offline support comes from the Parse SDK Local Datastore, stored in SQLite through
`expo-sqlite/kv-store`. There is no other database or backend.

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in the Back4App Application ID + JavaScript Key
npx expo run:android           # dev build on an emulator/device (native modules → no Expo Go)
npm run check                  # typecheck + lint + tests + safety checks
```

### Back4App setup (Cloud Code)

The whole backend is one file, [`cloud/main.js`](cloud/main.js) (plain JavaScript, no build step):

1. Back4App dashboard → **Cloud Code** → open `cloud/main.js` → replace its contents with this
   repo's `cloud/main.js` → **Deploy**. Redeploy whenever the file changes.
2. **Server Settings → Background Jobs → Run a job**, in this order:
   1. `setupSchema`: creates every class with fixed field types, class-level permissions and
      indexes, adds `_User.name`, and hides the user list. Safe to re-run; re-run after changing
      the class definitions.
   2. `seedShared`: adds the PH bank/e-wallet templates and default categories. Existing rows are
      kept unless you pass `{"overwrite": true}`, so dashboard edits survive.
   3. `cleanupInvalidRows` (once): deletes rows written before the permissions existed.
3. Check that password-reset emails are enabled under App Settings → Authentication (on by default).
4. `npm run test:integration` runs the security checks against the dev app. It refuses to run
   until steps 1 and 2 are done, so it can never write to an unprotected app.

No master key is used anywhere outside Back4App: jobs run with master access on the server.

iOS dev builds need macOS or EAS: `npx eas-cli@latest build --profile development --platform ios`.

### Environment

| Variable | Where | Notes |
|---|---|---|
| `EXPO_PUBLIC_PARSE_APP_ID` | `.env.local` (app) | Back4App → App Settings → Security & Keys |
| `EXPO_PUBLIC_PARSE_JS_KEY` | `.env.local` (app) | JavaScript Key: the only client key that ships |
| `EXPO_PUBLIC_PARSE_SERVER_URL` | `.env.local` (app) | `https://parseapi.back4app.com` |
| Price-provider keys, Expo access token (later milestones) | Back4App → Server Settings → Environment Variables | Read in `cloud/main.js` via `process.env`; **never** in the app or this repo |

`.env.local` is gitignored. The master key is never needed locally.

## Project layout

```
src/app/          routes: welcome / sign-in / register / forgot-password, (app)/(tabs), (app)/quick-add
src/features/auth auth-service.ts (Parse accounts), auth-context.tsx, auth-screen.tsx
src/parse/        init.ts (storage, keys, Local Datastore), storage.ts (kv-store adapter), cloud.ts, self-check.ts
cloud/main.js     Back4App Cloud Code: triggers, functions, jobs (paste into the dashboard)
plugins/          with-windows-cmake.js (local Android builds on Windows)
assets/images/    app icon, adaptive icon layers, splash, favicon (scripts/generate-icons.py)
src/lib/          money.ts (re-exports /shared), parser/, forecast/ … (later milestones)
src/theme/        design tokens + useTheme()
src/components/   ui/ primitives
src/polyfills/    crypto.ts (randomUUID for the Parse SDK under Hermes)
shared/           money.ts, zod schemas, bundled seed data (cloud/main.js keeps identical copies; tests enforce it)
scripts/          check-safety.js
__tests__/        Jest tests
```

Routes live in `src/app/` (the SDK 58 template convention) instead of a root `/app`.

## Scripts

| Script | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` (ESLint, flat config) |
| `npm test` | Jest (`jest-expo` preset), including Cloud Code trigger and parity tests |
| `npm run test:integration` | Security checks against the live **dev** Back4App app |
| `npm run check:safety` | Secret, float-money and banned-dependency checks (app and `cloud/`) |
| `npm run check` | Everything above; must pass at the end of every milestone |

---

## Milestone 1: Foundation ✅

### Built
- Expo SDK 58 project (`pitaka`, `app.pitaka.dev`). TypeScript strict plus `noUncheckedIndexedAccess`.
- Expo Router: bottom tabs **Home · Transactions · (＋) · Plan · More**. The center button opens
  the `quick-add` modal. Screens are placeholders.
- Theme tokens (`src/theme`): colors for light and dark, spacing, radius, typography and
  tabular-number amounts. `useTheme()` follows the system setting.
- Parse SDK init (`src/parse/init.ts`):
  - `Parse.setAsyncStorage()` with a **callback adapter** over `expo-sqlite/kv-store`
    (`src/parse/storage.ts`). Parse's React Native storage controller only listens for
    callbacks, so the promise-only kv-store would hang every Local Datastore call without it.
  - `Parse.enableLocalDatastore(false)`. The default `true` starts Parse's EventuallyQueue,
    which polls `GET /health` every 2 s while offline. Our own Outbox (Milestone 3) replaces
    that queue, so the poll would only waste requests.
  - **`crypto` shim** (`metro.config.js` → `src/polyfills/crypto.ts`). Parse's RN build calls
    `require('crypto').randomUUID()` for local object ids and anonymous login, and Hermes has
    no `crypto` module. The shim maps it to `expo-crypto`. `react-native-get-random-values`
    is **not** needed.
- `shared/money.ts`: integer minor units only. String/BigInt parsing (`"1,250.50"`, `"₱99"`,
  `"2.5k"`, `"1m"`, `"-₱50"`, `"$20"`), formatting, add/subtract/sum/multiply, `allocate()`
  (splits without losing centavos), `ratioBps()` (integer percentages), `formatCompact()`.
- `shared/schemas`: zod 4 schemas for all 17 user-data classes and 7 server classes, with
  cross-field rules (transfer destination, positive amounts, decimal-string quantities). Also a
  `userDataSchemas` registry and `MONEY_FIELDS` for Cloud Code's `beforeSave`.
- Diagnostics on **More**: "Check local datastore" pins an unsaved object, queries it back from
  its named pin and unpins it, with timings.
- `scripts/check-safety.js`: checks for secrets in app code and env, float-money patterns,
  banned backend/database dependencies, and `expo-sqlite` imports other than kv-store.

### Schema fields added beyond the spec
- `Budget.customDays`: length of a custom period.
- `Debt.note`.
- `RecurringRule.name` and `autoPost`: post automatically or just remind.
- `Holding.currency` and `manualPriceMinor`: for the manual price fallback.
- `Setting.profileUuid` is nullable, for account-wide settings.
- `MerchantDictionary.confidenceBps`: integer instead of a float confidence.

### Tested
- `npm run check`: tsc, ESLint, **65 Jest tests**, safety check. All pass.
  - `money.test.ts`: parsing (including rounding traps like `1.005` and `1.15`), formatting,
    arithmetic guards, allocation, basis points.
  - `schemas.test.ts`: valid and invalid records, float money rejected, transfer rules.
  - `parse-storage.test.ts`: callback bridge results and error paths.
  - `parse-datastore.test.ts`: the **real Parse RN SDK** pinning to named pins, querying with
    `fromPinWithName`, and unpinning through the adapter.
- `npx expo-doctor`: 20/20 checks pass.
- `npx expo export --platform android`: the bundle builds, the `crypto` shim resolves, the app
  ID is present, and no secret values are present.

### Stubbed / deferred
- Screens are placeholders. Zustand, react-hook-form, charts and the other feature libraries
  arrive with the milestones that use them.
- No Cloud Code yet (added in Milestone 2).

### How to test manually
1. `npx expo run:android` (or an EAS dev build on iOS).
2. Check that the four tabs and the center ＋ button (opens Quick add) work, and that
   light/dark follows the system.
3. Go to **More → Check local datastore**. It should report `Local datastore OK` with pin and
   query timings.
4. Turn on airplane mode, restart the app, and repeat step 3. It works offline.

---

## Milestone 2: Back4App setup + accounts ✅

### Built
- **`cloud/main.js`**, deployed by pasting it into the dashboard (same approach as fitness-tracker-app):
  - Class definitions for all 17 user-data classes, `MonthlySummary`/`Insight` (owner read,
    server write), the 4 shared public-read classes and private `TrackedSymbol`, with fixed
    field types.
  - CLPs: user data can only be **read** by its owner (pointer permission on `owner`). Every
    client create, update and delete is refused. Shared classes are public read, server write.
    `_User` find/count is blocked.
  - Indexes: `(owner, uuid)` and `(owner, serverUpdatedAt)` on every owned class, plus
    `Transaction (owner, profileUuid, occurredAt)`, `MonthlySummary (owner, profileUuid, month)`,
    `PriceSnapshot (symbol, capturedOn)` and the seed-key indexes. Mongo pointer columns are
    indexed as `_p_owner`. Parse's Schema API can't create **unique** indexes, so
    `(owner, uuid)` uniqueness will be enforced in `syncPush` (Milestone 3).
  - `beforeSave` on every class: master-key writes only. It locks `owner` and `uuid`
    (`owner` can only change with `context.reown`, for `claimAnonymousData`), forces an
    owner-only ACL, stamps `serverUpdatedAt`, requires a valid `uuid`/`profileUuid`, and
    rejects non-integer money (nested fields too). `beforeDelete` is master-only.
    `beforeSaveFile` needs a signed-in user, accepts JPEG/PNG/HEIC/WebP/PDF only, and limits
    files to 10 MB.
  - Functions: `registerDevice` (upserts the caller's `DeviceToken`; a token moved to another
    user is soft-deleted there) and `deleteAccount` (deletes rows, receipt files, sessions, then
    the user; time-boxed and resumable, so the app calls it until `done`).
  - Jobs: `setupSchema`, `seedShared`, `cleanupInvalidRows`.
- **Accounts, matching fitness-tracker-app:** anyone not logged in sees the landing page
  (Welcome, staged animation) with **Login** and **Register**, plus Forgot password.
  `Stack.Protected` guards with `redirectTo`. Email is the username, plus a `name` field. Error
  messages don't reveal which emails have accounts. Password-reset emails come from Back4App.
  - An account is required, so the **first** launch needs internet to register or log in.
    Afterwards the session is stored on the device and the app opens offline. This replaces the
    spec's anonymous-user-first design. The server still accepts anonymous users, so guest
    mode could come back later.
  - More → Account: name and email, Log out, and Delete account (with confirmation). Logging out
    clears this device's Local Datastore.
- **App icon:** the in-app logo (teal tile, amber band, white ₱) is the app icon, Android
  adaptive icon (with monochrome layer), splash (light and dark) and favicon. Regenerate them
  with `python scripts/generate-icons.py` (Pillow). The ₱ is drawn from shapes, not a font.
- Seed data (21 PH banks/e-wallets/account types, 33 categories with Taglish keywords) is
  bundled in `shared/seed` for offline first launch.
- `plugins/with-windows-cmake.js`: local Android builds on Windows failed with "Filename longer
  than 260 characters" (ninja 1.10 in CMake 3.22.1). The plugin pins CMake 3.31.6 (ninja 1.12)
  only when prebuild runs on Windows.

### Tested
- `npm run check` passes: 7 suites, **118 tests**.
  - `cloud-triggers.test.ts` loads the real `cloud/main.js` with the Parse Node SDK and checks
    refused client writes, owner-only ACLs, `serverUpdatedAt`, float/NaN/unsafe money rejection
    (including `template.amountMinor`), uuid/owner lock and `reown`, shared/server ACLs, CLP
    shapes, file-upload rules and function input checks.
  - `cloud-parity.test.ts` checks `main.js` against `/shared`: same classes, same money fields,
    a column for every zod field, and identical seed data (also zod-validated).
  - `auth-service.test.ts`: register/reset validation, the offline login and register messages,
    and logout clearing the datastore.
- `npm run test:integration` against the deployed dev app: **18/18 pass**. Two users can't see or
  change each other's rows, every direct client write is refused (`119`), `_User` listing and
  `TrackedSymbol` are hidden, shared classes are seeded and read-only, registration stores the
  name and logs in by email, duplicate emails and wrong passwords are refused, and
  `deleteAccount` removes the user and session.
- On the Android emulator (dev build): a fresh install lands on Welcome with Login and Register.
  Register shows the live password-mismatch error. Login with a wrong password against the real
  server shows "Incorrect email or password." The Local Datastore check passes (pin 107 ms,
  query 20 ms).

### Stubbed / deferred
- No push-token registration in the app yet: `registerDevice` is ready server-side;
  `expo-notifications` arrives in Milestone 8.
- Sign in with Apple/Google and `claimAnonymousData` merging: Milestone 12.
- Back4App rate limiting for Cloud functions is a dashboard/plan setting (Milestone 13 audit).

---

## Milestone 3: Repositories, Outbox and sync

### Built
- **Records and local storage** (`src/data`):
  - Each local Parse object uses the record's **uuid as its Parse id**. A row created offline and
    the same row pulled from the server are therefore one object (`Parse_LDS_<class>_<uuid>`), and
    there's never a localId→objectId swap.
  - Named pins: `profiles`, `account`, `profile:<uuid>`, `tx:<profile>:<YYYY-MM>`,
    `summary:<profile>`, `insights:<profile>`. Editing a transaction into another month moves it
    to that month's pin.
  - Rolling **12-month transaction window**: older transactions stay on the server.
  - `repo.saveRecord / deleteRecord / getRecord`: validate with the shared zod schema, stamp
    `clientUpdatedAt`, pin, queue in the Outbox, notify hooks, and schedule a sync 5 s later.
    Deletes are soft (`deletedAt`). `useLocalQuery` re-runs Local Datastore reads when a class it
    watches changes.
- **Outbox and sync engine** (`src/sync`):
  - The outbox is de-duplicated by `<class>~<uuid>`.
  - Each cycle pushes the outbox in batches of up to 200 through `syncPush`, then pulls everything
    since the cursor through `syncPull` (paged) and saves the cursor. The first sync on a device
    calls `bootstrap` first.
  - Conflicts: newest `clientUpdatedAt` wins. A queued local edit that's newer than a pulled copy
    is kept. A local change that loses is logged to **More → Sync → Sync issues**, and rows the
    server refuses are logged there too.
  - Triggers: app start, foreground, network reconnect (expo-network), 5 s after writes, the sync
    indicator / "Sync now", and an OS background task (expo-background-task, about every 30 min).
    Exponential backoff on errors (5 s → 5 min); never blocks the UI.
  - Status indicator (Zustand store): synced / syncing / offline / N to sync / failed.
  - Log out warns if changes haven't synced, then clears the Local Datastore **and** the
    outbox, issues and cursors.
- **Cloud Code** (`cloud/main.js`):
  - **`syncPush`**: up to 200 rows; upsert by `(owner, uuid)`; type-checks every field against
    the class definitions; last write wins (an equal timestamp is accepted, so a re-push is
    harmless). Returns `accepted / conflicts (server copy) / rejected (per-row error)`. If the
    batch save fails, it retries row by row so one bad row doesn't block the rest.
  - **`syncPull`**: one call walks every owned class. The cursor is
    `(serverUpdatedAt, class index, objectId)`, so rows sharing a timestamp are never skipped. It
    only returns rows older than 3 s, so a save still being written can't be passed over. Includes
    soft-deleted rows.
  - **`bootstrap`**: reference data, the last 90 days of transactions, `MonthlySummary` and the
    shared templates in one call.

### Parse JS SDK findings (parse 8.6.2)
- **Reads load everything:** `Parse.Query.fromPinWithName()` and `fetchFromLocalDatastore()` both
  read **every** object in the Local Datastore on each call, so named pins don't limit the work.
  `src/data/local-store.ts` still **writes** through the SDK (`pinWithName`, the SDK's storage
  format) but **reads** keys directly: one key per lookup, and only a pin's own keys per listing.
- **Null-field crash:** `fetchFromLocalDatastore()` throws `Cannot read properties of null
  (reading '__type')` for any object with a null field, which is nearly every record.
- **Unpin scans:** `unPinWithName()` scans every pin, so the outbox and sync-issue log are plain
  key-value entries rather than pinned objects.
- **No locking:** pins are read-modify-write with no locking, so concurrent pins can drop
  entries. All local writes go through `withLock()` (`src/data/lock.ts`).

### Tested
- `npm run check` passes: 9 suites, **163 tests**.
  - `sync-engine.test.ts`: **every simulated device has its own Parse SDK instance and its own
    store**, all syncing with an in-memory server that follows the `main.js` rules. It covers:
    - offline save → queued → pushed once online
    - offline first launch
    - outbox de-duplication
    - a second device receiving rows, edits and soft deletes
    - offline edits on two devices converging on the newer edit (in both push orders), with the
      loser logged
    - a queued newer local edit surviving a pull
    - rejected rows logged and not retried
    - 350 rows paged with tied timestamps
    - incremental pulls
    - month-pin moves
    - the 12-month window
    - profile separation
  - `cloud-sync.test.ts`: the real `main.js` record conversion, field type checks (including the
    Setting JSON round trip and file refusal), cursor ordering, `DATE_FIELDS` parity, and input
    checks.
- `__tests__/integration/sync.test.ts` (needs the redeploy) checks the live server:
  - idempotent push, older-edit conflicts
  - float money and wrong types rejected per row while good rows save
  - the same uuid from two users stays separate
  - 250 rows paged
  - soft deletes delivered after the cursor, and the 3 s pull lag
  - `bootstrap` contents

### Stubbed / deferred
- No UI writes data yet. The first screens that save (accounts, categories, transactions) are
  Milestone 4.
- Transactions older than the window are fetched with `getTransactionsPage` in Milestone 12.
- 10k-transaction benchmark: Milestone 13.

---

## Milestone 4: Accounts, categories, transactions 🚧 in progress

### Built so far
- **Starter profile:** after sign-in, the app loads the last-used profile, or syncs and then
  creates "Personal" (PHP) with the default categories and a Cash account. The uuids of these
  rows come from the user id, so two phones creating them independently merge into the same rows.
  They're stamped at the epoch, so they never overwrite real edits made elsewhere.
- **Repositories** (`src/data/repos`): profiles, accounts, categories (tree and labels; deleting
  a parent deletes its children), and transactions (month-pin reads, filters, search).
  `useAccountBalances` derives balances from opening balance + transactions (`src/lib/balances.ts`).
- **Screens:**
  - Quick Add → **Form** (`/transaction/new`, also used to edit): Expense / Income / Transfer;
    amounts like `1,250.50` or `2.5k`; account, category and day pickers.
  - Transactions tab: search, type filter, grouped by day with daily net, swipe for Edit/Delete,
    pull-to-refresh.
  - More → Accounts (bank/e-wallet templates, balances, archive) and Categories.
  - Home: net worth with a hide-amounts toggle, this month's income vs spent, accounts and recent
    transactions.

### Tested so far
- `npm run check` passes: 11 suites, **173 tests**, typecheck and lint clean. New suites:
  `balances.test.ts` and `repos.test.ts` (starter profile once and identical on two devices,
  starter rows never overwriting real data, transaction save/filter/edit/delete, category tree).

### Remaining for Milestone 4
- Check it on the emulator (needs a signed-in account).

---

## Milestone 5: Smart text parser + merchant learning ✅ (code) · device check pending

### Built
- **Parser** (`src/lib/parser`, fully on device), `parseEntry(text, context)` → draft:
  - **Amounts:** `250`, `30k`, `1,250.50`, `₱99`, `P500`, `PHP 1000`, `2.5k`, `1m`, `$15.99` (currency
    reported). Digits glued to words (`7-Eleven`) are ignored. A marked amount beats a plain number.
  - **Dates:** today/ngayon, yesterday/kahapon, kamakalawa, last week, `N days ago`, weekdays
    (`last monday`, `lunes`), `Oct 5` / `5 Oct`, `10/5` (month/day). Dates never land in the future.
  - **Accounts:** names and aliases (gcash, maya/paymaya, bdo, card/cc, cash/pera…), plus a
    one-typo fuzzy match (`gcsh` → GCash). Defaults to the cash account.
  - **Type:** transfers ("Paid credit card 5k", "gcash to bdo 1000", "transfer 500 to maya"),
    income (received, bonus, refund…, or an income-category keyword like sweldo/sahod/salary),
    otherwise expense.
  - **"Received 2000 from Mark":** income with counterparty Mark, flagged `income-or-debt`, and
    lists Mark's open debts owed to you (the repayment choice arrives with debts in Milestone 8).
  - **Category order:**
    1. your learned `MerchantMapping`
    2. the cached `MerchantDictionary`
    3. the online `suggestCategory`
    4. keyword rules from the default categories (English + Taglish: pamasahe, kape, sweldo,
       Meralco, load, gamot…) and your own category names

    For keywords, the longest match wins, and a subcategory beats its parent.
- **Smart entry screen** (Quick Add → Smart text): live preview as you type, example chips,
  then "Review & save" opens the normal form prefilled. **Changing the suggested category
  teaches it** (`learnMerchantCategory`): one `MerchantMapping` per merchant per profile (uuid
  from profile + merchant), synced to your other devices.
- **Cloud Code:**
  - `suggestCategory({ merchant })` looks up the `MerchantDictionary`.
  - `bootstrap` also returns the dictionary (top 2000 by confidence), cached on the device for
    offline lookups.
  - The server's `normalizeMerchant` copy is kept identical to the app's by a parity test.

### Tested
- `npm run check` passes: 13 suites, **234 tests**.
  - `parser.test.ts`: **50 cases**, covering every spec example, dates, amounts, accounts and
    transfers, Taglish categories, and category precedence (mapping → dictionary → keywords;
    deleted-category mappings ignored).
  - `merchant-learning.test.ts`: app↔cloud normalization parity, one mapping per merchant with
    updates and no-op skips, a correction syncing to a second phone, and dictionary caching from
    bootstrap.
  - `integration/sync.test.ts` now also checks `suggestCategory` (runs after the redeploy).

---

## Where we stopped
1. **Redeploy `cloud/main.js`** (Cloud Code → Functions & Web Hosting → Deploy). It now includes
   `syncPush`, `syncPull`, `bootstrap` and `suggestCategory`. No jobs need re-running.
2. Run `npm run test:integration` to verify Milestones 3 and 5 against the dev app.
3. Check Milestones 4 and 5 on the emulator. This needs a signed-in account.
4. Then Milestones 6–13.
