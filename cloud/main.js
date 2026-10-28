/**
 * Pitaka — Back4App Cloud Code.
 *
 * Deploy: Back4App dashboard → Cloud Code → open cloud/main.js → replace its
 * contents with this file → Deploy. Redeploy whenever this file changes.
 *
 * After the first deploy (and after any change to CLASSES below), run these jobs
 * from Dashboard → Server Settings → Background Jobs → Run a job:
 *   1. setupSchema  creates/updates every class, its field types, class-level
 *                   permissions (CLPs) and indexes. Safe to run again.
 *   2. seedShared   adds the shared BankTemplate and DefaultCategorySet rows.
 *                   Existing rows are left alone unless you pass {"overwrite": true},
 *                   so dashboard edits survive a re-run.
 *   3. cleanupInvalidRows (once, optional) deletes rows written before the
 *                   permissions existed: owner-scoped rows with no owner and
 *                   shared rows missing required fields.
 *   4. processRecurring: schedule it daily at 01:00 UTC (09:00 Manila). It
 *                   pushes bill, installment and debt reminders to phones that
 *                   registered for push. It never creates transactions (the
 *                   app records due items itself, offline). Set the env var
 *                   EXPO_ACCESS_TOKEN only if Expo push security is enabled.
 *
 * Security model
 *   - User-data classes: clients may only READ their own rows (pointer
 *     permission on `owner`). Every client write is refused by CLP and again by
 *     beforeSave; writes go through Cloud functions using the master key, which
 *     check ownership first.
 *   - Every saved user-data row gets an owner-only ACL and a fresh
 *     `serverUpdatedAt` (the sync pull cursor) in beforeSave.
 *   - Shared classes (BankTemplate, DefaultCategorySet, PriceSnapshot,
 *     MerchantDictionary) are public read, server write.
 *   - No secrets in the app: it ships only the Application ID + JavaScript Key.
 *
 * Money is always an integer number of minor units (centavos); beforeSave
 * rejects anything else. The app's /shared zod schemas are the reference for
 * field shapes; tests in __tests__/cloud-*.test.ts keep this file in step.
 */

const nodeCrypto = require('crypto');

// ================================================================ classes

/** Fields present on every user-data class. */
const COMMON_FIELDS = {
  uuid: 'String',
  owner: { type: 'Pointer', targetClass: '_User' },
  profileUuid: 'String',
  clientUpdatedAt: 'Date',
  serverUpdatedAt: 'Date',
  deletedAt: 'Date',
};

/**
 * Classes clients sync (through Cloud functions). Field types are fixed here so
 * a bad first write can't create a column with the wrong type.
 * Setting values are JSON-encoded into `valueJson`.
 */
const USER_DATA_FIELDS = {
  Profile: { name: 'String', baseCurrency: 'String', icon: 'String', color: 'String', type: 'String' },
  Account: {
    name: 'String',
    type: 'String',
    currency: 'String',
    openingBalanceMinor: 'Number',
    creditLimitMinor: 'Number',
    icon: 'String',
    color: 'String',
    archived: 'Boolean',
    sortOrder: 'Number',
    templateKey: 'String',
  },
  Category: { parentUuid: 'String', name: 'String', kind: 'String', icon: 'String', color: 'String', sortOrder: 'Number' },
  Transaction: {
    type: 'String',
    amountMinor: 'Number',
    accountUuid: 'String',
    toAccountUuid: 'String',
    categoryUuid: 'String',
    occurredAt: 'Date',
    note: 'String',
    merchant: 'String',
    source: 'String',
    recurringRuleUuid: 'String',
    installmentUuid: 'String',
  },
  Attachment: { transactionUuid: 'String', file: 'File', mime: 'String', ocrText: 'String' },
  Budget: {
    categoryUuid: 'String',
    period: 'String',
    amountMinor: 'Number',
    rollover: 'Boolean',
    startDate: 'Date',
    customDays: 'Number',
  },
  Goal: { name: 'String', targetMinor: 'Number', targetDate: 'Date', linkedAccountUuid: 'String', icon: 'String' },
  GoalContribution: { goalUuid: 'String', amountMinor: 'Number', occurredAt: 'Date' },
  Debt: {
    direction: 'String',
    counterparty: 'String',
    principalMinor: 'Number',
    dueDate: 'Date',
    settledAt: 'Date',
    note: 'String',
  },
  DebtPayment: { debtUuid: 'String', amountMinor: 'Number', occurredAt: 'Date', transactionUuid: 'String' },
  Installment: {
    name: 'String',
    accountUuid: 'String',
    totalMinor: 'Number',
    months: 'Number',
    startDate: 'Date',
    monthlyMinor: 'Number',
    categoryUuid: 'String',
  },
  RecurringRule: {
    name: 'String',
    template: 'Object',
    frequency: 'String',
    interval: 'Number',
    byMonthDay: 'Number',
    nextRunAt: 'Date',
    endAt: 'Date',
    kind: 'String',
    remindDaysBefore: 'Number',
    autoPost: 'Boolean',
  },
  Holding: {
    accountUuid: 'String',
    symbol: 'String',
    assetClass: 'String',
    quantity: 'String',
    avgCostMinor: 'Number',
    currency: 'String',
    manualPriceMinor: 'Number',
  },
  Note: { body: 'String', dueAt: 'Date', done: 'Boolean' },
  MerchantMapping: { merchantNormalized: 'String', categoryUuid: 'String' },
  Setting: { key: 'String', valueJson: 'String' },
  DeviceToken: { expoPushToken: 'String', platform: 'String', lastSeenAt: 'Date' },
};

const USER_DATA_CLASSES = Object.keys(USER_DATA_FIELDS);

/** Classes whose rows don't belong to a profile. */
const PROFILELESS_CLASSES = ['Profile', 'DeviceToken'];
/** Classes where profileUuid may be null (account-wide rows). */
const OPTIONAL_PROFILE_CLASSES = ['Setting'];

/** Integer money fields per class (dot = nested). Mirrors MONEY_FIELDS in /shared. */
const MONEY_FIELDS = {
  Profile: [],
  Account: ['openingBalanceMinor', 'creditLimitMinor'],
  Category: [],
  Transaction: ['amountMinor'],
  Attachment: [],
  Budget: ['amountMinor'],
  Goal: ['targetMinor'],
  GoalContribution: ['amountMinor'],
  Debt: ['principalMinor'],
  DebtPayment: ['amountMinor'],
  Installment: ['totalMinor', 'monthlyMinor'],
  RecurringRule: ['template.amountMinor'],
  Holding: ['avgCostMinor', 'manualPriceMinor'],
  Note: [],
  MerchantMapping: [],
  Setting: [],
  DeviceToken: [],
};

/** Per-user rows written only by the server (triggers/jobs); owner can read. */
const SERVER_OWNED_FIELDS = {
  MonthlySummary: {
    uuid: 'String',
    owner: { type: 'Pointer', targetClass: '_User' },
    profileUuid: 'String',
    month: 'String',
    accountUuid: 'String',
    categoryUuid: 'String',
    incomeMinor: 'Number',
    expenseMinor: 'Number',
    txCount: 'Number',
    serverUpdatedAt: 'Date',
  },
  Insight: {
    uuid: 'String',
    owner: { type: 'Pointer', targetClass: '_User' },
    profileUuid: 'String',
    kind: 'String',
    message: 'String',
    payload: 'Object',
    periodStart: 'Date',
    readAt: 'Date',
    serverUpdatedAt: 'Date',
  },
};

/** Shared rows anyone can read; written only by jobs or the dashboard. */
const SHARED_PUBLIC_FIELDS = {
  PriceSnapshot: { symbol: 'String', assetClass: 'String', priceMinor: 'Number', currency: 'String', capturedOn: 'String' },
  MerchantDictionary: { merchantNormalized: 'String', suggestedCategoryKey: 'String', confidenceBps: 'Number' },
  BankTemplate: {
    key: 'String',
    name: 'String',
    type: 'String',
    icon: 'String',
    color: 'String',
    currency: 'String',
    sortOrder: 'Number',
    active: 'Boolean',
  },
  DefaultCategorySet: {
    key: 'String',
    parentKey: 'String',
    name: 'String',
    kind: 'String',
    icon: 'String',
    color: 'String',
    sortOrder: 'Number',
    keywords: 'Array',
  },
};

