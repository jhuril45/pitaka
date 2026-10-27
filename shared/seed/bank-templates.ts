import type { BankTemplateRecord } from '../schemas/server';

/**
 * Philippine banks and e-wallets offered when adding an account.
 *
 * Bundled so first launch works offline. The live list is the shared
 * `BankTemplate` class (seeded by the `seedShared` job in cloud/main.js and
 * editable from the Back4App dashboard). A test keeps the two copies identical.
 */
export const BANK_TEMPLATES: BankTemplateRecord[] = [
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