/** Server-only bookkeeping; no client access at all. */
const PRIVATE_FIELDS = {
  TrackedSymbol: { symbol: 'String', assetClass: 'String', refCount: 'Number', lastFetchedAt: 'Date' },
  /** One row per push reminder sent, so a re-run of processRecurring never repeats one. */
  ReminderLog: { key: 'String', sentAt: 'Date' },
};

const SERVER_OWNED_CLASSES = Object.keys(SERVER_OWNED_FIELDS);
const SHARED_PUBLIC_CLASSES = Object.keys(SHARED_PUBLIC_FIELDS);
const PRIVATE_CLASSES = Object.keys(PRIVATE_FIELDS);

// ================================================================ permissions & indexes

const NOBODY = {};
const EVERYONE = { '*': true };

/** Owner may get/find/count their own rows; nobody may write from a client. */
const OWNER_READ_ONLY_CLP = {
  get: NOBODY,
  find: NOBODY,
  count: NOBODY,
  create: NOBODY,
  update: NOBODY,
  delete: NOBODY,
  addField: NOBODY,
  readUserFields: ['owner'],
  protectedFields: { '*': [] },
};

const PUBLIC_READ_ONLY_CLP = {
  get: EVERYONE,
  find: EVERYONE,
  count: EVERYONE,
  create: NOBODY,
  update: NOBODY,
  delete: NOBODY,
  addField: NOBODY,
  protectedFields: { '*': [] },
};

const NO_CLIENT_ACCESS_CLP = {
  get: NOBODY,
  find: NOBODY,
  count: NOBODY,
  create: NOBODY,
  update: NOBODY,
  delete: NOBODY,
  addField: NOBODY,
  protectedFields: { '*': [] },
};

/** MongoDB stores pointer columns as `_p_<name>`, so indexes use that key. */
const OWNER_INDEXES = {
  owner_uuid: { _p_owner: 1, uuid: 1 },
  owner_serverUpdatedAt: { _p_owner: 1, serverUpdatedAt: 1 },
};

const EXTRA_INDEXES = {
  Transaction: { owner_profile_occurredAt: { _p_owner: 1, profileUuid: 1, occurredAt: -1 } },
  DeviceToken: { expoPushToken: { expoPushToken: 1 } },
  ReminderLog: { key: { key: 1 } },
  MonthlySummary: { owner_profile_month: { _p_owner: 1, profileUuid: 1, month: 1 } },
  PriceSnapshot: { symbol_capturedOn: { symbol: 1, capturedOn: -1 } },
  TrackedSymbol: { symbol_assetClass: { symbol: 1, assetClass: 1 } },
  MerchantDictionary: { merchantNormalized: { merchantNormalized: 1 } },
  BankTemplate: { key: { key: 1 } },
  DefaultCategorySet: { key: { key: 1 } },
};

/** Everything setupSchema creates: fields, CLP and indexes per class. */
function classDefinitions() {
  const defs = [];
  USER_DATA_CLASSES.forEach(function (name) {
    defs.push({
      className: name,
      fields: Object.assign({}, COMMON_FIELDS, USER_DATA_FIELDS[name]),
      clp: OWNER_READ_ONLY_CLP,
      indexes: Object.assign({}, OWNER_INDEXES, EXTRA_INDEXES[name] || {}),
    });
  });
  SERVER_OWNED_CLASSES.forEach(function (name) {
    defs.push({
      className: name,
      fields: SERVER_OWNED_FIELDS[name],
      clp: OWNER_READ_ONLY_CLP,
      indexes: Object.assign({}, OWNER_INDEXES, EXTRA_INDEXES[name] || {}),
    });
  });
  SHARED_PUBLIC_CLASSES.forEach(function (name) {
    defs.push({ className: name, fields: SHARED_PUBLIC_FIELDS[name], clp: PUBLIC_READ_ONLY_CLP, indexes: EXTRA_INDEXES[name] || {} });
  });
  PRIVATE_CLASSES.forEach(function (name) {
    defs.push({ className: name, fields: PRIVATE_FIELDS[name], clp: NO_CLIENT_ACCESS_CLP, indexes: EXTRA_INDEXES[name] || {} });
  });
  return defs;
}

// ================================================================ seed data
// Keep identical to shared/seed/*.ts (enforced by __tests__/cloud-parity.test.ts).

const BANK_TEMPLATES = [
  { key: 'cash', name: 'Cash', type: 'cash', icon: 'cash', color: '#16A34A', currency: 'PHP', sortOrder: 0, active: true },
  { key: 'gcash', name: 'GCash', type: 'ewallet', icon: 'ewallet', color: '#007DFE', currency: 'PHP', sortOrder: 10, active: true },
  { key: 'maya', name: 'Maya', type: 'ewallet', icon: 'ewallet', color: '#0F9D58', currency: 'PHP', sortOrder: 11, active: true },
  { key: 'shopeepay', name: 'ShopeePay', type: 'ewallet', icon: 'ewallet', color: '#EE4D2D', currency: 'PHP', sortOrder: 12, active: true },
  { key: 'gotyme', name: 'GoTyme Bank', type: 'bank', icon: 'bank', color: '#00B5AD', currency: 'PHP', sortOrder: 20, active: true },
  { key: 'seabank', name: 'SeaBank', type: 'bank', icon: 'bank', color: '#F26722', currency: 'PHP', sortOrder: 21, active: true },
  { key: 'tonik', name: 'Tonik', type: 'bank', icon: 'bank', color: '#7B2CBF', currency: 'PHP', sortOrder: 22, active: true },
  { key: 'cimb', name: 'CIMB Bank', type: 'bank', icon: 'bank', color: '#C8102E', currency: 'PHP', sortOrder: 23, active: true },
  { key: 'bdo', name: 'BDO', type: 'bank', icon: 'bank', color: '#0033A0', currency: 'PHP', sortOrder: 30, active: true },
  { key: 'bpi', name: 'BPI', type: 'bank', icon: 'bank', color: '#B11116', currency: 'PHP', sortOrder: 31, active: true },
  { key: 'metrobank', name: 'Metrobank', type: 'bank', icon: 'bank', color: '#1D4F91', currency: 'PHP', sortOrder: 32, active: true },
  { key: 'landbank', name: 'Landbank', type: 'bank', icon: 'bank', color: '#00843D', currency: 'PHP', sortOrder: 33, active: true },
  { key: 'unionbank', name: 'UnionBank', type: 'bank', icon: 'bank', color: '#F47920', currency: 'PHP', sortOrder: 34, active: true },
  { key: 'securitybank', name: 'Security Bank', type: 'bank', icon: 'bank', color: '#00A3E0', currency: 'PHP', sortOrder: 35, active: true },
  { key: 'chinabank', name: 'China Bank', type: 'bank', icon: 'bank', color: '#D71920', currency: 'PHP', sortOrder: 36, active: true },
  { key: 'rcbc', name: 'RCBC', type: 'bank', icon: 'bank', color: '#004B87', currency: 'PHP', sortOrder: 37, active: true },
  { key: 'pnb', name: 'PNB', type: 'bank', icon: 'bank', color: '#003A70', currency: 'PHP', sortOrder: 38, active: true },
  { key: 'eastwest', name: 'EastWest Bank', type: 'bank', icon: 'bank', color: '#6B2C91', currency: 'PHP', sortOrder: 39, active: true },
  { key: 'credit_card', name: 'Credit card', type: 'credit_card', icon: 'card', color: '#334155', currency: 'PHP', sortOrder: 50, active: true },
  { key: 'investment', name: 'Investment account', type: 'investment', icon: 'chart', color: '#0F766E', currency: 'PHP', sortOrder: 60, active: true },
  { key: 'loan', name: 'Loan', type: 'loan', icon: 'loan', color: '#B45309', currency: 'PHP', sortOrder: 70, active: true },
];

const DEFAULT_CATEGORIES = [
  { key: 'food', parentKey: null, name: 'Food', kind: 'expense', icon: 'food', color: '#F97316', sortOrder: 10, keywords: ['food', 'pagkain', 'kain', 'meal'] },
  { key: 'food.groceries', parentKey: 'food', name: 'Groceries', kind: 'expense', icon: 'cart', color: '#F97316', sortOrder: 11, keywords: ['grocery', 'groceries', 'supermarket', 'palengke', 'market', 'sm', 'puregold', 'robinsons', 'savemore', 'grocer'] },
  { key: 'food.dining', parentKey: 'food', name: 'Dining', kind: 'expense', icon: 'dining', color: '#F97316', sortOrder: 12, keywords: ['lunch', 'dinner', 'breakfast', 'merienda', 'tanghalian', 'hapunan', 'almusal', 'jollibee', 'mcdo', 'mcdonalds', 'chowking', 'mang inasal', 'kfc', 'restaurant', 'foodpanda', 'grabfood'] },
  { key: 'food.coffee', parentKey: 'food', name: 'Coffee', kind: 'expense', icon: 'coffee', color: '#F97316', sortOrder: 13, keywords: ['coffee', 'kape', 'starbucks', 'tim hortons', 'coffee project', 'bo\'s', 'cafe'] },
  { key: 'transport', parentKey: null, name: 'Transport', kind: 'expense', icon: 'car', color: '#3B82F6', sortOrder: 20, keywords: ['transport', 'pamasahe', 'fare', 'commute'] },
  { key: 'transport.fuel', parentKey: 'transport', name: 'Fuel', kind: 'expense', icon: 'fuel', color: '#3B82F6', sortOrder: 21, keywords: ['gas', 'gasolina', 'fuel', 'diesel', 'petron', 'shell', 'caltex', 'seaoil'] },
  { key: 'transport.ride_hailing', parentKey: 'transport', name: 'Grab & taxi', kind: 'expense', icon: 'taxi', color: '#3B82F6', sortOrder: 22, keywords: ['grab', 'angkas', 'joyride', 'move it', 'taxi', 'uber'] },
  { key: 'transport.commute', parentKey: 'transport', name: 'Jeep, bus & train', kind: 'expense', icon: 'bus', color: '#3B82F6', sortOrder: 23, keywords: ['jeep', 'jeepney', 'bus', 'mrt', 'lrt', 'tricycle', 'trike', 'beep', 'pamasahe'] },
  { key: 'transport.parking', parentKey: 'transport', name: 'Parking & tolls', kind: 'expense', icon: 'parking', color: '#3B82F6', sortOrder: 24, keywords: ['parking', 'toll', 'autosweep', 'easytrip', 'rfid'] },
  { key: 'bills', parentKey: null, name: 'Bills', kind: 'expense', icon: 'bill', color: '#8B5CF6', sortOrder: 30, keywords: ['bill', 'bills', 'bayarin'] },
  { key: 'bills.electricity', parentKey: 'bills', name: 'Electricity', kind: 'expense', icon: 'bolt', color: '#8B5CF6', sortOrder: 31, keywords: ['meralco', 'kuryente', 'electricity', 'electric', 'veco', 'davao light'] },
  { key: 'bills.water', parentKey: 'bills', name: 'Water', kind: 'expense', icon: 'water', color: '#8B5CF6', sortOrder: 32, keywords: ['tubig', 'water', 'maynilad', 'manila water'] },
  { key: 'bills.internet', parentKey: 'bills', name: 'Internet', kind: 'expense', icon: 'wifi', color: '#8B5CF6', sortOrder: 33, keywords: ['internet', 'wifi', 'pldt', 'converge', 'globe at home', 'sky fiber'] },
  { key: 'bills.mobile', parentKey: 'bills', name: 'Mobile & load', kind: 'expense', icon: 'phone', color: '#8B5CF6', sortOrder: 34, keywords: ['load', 'globe', 'smart', 'tnt', 'tm', 'dito', 'postpaid', 'prepaid'] },
  { key: 'housing', parentKey: null, name: 'Housing', kind: 'expense', icon: 'home', color: '#0EA5E9', sortOrder: 40, keywords: ['rent', 'upa', 'renta', 'dorm', 'condo', 'association dues', 'amortization'] },
  { key: 'shopping', parentKey: null, name: 'Shopping', kind: 'expense', icon: 'bag', color: '#EC4899', sortOrder: 50, keywords: ['shopping', 'shopee', 'lazada', 'tiktok shop', 'clothes', 'damit', 'uniqlo', 'zalora'] },
  { key: 'health', parentKey: null, name: 'Health', kind: 'expense', icon: 'health', color: '#EF4444', sortOrder: 60, keywords: ['gamot', 'medicine', 'mercury drug', 'watsons', 'doctor', 'hospital', 'checkup', 'dentist', 'philhealth'] },
  { key: 'entertainment', parentKey: null, name: 'Entertainment', kind: 'expense', icon: 'ticket', color: '#A855F7', sortOrder: 70, keywords: ['movie', 'sine', 'netflix', 'spotify', 'youtube premium', 'disney', 'games', 'steam', 'concert'] },
  { key: 'education', parentKey: null, name: 'Education', kind: 'expense', icon: 'school', color: '#14B8A6', sortOrder: 80, keywords: ['tuition', 'matrikula', 'school', 'eskwela', 'books', 'libro', 'course'] },
  { key: 'family', parentKey: null, name: 'Family & padala', kind: 'expense', icon: 'family', color: '#F59E0B', sortOrder: 90, keywords: ['padala', 'remittance', 'allowance ng anak', 'baon', 'family', 'pamilya'] },
  { key: 'personal_care', parentKey: null, name: 'Personal care', kind: 'expense', icon: 'care', color: '#F472B6', sortOrder: 100, keywords: ['haircut', 'gupit', 'salon', 'barber', 'spa', 'massage', 'toiletries'] },
  { key: 'travel', parentKey: null, name: 'Travel', kind: 'expense', icon: 'plane', color: '#06B6D4', sortOrder: 110, keywords: ['flight', 'cebu pacific', 'pal', 'airasia', 'hotel', 'airbnb', 'agoda', 'travel', 'bakasyon'] },
  { key: 'fees', parentKey: null, name: 'Fees & charges', kind: 'expense', icon: 'fee', color: '#64748B', sortOrder: 120, keywords: ['fee', 'charge', 'service charge', 'bank fee', 'annual fee', 'interest charge', 'penalty'] },
  { key: 'gifts', parentKey: null, name: 'Gifts & donations', kind: 'expense', icon: 'gift', color: '#E11D48', sortOrder: 130, keywords: ['gift', 'regalo', 'donation', 'abuloy', 'tithe', 'ninong', 'ninang', 'pamasko'] },
  { key: 'other_expense', parentKey: null, name: 'Other', kind: 'expense', icon: 'other', color: '#94A3B8', sortOrder: 999, keywords: [] },
  { key: 'salary', parentKey: null, name: 'Salary', kind: 'income', icon: 'salary', color: '#16A34A', sortOrder: 10, keywords: ['salary', 'sweldo', 'suweldo', 'sahod', 'payroll', 'payday', '13th month'] },
  { key: 'freelance', parentKey: null, name: 'Freelance', kind: 'income', icon: 'laptop', color: '#16A34A', sortOrder: 20, keywords: ['freelance', 'raket', 'client', 'upwork', 'project', 'commission'] },
  { key: 'business', parentKey: null, name: 'Business', kind: 'income', icon: 'store', color: '#16A34A', sortOrder: 30, keywords: ['sales', 'benta', 'business', 'negosyo', 'tindahan'] },
  { key: 'allowance', parentKey: null, name: 'Allowance', kind: 'income', icon: 'wallet', color: '#16A34A', sortOrder: 40, keywords: ['allowance', 'baon', 'padala'] },
  { key: 'interest', parentKey: null, name: 'Interest & dividends', kind: 'income', icon: 'chart', color: '#16A34A', sortOrder: 50, keywords: ['interest', 'dividend', 'tubo'] },
  { key: 'gifts_received', parentKey: null, name: 'Gifts received', kind: 'income', icon: 'gift', color: '#16A34A', sortOrder: 60, keywords: ['gift', 'regalo', 'aguinaldo', 'pamasko'] },
  { key: 'refunds', parentKey: null, name: 'Refunds', kind: 'income', icon: 'refund', color: '#16A34A', sortOrder: 70, keywords: ['refund', 'cashback', 'rebate', 'reimbursement'] },
  { key: 'other_income', parentKey: null, name: 'Other income', kind: 'income', icon: 'other', color: '#16A34A', sortOrder: 999, keywords: [] },
];

// ================================================================ helpers

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPO_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]{1,200}\]$/;
const MASTER = { useMasterKey: true };
const PAGE = 500;

function invalid(message) {
  return new Parse.Error(Parse.Error.VALIDATION_ERROR, message);
}

function forbidden(message) {
  return new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, message);
}

function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Please sign in again.');
  }
  return request.user;
}

function newUuid() {
  if (typeof nodeCrypto.randomUUID === 'function') return nodeCrypto.randomUUID();
  const b = nodeCrypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Owner-only ACL from a user id. */
function ownerAcl(userId) {
  const acl = new Parse.ACL();
  acl.setReadAccess(userId, true);
  acl.setWriteAccess(userId, true);
  return acl;
}

function publicReadAcl() {
  const acl = new Parse.ACL();
  acl.setPublicReadAccess(true);
  acl.setPublicWriteAccess(false);
  return acl;
}

function pathValue(object, path) {
  const parts = path.split('.');
  let value = object.get(parts[0]);
  for (let i = 1; i < parts.length; i += 1) {
    if (value === null || value === undefined || typeof value !== 'object') return value;
    value = value[parts[i]];
  }
  return value;
}

/** Throws unless every money field is null/absent or a safe integer. */
function checkMoneyFields(className, object) {
  const fields = MONEY_FIELDS[className] || [];
  fields.forEach(function (path) {
    const value = pathValue(object, path);
    if (value === undefined || value === null) return;
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw invalid(className + '.' + path + ' must be a whole number of centavos.');
    }
  });
}

function pointerId(value) {
  return value && typeof value === 'object' && typeof value.id === 'string' ? value.id : null;
}

// ================================================================ triggers

/**
 * beforeSave for user-data classes. Only master-key writes (from our own Cloud
 * functions) get through; the trigger then locks ownership and stamps the row.
 *
 * Changing `owner` is refused unless the caller passes context { reown: true }
 * (used by claimAnonymousData when merging an anonymous account).
 */
function userDataBeforeSave(className) {
  return function (request) {
    if (!request.master) {
      throw forbidden(className + ' can only be changed through sync.');
    }
    const object = request.object;
    const original = request.original;
    const context = request.context || {};

    const ownerId = pointerId(object.get('owner'));
    if (!ownerId) throw invalid(className + ' needs an owner.');

    const uuid = object.get('uuid');
    if (!isUuid(uuid)) throw invalid(className + ' needs a valid uuid.');

    if (original) {
      if (original.get('uuid') !== uuid) throw invalid('uuid cannot change.');
      const previousOwner = pointerId(original.get('owner'));
      if (previousOwner && previousOwner !== ownerId && context.reown !== true) {
        throw invalid('owner cannot change.');
      }
    }

    if (PROFILELESS_CLASSES.indexOf(className) === -1) {
      const profileUuid = object.get('profileUuid');
      const optional = OPTIONAL_PROFILE_CLASSES.indexOf(className) !== -1;
      if (!(optional && (profileUuid === null || profileUuid === undefined)) && !isUuid(profileUuid)) {
        throw invalid(className + ' needs a valid profileUuid.');
      }
    }

    checkMoneyFields(className, object);

    object.setACL(ownerAcl(ownerId));
    object.set('serverUpdatedAt', new Date());
  };
}

/** beforeSave for server-written classes: master only; owned rows get an owner ACL. */
function serverOnlyBeforeSave(className, aclFor) {
  return function (request) {
    if (!request.master) throw forbidden(className + ' is maintained by the server.');
    const object = request.object;
    if (aclFor === 'owner') {
      const ownerId = pointerId(object.get('owner'));
      if (!ownerId) throw invalid(className + ' needs an owner.');
      object.setACL(ownerAcl(ownerId));
      object.set('serverUpdatedAt', new Date());
    } else if (aclFor === 'public') {
      object.setACL(publicReadAcl());
    } else {
      object.setACL(new Parse.ACL());
    }
  };
}

function masterOnlyDelete(className) {
  return function (request) {
    if (!request.master) throw forbidden(className + ' can only be deleted by the server.');
  };
}

USER_DATA_CLASSES.forEach(function (name) {
  Parse.Cloud.beforeSave(name, userDataBeforeSave(name));
  Parse.Cloud.beforeDelete(name, masterOnlyDelete(name));
});
SERVER_OWNED_CLASSES.forEach(function (name) {
  Parse.Cloud.beforeSave(name, serverOnlyBeforeSave(name, 'owner'));
  Parse.Cloud.beforeDelete(name, masterOnlyDelete(name));
});
SHARED_PUBLIC_CLASSES.forEach(function (name) {
  Parse.Cloud.beforeSave(name, serverOnlyBeforeSave(name, 'public'));
  Parse.Cloud.beforeDelete(name, masterOnlyDelete(name));
});
PRIVATE_CLASSES.forEach(function (name) {
  Parse.Cloud.beforeSave(name, serverOnlyBeforeSave(name, 'private'));
  Parse.Cloud.beforeDelete(name, masterOnlyDelete(name));
});

/** Receipt uploads: signed-in users, images/PDF, max 10 MB. Exports (master) may be JSON/CSV. */
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];
const EXPORT_TYPES = ['application/json', 'text/csv'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function checkFileUpload(request) {
  const file = request.file;
  const type = file && file._source && file._source.type ? String(file._source.type).toLowerCase() : '';
  const size = typeof request.fileSize === 'number' ? request.fileSize : 0;
  if (request.master) {
    if (UPLOAD_TYPES.indexOf(type) === -1 && EXPORT_TYPES.indexOf(type) === -1) {
      throw invalid('Unsupported file type: ' + (type || 'unknown'));
    }
    return;
  }
  if (!request.user) throw forbidden('Sign in to upload files.');
  if (UPLOAD_TYPES.indexOf(type) === -1) throw invalid('Receipts must be JPEG, PNG, HEIC, WebP or PDF.');
  if (size > MAX_UPLOAD_BYTES) throw invalid('Receipts must be 10 MB or smaller.');
}

if (typeof Parse.Cloud.beforeSaveFile === 'function') {
  Parse.Cloud.beforeSaveFile(checkFileUpload);
}

// ================================================================ functions

/**
 * registerDevice({ expoPushToken, platform }) → { uuid }
 * Upserts the caller's DeviceToken. If the token was registered by another
 * account (same phone, different user), that row is soft-deleted.
 */
async function registerDevice(request) {
  const user = requireUser(request);
  const params = request.params || {};
  const token = params.expoPushToken;
  const platform = params.platform;
  if (typeof token !== 'string' || !EXPO_TOKEN_PATTERN.test(token)) throw invalid('Invalid Expo push token.');
  if (platform !== 'ios' && platform !== 'android') throw invalid('platform must be ios or android.');

  const now = new Date();

  const others = new Parse.Query('DeviceToken');
  others.equalTo('expoPushToken', token);
  others.notEqualTo('owner', user);
  others.equalTo('deletedAt', null);
  const stale = await others.find(MASTER);
  stale.forEach(function (row) {
    row.set('deletedAt', now);
    row.set('clientUpdatedAt', now);
  });
  if (stale.length) await Parse.Object.saveAll(stale, MASTER);

  const mine = new Parse.Query('DeviceToken');
  mine.equalTo('owner', user);
  mine.equalTo('expoPushToken', token);
  let row = await mine.first(MASTER);
  if (!row) {
    row = new Parse.Object('DeviceToken');
    row.set('uuid', newUuid());
    row.set('owner', user);
    row.set('expoPushToken', token);
  }
  row.set('platform', platform);
  row.set('lastSeenAt', now);
  row.set('clientUpdatedAt', now);
  row.set('deletedAt', null);
  await row.save(null, MASTER);
  return { uuid: row.get('uuid') };
}

/** How long one deleteAccount call may work before asking the app to call again. */
const DELETE_BUDGET_MS = 8000;

/**
 * deleteAccount() → { done: boolean, deleted: number }
 * Deletes every row the caller owns, their uploaded files, sessions and finally
 * the user. Large accounts are deleted over several calls: while `done` is
 * false the app calls again (each call resumes where the last one stopped).
 */
async function deleteAccount(request) {
  const user = requireUser(request);
  const started = Date.now();
  let deleted = 0;
  const classes = USER_DATA_CLASSES.concat(SERVER_OWNED_CLASSES);

  for (let c = 0; c < classes.length; c += 1) {
    const className = classes[c];
    for (;;) {
      const query = new Parse.Query(className);
      query.equalTo('owner', user);
      query.limit(PAGE);
      const rows = await query.find(MASTER);
      if (!rows.length) break;
      if (className === 'Attachment') {
        await destroyFiles(rows);
      }
      await Parse.Object.destroyAll(rows, MASTER);
      deleted += rows.length;
      if (Date.now() - started > DELETE_BUDGET_MS) return { done: false, deleted: deleted };
    }
  }

  const sessions = new Parse.Query('_Session');
  sessions.equalTo('user', user);
  const userSessions = await sessions.find(MASTER);
  if (userSessions.length) await Parse.Object.destroyAll(userSessions, MASTER);

  await user.destroy(MASTER);
  return { done: true, deleted: deleted };
}

async function destroyFiles(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const file = rows[i].get('file');
    if (file && typeof file.destroy === 'function') {
      try {
        await file.destroy(MASTER);
      } catch (e) {
        // A missing file must not block account deletion; cleanupDeleted sweeps orphans.
      }
    }
  }
}

// ================================================================ sync

/**
 * Records are the plain-JSON rows exchanged with the app (see /shared/schemas):
 * dates are ISO strings, `owner` is implied by the session, Setting values are
 * JSON (stored JSON-encoded in `valueJson`).
 */

const MAX_PUSH = 200;
const MAX_PULL = 500;
const DEFAULT_PULL = 300;
/** syncPull only returns rows older than this, so a save still in flight can't be skipped. */
const PULL_SAFETY_MS = 3000;
const MAX_TEXT = 20000;
const BOOTSTRAP_TX_DAYS = 90;

/** Column spec for any owned class (user data or server-owned). */
function columnsOf(className) {
  if (USER_DATA_FIELDS[className]) return Object.assign({}, COMMON_FIELDS, USER_DATA_FIELDS[className]);
  return SERVER_OWNED_FIELDS[className];
}

function typeOf(spec) {
  return typeof spec === 'string' ? spec : spec.type;
}

/** Parse object → record. */
function toRecord(className, object) {
  const columns = columnsOf(className);
  const record = {};
  Object.keys(columns).forEach(function (name) {
    if (name === 'owner') return;
    const value = object.get(name);
    const type = typeOf(columns[name]);
    if (value === undefined || value === null) {
      record[name] = null;
    } else if (type === 'Date') {
      record[name] = value instanceof Date ? value.toISOString() : null;
    } else if (type === 'File') {
      record[name] = { name: value.name(), url: value.url() };
    } else {
      record[name] = value;
    }
  });
  if (className === 'Setting') {
    let parsed = null;
    try {
      parsed = record.valueJson === null ? null : JSON.parse(record.valueJson);
    } catch (e) {
      parsed = null;
    }
    record.value = parsed;
    delete record.valueJson;
  }
  return record;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Copy a record's fields onto a Parse object, type-checking each against the
 * class's column spec. Unknown fields are ignored; owner/serverUpdatedAt are
 * server-controlled. Throws VALIDATION_ERROR naming the bad field.
 */
function applyRecord(className, object, record) {
  const columns = columnsOf(className);
  const input = Object.assign({}, record);
  if (className === 'Setting') {
    input.valueJson = input.value === undefined || input.value === null ? null : JSON.stringify(input.value);
  }
  Object.keys(columns).forEach(function (name) {
    if (name === 'owner' || name === 'serverUpdatedAt') return;
    const type = typeOf(columns[name]);
    let value = input[name];
    if (value === undefined || value === null) {
      object.set(name, null);
      return;
    }
    const bad = function () {
      return invalid(className + '.' + name + ' must be ' + type + '.');
    };
    switch (type) {
      case 'String':
        if (typeof value !== 'string' || value.length > MAX_TEXT) throw bad();
        break;
      case 'Number':
        if (typeof value !== 'number' || !isFinite(value)) throw bad();
        break;
      case 'Boolean':
        if (typeof value !== 'boolean') throw bad();
        break;
      case 'Date': {
        const date = typeof value === 'string' ? new Date(value) : null;
        if (!date || isNaN(date.getTime())) throw bad();
        value = date;
        break;
      }
      case 'Object':
        if (!isPlainObject(value)) throw bad();
        break;
      case 'Array':
        if (!Array.isArray(value)) throw bad();
        break;
      case 'File':
        // A reference to a file the app already uploaded (beforeSaveFile checked
        // type, size and that a user uploaded it). Only the name/url pair is
        // accepted; Parse stores the reference, never file bytes, here.
        if (
          !isPlainObject(value) ||
          typeof value.name !== 'string' ||
          !/^[\w.-]{1,200}$/.test(value.name) ||
          typeof value.url !== 'string' ||
          !/^https:\/\//.test(value.url)
        ) {
          throw invalid(className + '.' + name + ' must be an uploaded file reference.');
        }
        value = Parse.File.fromJSON({ __type: 'File', name: value.name, url: value.url });
        break;
      default:
        throw bad();
    }
    object.set(name, value);
  });
}

/** Basic shape every pushed record needs before anything else is checked. */
function checkRecordShape(className, record) {
  if (USER_DATA_CLASSES.indexOf(className) === -1) throw invalid('Unknown class: ' + className);
  if (!isPlainObject(record)) throw invalid(className + ' record must be an object.');
  if (!isUuid(record.uuid)) throw invalid(className + ' record needs a valid uuid.');
  const updated = new Date(record.clientUpdatedAt);
  if (typeof record.clientUpdatedAt !== 'string' || isNaN(updated.getTime())) {
    throw invalid(className + ' record needs clientUpdatedAt.');
  }
  return updated;
}

/** Fetch the caller's existing rows of one class for a set of uuids. */
async function existingByUuid(className, user, uuids) {
  const map = {};
  for (let i = 0; i < uuids.length; i += PAGE) {
    const query = new Parse.Query(className);
    query.equalTo('owner', user);
    query.containedIn('uuid', uuids.slice(i, i + PAGE));
    query.limit(PAGE);
    const rows = await query.find(MASTER);
    rows.forEach(function (row) {
      map[row.get('uuid')] = row;
    });
  }
  return map;
}

/**
 * syncPush({ changes: [{ className, record }], deviceId }) →
 *   { accepted: [{ className, uuid, serverUpdatedAt }],
 *     conflicts: [{ className, uuid, server }],   // server copy is newer: app adopts it
 *     rejected: [{ className, uuid, error }],      // invalid rows: app logs a sync issue
 *     serverTime }
 *
 * Upserts by (owner, uuid). Last write wins on clientUpdatedAt; an equal
 * timestamp is accepted so re-sending the same change is harmless.
 */
async function syncPush(request) {
  const user = requireUser(request);
  const params = request.params || {};
  const changes = params.changes;
  if (!Array.isArray(changes) || changes.length > MAX_PUSH) {
    throw invalid('changes must be an array of at most ' + MAX_PUSH + ' rows.');
  }

  const accepted = [];
  const conflicts = [];
  const rejected = [];

  // Validate shapes and keep only the newest change per (class, uuid).
  const latest = {};
  changes.forEach(function (change) {
    const className = change && change.className;
    const record = change && change.record;
    const uuid = record && record.uuid;
    try {
      const updated = checkRecordShape(className, record);
      const key = className + ':' + uuid;
      if (!latest[key] || latest[key].updated <= updated) latest[key] = { className: className, record: record, updated: updated };
    } catch (e) {
      rejected.push({ className: String(className), uuid: String(uuid), error: e.message });
    }
  });

  const byClass = {};
  Object.keys(latest).forEach(function (key) {
    const entry = latest[key];
    (byClass[entry.className] = byClass[entry.className] || []).push(entry);
  });

  const pending = [];
  const classNames = Object.keys(byClass);
  for (let c = 0; c < classNames.length; c += 1) {
    const className = classNames[c];
    const entries = byClass[className];
    const existing = await existingByUuid(
      className,
      user,
      entries.map(function (e) {
        return e.record.uuid;
      }),
    );
    entries.forEach(function (entry) {
      const uuid = entry.record.uuid;
      const current = existing[uuid];
      const serverUpdated = current ? current.get('clientUpdatedAt') : null;
      if (serverUpdated instanceof Date && serverUpdated.getTime() > entry.updated.getTime()) {
        conflicts.push({ className: className, uuid: uuid, server: toRecord(className, current) });
        return;
      }
      const object = current || new Parse.Object(className);
      if (!current) object.set('owner', user);
      try {
        applyRecord(className, object, entry.record);
        pending.push({ className: className, uuid: uuid, object: object });
      } catch (e) {
        rejected.push({ className: className, uuid: uuid, error: e.message });
      }
    });
  }

  if (pending.length) {
    try {
      await Parse.Object.saveAll(
        pending.map(function (p) {
          return p.object;
        }),
        MASTER,
      );
      pending.forEach(function (p) {
        p.saved = true;
      });
    } catch (batchError) {
      // Find the bad rows: save one by one so the rest still go through.
      for (let i = 0; i < pending.length; i += 1) {
        const p = pending[i];
        if (p.object.id && !p.object.dirty()) {
          p.saved = true;
          continue;
        }
        try {
          await p.object.save(null, MASTER);
          p.saved = true;
        } catch (e) {
          rejected.push({ className: p.className, uuid: p.uuid, error: e.message });
        }
      }
    }
  }

  pending.forEach(function (p) {
    if (!p.saved) return;
    const stamp = p.object.get('serverUpdatedAt');
    accepted.push({
      className: p.className,
      uuid: p.uuid,
      serverUpdatedAt: stamp instanceof Date ? stamp.toISOString() : null,
    });
  });

  return { accepted: accepted, conflicts: conflicts, rejected: rejected, serverTime: new Date().toISOString() };
}

/** Classes syncPull walks, in a fixed order (the cursor stores the index). */
const PULL_CLASSES = USER_DATA_CLASSES.concat(SERVER_OWNED_CLASSES);

function isCursor(value) {
  return (
    isPlainObject(value) &&
    typeof value.t === 'string' &&
    !isNaN(new Date(value.t).getTime()) &&
    typeof value.c === 'number' &&
    typeof value.id === 'string'
  );
}

/** Sort key for pulled rows: (serverUpdatedAt, class index, objectId). */
function compareKeys(a, b) {
  if (a.t !== b.t) return a.t < b.t ? -1 : 1;
  if (a.c !== b.c) return a.c - b.c;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * syncPull({ cursor, limit }) → { changes: [{ className, record }], cursor, hasMore, serverTime }
 *
 * Everything the caller owns (soft-deleted rows included) changed after
 * `cursor`, oldest first, across all classes in one call. The cursor is
 * { t: serverUpdatedAt ISO, c: class index, id: objectId } of the last row
 * returned, so rows sharing a timestamp are never skipped. Pass null to start
 * from the beginning. Keep calling while hasMore is true.
 */
async function syncPull(request) {
  const user = requireUser(request);
  const params = request.params || {};
  const after = params.cursor === undefined || params.cursor === null ? null : params.cursor;
  if (after !== null && !isCursor(after)) throw invalid('Invalid cursor.');
  let limit = params.limit === undefined ? DEFAULT_PULL : params.limit;
  if (!Number.isInteger(limit) || limit < 1) throw invalid('limit must be a positive whole number.');
  limit = Math.min(limit, MAX_PULL);

  const upper = new Date(Date.now() - PULL_SAFETY_MS);
  const rows = [];
  let classHitLimit = false;

  for (let c = 0; c < PULL_CLASSES.length; c += 1) {
    const className = PULL_CLASSES[c];
    const base = function () {
      const q = new Parse.Query(className);
      q.equalTo('owner', user);
      q.lessThanOrEqualTo('serverUpdatedAt', upper);
      return q;
    };
    let query;
    if (!after) {
      query = base();
    } else {
      const t = new Date(after.t);
      const later = base();
      later.greaterThan('serverUpdatedAt', t);
      if (c < after.c) {
        query = later;
      } else {
        const same = base();
        same.equalTo('serverUpdatedAt', t);
        if (c === after.c) same.greaterThan('objectId', after.id);
        query = Parse.Query.or(later, same);
      }
    }
    query.ascending('serverUpdatedAt');
    query.addAscending('objectId');
    query.limit(limit);
    const found = await query.find(MASTER);
    if (found.length === limit) classHitLimit = true;
    found.forEach(function (object) {
      rows.push({ key: { t: object.get('serverUpdatedAt').toISOString(), c: c, id: object.id }, className: className, object: object });
    });
  }

  rows.sort(function (a, b) {
    return compareKeys(a.key, b.key);
  });
  const page = rows.slice(0, limit);
  const last = page.length ? page[page.length - 1].key : after;

  return {
    changes: page.map(function (row) {
      return { className: row.className, record: toRecord(row.className, row.object) };
    }),
    cursor: last,
    hasMore: rows.length > limit || classHitLimit,
    serverTime: upper.toISOString(),
  };
}

async function findAllOwned(query) {
  const out = [];
  query.limit(PAGE);
  for (let skip = 0; skip < 10000; skip += PAGE) {
    query.skip(skip);
    const rows = await query.find(MASTER);
    out.push.apply(out, rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * bootstrap() → { changes, shared: { bankTemplates, categories, merchantDictionary }, serverTime }
 *
 * One call that makes a new device usable: all reference data, the last 90
 * days of transactions, all MonthlySummary rows, the shared templates and the merchant dictionary.
 * The app then runs syncPull from the start to fill in everything else.
 */
async function bootstrap(request) {
  const user = requireUser(request);
  const changes = [];
  const since = new Date(Date.now() - BOOTSTRAP_TX_DAYS * 24 * 60 * 60 * 1000);
  const classes = USER_DATA_CLASSES.concat(['MonthlySummary']);
  for (let i = 0; i < classes.length; i += 1) {
    const className = classes[i];
    const query = new Parse.Query(className);
    query.equalTo('owner', user);
    if (className === 'Transaction') query.greaterThanOrEqualTo('occurredAt', since);
    const rows = await findAllOwned(query);
    rows.forEach(function (row) {
      changes.push({ className: className, record: toRecord(className, row) });
    });
  }

  const shared = {};
  const sharedSpecs = { bankTemplates: 'BankTemplate', categories: 'DefaultCategorySet', merchantDictionary: 'MerchantDictionary' };
  const keys = Object.keys(sharedSpecs);
  for (let i = 0; i < keys.length; i += 1) {
    const className = sharedSpecs[keys[i]];
    const query = new Parse.Query(className);
    if (className === 'MerchantDictionary') query.descending('confidenceBps');
    query.limit(className === 'MerchantDictionary' ? 2000 : 1000);
    const rows = await query.find(MASTER);
    shared[keys[i]] = rows.map(function (row) {
      const out = {};
      Object.keys(SHARED_PUBLIC_FIELDS[className]).forEach(function (field) {
        const value = row.get(field);
        out[field] = value === undefined ? null : value;
      });
      return out;
    });
  }

  return { changes: changes, shared: shared, serverTime: new Date().toISOString() };
}

// ================================================================ merchants

/** Same rules as the app's normalizeMerchant (src/lib/parser/normalize.ts); a test keeps them equal. */
function normalizeMerchant(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * suggestCategory({ merchant }) → { suggestedCategoryKey, confidenceBps } | null
 * Shared MerchantDictionary lookup, used by the app when neither the user's
 * own corrections nor its cached copy of the dictionary know the merchant.
 */
async function suggestCategory(request) {
  requireUser(request);
  const merchant = request.params && request.params.merchant;
  if (typeof merchant !== 'string' || merchant.length > 120) throw invalid('merchant must be text.');
  const key = normalizeMerchant(merchant);
  if (!key) return null;
  const query = new Parse.Query('MerchantDictionary');
  query.equalTo('merchantNormalized', key);
  query.descending('confidenceBps');
  const row = await query.first(MASTER);
  return row ? { suggestedCategoryKey: row.get('suggestedCategoryKey'), confidenceBps: row.get('confidenceBps') || 0 } : null;
}

Parse.Cloud.define('suggestCategory', suggestCategory);
Parse.Cloud.define('registerDevice', registerDevice);
Parse.Cloud.define('deleteAccount', deleteAccount);
Parse.Cloud.define('syncPush', syncPush);
Parse.Cloud.define('syncPull', syncPull);
Parse.Cloud.define('bootstrap', bootstrap);

// ================================================================ jobs

/** Make one class match its definition: create it, or add missing fields/indexes and reset its CLP. */
async function ensureClass(def) {
  const schema = new Parse.Schema(def.className);
  let existing = null;
  try {
    existing = await schema.get();
  } catch (e) {
    if (e.code !== Parse.Error.INVALID_CLASS_NAME && !/does not exist|not found/i.test(String(e.message))) throw e;
  }

  const existingFields = existing ? existing.fields || {} : {};
  const existingIndexes = existing ? existing.indexes || {} : {};
  const added = [];
  const typeConflicts = [];

  Object.keys(def.fields).forEach(function (name) {
    const spec = def.fields[name];
    const type = typeof spec === 'string' ? spec : spec.type;
    if (existingFields[name]) {
      if (existingFields[name].type !== type) typeConflicts.push(name + ' is ' + existingFields[name].type + ', expected ' + type);
      return;
    }
    schema.addField(name, type, typeof spec === 'string' ? {} : { targetClass: spec.targetClass });
    added.push(name);
  });

  Object.keys(def.indexes).forEach(function (name) {
    if (!existingIndexes[name]) {
      schema.addIndex(name, def.indexes[name]);
      added.push('index ' + name);
    }
  });

  schema.setCLP(def.clp);
  if (existing) await schema.update();
  else await schema.save();

  return { className: def.className, created: !existing, added: added, typeConflicts: typeConflicts };
}

/**
 * _User: add the `name` column the Register screen fills in, hide the user list
 * from clients and stop clients adding columns. Users can still sign up, log
 * in, update and fetch themselves (their own ACL applies).
 */
async function lockUserClass() {
  const schema = new Parse.Schema('_User');
  const existing = await schema.get();
  const fields = existing.fields || {};
  if (!fields.name) schema.addString('name');
  const clp = Object.assign({}, existing.classLevelPermissions || {});
  clp.find = NOBODY;
  clp.count = NOBODY;
  clp.addField = NOBODY;
  if (!clp.get) clp.get = EVERYONE;
  if (!clp.create) clp.create = EVERYONE;
  if (!clp.update) clp.update = EVERYONE;
  if (!clp.delete) clp.delete = EVERYONE;
  schema.setCLP(clp);
  await schema.update();
}

Parse.Cloud.job('setupSchema', async function (request) {
  const defs = classDefinitions();
  const report = [];
  for (let i = 0; i < defs.length; i += 1) {
    const result = await ensureClass(defs[i]);
    report.push(result);
    request.message('(' + (i + 1) + '/' + defs.length + ') ' + defs[i].className + (result.created ? ' created' : ' updated'));
  }
  await lockUserClass();
  const conflicts = report.filter(function (r) {
    return r.typeConflicts.length;
  });
  const summary =
    'setupSchema done: ' +
    report.length +
    ' classes, ' +
    report.filter(function (r) {
      return r.created;
    }).length +
    ' created' +
    (conflicts.length
      ? '. TYPE CONFLICTS (fix in dashboard): ' +
        conflicts
          .map(function (r) {
            return r.className + ': ' + r.typeConflicts.join(', ');
          })
          .join('; ')
      : '');
  request.message(summary);
  return summary;
});

async function upsertByKey(className, rows, overwrite) {
  const query = new Parse.Query(className);
  query.containedIn(
    'key',
    rows.map(function (r) {
      return r.key;
    }),
  );
  query.limit(1000);
  const existing = await query.find(MASTER);
  const byKey = {};
  existing.forEach(function (o) {
    byKey[o.get('key')] = o;
  });

  const toSave = [];
  rows.forEach(function (row) {
    const current = byKey[row.key];
    if (current && !overwrite) return;
    const object = current || new Parse.Object(className);
    Object.keys(row).forEach(function (field) {
      object.set(field, row[field]);
    });
    toSave.push(object);
  });
  if (toSave.length) await Parse.Object.saveAll(toSave, MASTER);
  return toSave.length;
}

Parse.Cloud.job('seedShared', async function (request) {
  const overwrite = !!(request.params && request.params.overwrite);
  const banks = await upsertByKey('BankTemplate', BANK_TEMPLATES, overwrite);
  request.message('BankTemplate: ' + banks + ' saved');
  const categories = await upsertByKey('DefaultCategorySet', DEFAULT_CATEGORIES, overwrite);
  const summary =
    'seedShared done: ' + banks + ' bank templates, ' + categories + ' categories saved' + (overwrite ? ' (overwrite)' : '');
  request.message(summary);
  return summary;
});

/** Required fields for shared rows; rows missing any are junk (e.g. written before CLPs existed). */
const SHARED_REQUIRED = {
  BankTemplate: ['key', 'name', 'type', 'currency'],
  DefaultCategorySet: ['key', 'name', 'kind'],
};

/**
 * cleanupInvalidRows: delete rows that can never be valid under the rules above:
 * owner-scoped rows with no owner (nobody can read them) and shared rows missing
 * required fields. Run once after the first setupSchema if the app was used
 * before permissions were in place. Safe to re-run.
 */
Parse.Cloud.job('cleanupInvalidRows', async function (request) {
  let removed = 0;
  const ownerScoped = USER_DATA_CLASSES.concat(SERVER_OWNED_CLASSES);
  for (let i = 0; i < ownerScoped.length; i += 1) {
    const className = ownerScoped[i];
    for (;;) {
      const query = new Parse.Query(className);
      query.doesNotExist('owner');
      query.limit(PAGE);
      const rows = await query.find(MASTER);
      if (!rows.length) break;
      await Parse.Object.destroyAll(rows, MASTER);
      removed += rows.length;
    }
    request.message(className + ' checked, ' + removed + ' removed so far');
  }
  const sharedClasses = Object.keys(SHARED_REQUIRED);
  for (let i = 0; i < sharedClasses.length; i += 1) {
    const className = sharedClasses[i];
    const queries = SHARED_REQUIRED[className].map(function (field) {
      return new Parse.Query(className).doesNotExist(field);
    });
    const query = Parse.Query.or.apply(Parse.Query, queries);
    query.limit(1000);
    const rows = await query.find(MASTER);
    if (rows.length) await Parse.Object.destroyAll(rows, MASTER);
    removed += rows.length;
  }
  const summary = 'cleanupInvalidRows done: ' + removed + ' rows removed';
  request.message(summary);
  return summary;
});

// ================================================================ reminders (processRecurring)

/** Reminders use Philippine calendar days (UTC+8, no daylight saving). */
const MANILA_OFFSET_MS = 8 * 3600 * 1000;
const DAY_MS = 86400000;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_BATCH = 100;

/** The Manila calendar day of an instant, as a UTC-midnight Date. */
function manilaDay(value) {
  const t = new Date(value).getTime() + MANILA_OFFSET_MS;
  return new Date(Math.floor(t / DAY_MS) * DAY_MS);
}

function dayKeyOf(day) {
  return day.toISOString().slice(0, 10);
}

function addDaysUtc(day, n) {
  return new Date(day.getTime() + n * DAY_MS);
}

function daysInMonthUtc(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** `months` later on `dayOfMonth`; days 29–31 fall on the last day of short months. */
function addMonthsUtc(day, months, dayOfMonth) {
  const m = day.getUTCMonth() + months;
  const year = day.getUTCFullYear() + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  return new Date(Date.UTC(year, month, Math.min(dayOfMonth, daysInMonthUtc(year, month))));
}

/** The n-th occurrence of a rule (mirrors occurrence() in src/lib/schedules.ts). */
function ruleOccurrence(rule, n) {
  const first = manilaDay(rule.nextRunAt);
  const step = Math.max(1, rule.interval || 1) * n;
  switch (rule.frequency) {
    case 'daily':
      return addDaysUtc(first, step);
    case 'weekly':
      return addDaysUtc(first, 7 * step);
    case 'yearly':
      return addMonthsUtc(first, 12 * step, first.getUTCDate());
    default:
      return addMonthsUtc(first, step, rule.byMonthDay || first.getUTCDate());
  }
}

function ruleFallsOn(rule, day) {
  const end = rule.endAt ? manilaDay(rule.endAt) : null;
  for (let n = 0; n < 5000; n += 1) {
    const d = ruleOccurrence(rule, n);
    if ((end && d > end) || d > day) return false;
    if (d.getTime() === day.getTime()) return true;
  }
  return false;
}

/** Split a total over `parts` months exactly; the first months take the extra centavos. */
function splitMinor(total, parts) {
  const base = Math.floor(total / parts);
  const extra = total - base * parts;
  const out = [];
  for (let i = 0; i < parts; i += 1) out.push(base + (i < extra ? 1 : 0));
  return out;
}

function pesos(minor) {
  const abs = Math.abs(minor);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (minor < 0 ? '-' : '') + '₱' + whole + '.' + String(abs % 100).padStart(2, '0');
}

/**
 * Reminders due today (Manila) for one user's records (plain JSON). Mirrors
 * the app's local reminders: a rule `remindDaysBefore` days ahead,
 * installments and debts the day before. Keys are stable for de-duplication.
 */
function remindersFor(data, now) {
  const today = manilaDay(now);
  const tomorrow = addDaysUtc(today, 1);
  const out = [];
  data.rules.forEach(function (rule) {
    const before = rule.remindDaysBefore || 0;
    const due = addDaysUtc(today, before);
    if (!ruleFallsOn(rule, due)) return;
    const when = before === 0 ? 'today' : before === 1 ? 'tomorrow' : 'in ' + before + ' days';
    out.push({
      key: rule.uuid + ':' + dayKeyOf(due),
      title: rule.kind === 'income' ? 'Money coming in' : 'Bill reminder',
      body: rule.name + ' (' + pesos(rule.template.amountMinor) + ') ' + (rule.kind === 'income' ? 'expected ' : 'is due ') + when + '.',
    });
  });
  data.installments.forEach(function (inst) {
    const start = manilaDay(inst.startDate);
    const amounts = splitMinor(inst.totalMinor, inst.months);
    for (let i = 0; i < inst.months; i += 1) {
      if (addMonthsUtc(start, i, start.getUTCDate()).getTime() !== tomorrow.getTime()) continue;
      out.push({
        key: inst.uuid + ':' + dayKeyOf(tomorrow),
        title: 'Installment tomorrow',
        body: inst.name + ': ' + pesos(amounts[i]) + ' (' + (i + 1) + ' of ' + inst.months + ').',
      });
    }
  });
  data.debts.forEach(function (debt) {
    if (!debt.dueDate || debt.settledAt) return;
    if (manilaDay(debt.dueDate).getTime() !== tomorrow.getTime()) return;
    const paid = data.payments.reduce(function (sum, p) {
      return p.debtUuid === debt.uuid ? sum + p.amountMinor : sum;
    }, 0);
    const left = debt.principalMinor - paid;
    if (left <= 0) return;
    out.push({
      key: debt.uuid + ':' + dayKeyOf(tomorrow),
      title: 'Debt due',
      body:
        debt.direction === 'i_owe'
          ? 'You owe ' + debt.counterparty + ' ' + pesos(left) + ', due tomorrow.'
          : debt.counterparty + ' owes you ' + pesos(left) + ', due tomorrow.',
    });
  });
  return out;
}

/** Every live row of a class, as plain JSON (dates as ISO strings). */
async function findAll(className, configure) {
  const rows = [];
  for (let skip = 0; ; skip += PAGE) {
    const query = new Parse.Query(className);
    configure(query);
    query.equalTo('deletedAt', null);
    query.ascending('objectId');
    query.skip(skip);
    query.limit(PAGE);
    const page = await query.find(MASTER);
    rows.push.apply(rows, page);
    if (page.length < PAGE) return rows;
  }
}

function plain(objects) {
  return objects.map(function (o) {
    const json = o.toJSON();
    Object.keys(json).forEach(function (k) {
      if (json[k] && json[k].__type === 'Date') json[k] = json[k].iso;
    });
    return json;
  });
}

async function sendExpoPush(messages) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = 'Bearer ' + process.env.EXPO_ACCESS_TOKEN;
  const response = await Parse.Cloud.httpRequest({ method: 'POST', url: EXPO_PUSH_URL, headers: headers, body: messages });
  const tickets = response && response.data && response.data.data;
  return Array.isArray(tickets) ? tickets : [];
}

/**
 * processRecurring (daily job): push today's reminders to every user with a
 * registered phone. Sent reminders go in ReminderLog (private), so running the
 * job twice the same day sends nothing twice. Tokens Expo reports as
 * DeviceNotRegistered are soft-deleted. Pass {"now": "<ISO>"} to test a day.
 */
async function processRecurring(request) {
  const params = request.params || {};
  const now = params.now ? new Date(params.now) : new Date();
  const tokens = await findAll('DeviceToken', function () {});
  const tokensByOwner = {};
  tokens.forEach(function (row) {
    const ownerId = pointerId(row.get('owner'));
    if (ownerId) (tokensByOwner[ownerId] = tokensByOwner[ownerId] || []).push(row);
  });

  let sent = 0;
  const owners = Object.keys(tokensByOwner);
  for (let i = 0; i < owners.length; i += 1) {
    const owner = Parse.User.createWithoutData(owners[i]);
    const mine = function (query) {
      query.equalTo('owner', owner);
    };
    const data = {
      rules: plain(await findAll('RecurringRule', mine)),
      installments: plain(await findAll('Installment', mine)),
      debts: plain(await findAll('Debt', mine)),
      payments: plain(await findAll('DebtPayment', mine)),
    };
    const reminders = remindersFor(data, now).map(function (r) {
      return { key: owners[i] + ':' + r.key, title: r.title, body: r.body };
    });
    if (!reminders.length) continue;

    const logQuery = new Parse.Query('ReminderLog');
    logQuery.containedIn(
      'key',
      reminders.map(function (r) {
        return r.key;
      }),
    );
    logQuery.limit(1000);
    const done = {};
    (await logQuery.find(MASTER)).forEach(function (row) {
      done[row.get('key')] = true;
    });
    const fresh = reminders.filter(function (r) {
      return !done[r.key];
    });
    if (!fresh.length) continue;

    const outgoing = [];
    fresh.forEach(function (r) {
      tokensByOwner[owners[i]].forEach(function (row) {
        outgoing.push({ row: row, message: { to: row.get('expoPushToken'), title: r.title, body: r.body, sound: 'default', channelId: 'reminders' } });
      });
    });
    const dead = [];
    for (let b = 0; b < outgoing.length; b += PUSH_BATCH) {
      const batch = outgoing.slice(b, b + PUSH_BATCH);
      const tickets = await sendExpoPush(
        batch.map(function (o) {
          return o.message;
        }),
      );
      tickets.forEach(function (ticket, index) {
        if (ticket && ticket.status === 'ok') sent += 1;
        const row = batch[index] && batch[index].row;
        if (row && ticket && ticket.details && ticket.details.error === 'DeviceNotRegistered' && dead.indexOf(row) < 0) dead.push(row);
      });
    }
    dead.forEach(function (row) {
      row.set('deletedAt', now);
      row.set('clientUpdatedAt', now);
    });
    if (dead.length) await Parse.Object.saveAll(dead, MASTER);
    await Parse.Object.saveAll(
      fresh.map(function (r) {
        const row = new Parse.Object('ReminderLog');
        row.set('key', r.key);
        row.set('sentAt', now);
        return row;
      }),
      MASTER,
    );
  }
  const summary = 'processRecurring done: ' + owners.length + ' users with push, ' + sent + ' notifications sent';
  if (request.message) request.message(summary);
  return summary;
}

Parse.Cloud.job('processRecurring', processRecurring);

// ================================================================ test hooks
// Ignored by Back4App; lets the Jest tests inspect the definitions above.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    USER_DATA_CLASSES: USER_DATA_CLASSES,
    USER_DATA_FIELDS: USER_DATA_FIELDS,
    SERVER_OWNED_CLASSES: SERVER_OWNED_CLASSES,
    SHARED_PUBLIC_CLASSES: SHARED_PUBLIC_CLASSES,
    PRIVATE_CLASSES: PRIVATE_CLASSES,
    MONEY_FIELDS: MONEY_FIELDS,
    BANK_TEMPLATES: BANK_TEMPLATES,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    classDefinitions: classDefinitions,
    checkMoneyFields: checkMoneyFields,
    checkFileUpload: checkFileUpload,
    normalizeMerchant: normalizeMerchant,
    toRecord: toRecord,
    applyRecord: applyRecord,
    checkRecordShape: checkRecordShape,
    compareKeys: compareKeys,
    isCursor: isCursor,
    PULL_CLASSES: PULL_CLASSES,
    manilaDay: manilaDay,
    remindersFor: remindersFor,
    processRecurring: processRecurring,
  };
}
