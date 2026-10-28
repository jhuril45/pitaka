/**
 * 10,000-transaction benchmark of the on-device data layer (npm run bench).
 *
 * Runs the real repositories and Local Datastore code against an in-memory
 * key-value store (the phone uses SQLite, so absolute numbers on a device are
 * higher; the relative costs and the scoping are what this checks).
 */
import { addDays, startOfMonth, subMonths } from 'date-fns';

import { computeBalances } from '@/lib/balances';
import { budgetStatus } from '@/lib/budgets';
import { forecastCashflow } from '@/lib/forecast';
import { categoryBreakdown, lastMonths, monthlyTotals } from '@/lib/statistics';

import { createDevice } from '../helpers/device';
import { createFakeServer } from '../helpers/fake-server';

const COUNT = 10_000;
const USER = 'benchUser0001';

async function time<T>(label: string, results: Record<string, string>, fn: () => Promise<T> | T): Promise<T> {
  const start = performance.now();
  const value = await fn();
  results[label] = `${(performance.now() - start).toFixed(1)} ms`;
  return value;
}

it(`handles ${COUNT.toLocaleString()} transactions`, async () => {
  const phone = createDevice(createFakeServer(), USER);
  const results: Record<string, string> = {};
  const profileUuid = await phone.profiles.ensureDefaultProfile(USER);
  const [cash] = await phone.accounts.listAccounts(profileUuid);
  const categories = await phone.categories.listCategories(profileUuid);
  const expenseCats = categories.filter((c) => c.kind === 'expense');
  const now = new Date();
  const oldest = startOfMonth(subMonths(now, 11));
  const days = Math.max(1, Math.floor((now.getTime() - oldest.getTime()) / 86_400_000));

  // Seed directly into the Local Datastore (as a sync pull would), in pull-sized batches.
  const rows = Array.from({ length: COUNT }, (_, i) => ({
    uuid: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    profileUuid,
    type: i % 25 === 0 ? 'income' : 'expense',
    amountMinor: 1000 + ((i * 7919) % 500000),
    accountUuid: cash!.uuid,
    toAccountUuid: null,
    categoryUuid: expenseCats[i % expenseCats.length]!.uuid,
    occurredAt: addDays(oldest, i % days).toISOString(),
    note: '',
    merchant: `Merchant ${i % 300}`,
    source: 'manual',
    recurringRuleUuid: null,
    installmentUuid: null,
    clientUpdatedAt: now.toISOString(),
    deletedAt: null,
    serverUpdatedAt: now.toISOString(),
  }));
  await time('store 10k (pull batches of 300)', results, async () => {
    for (let i = 0; i < rows.length; i += 300) {
      await phone.store.putManyLocal(rows.slice(i, i + 300).map((record) => ({ className: 'Transaction' as const, record, previous: null })));
    }
  });

  const month = await time('list this month', results, () => phone.transactions.listTransactions(profileUuid, { months: lastMonths(now, 1) }));
  const all = await time('list 12 months', results, () => phone.transactions.listTransactions(profileUuid));
  await time('search 12 months ("merchant 42")', results, () => phone.transactions.listTransactions(profileUuid, { search: 'merchant 42' }));
  const accounts = await phone.accounts.listAccounts(profileUuid);
  await time('balances', results, () => computeBalances(accounts, all));
  await time('5 budgets', results, () =>
    expenseCats.slice(0, 5).map((c) =>
      budgetStatus({ categoryUuid: c.uuid, period: 'monthly', amountMinor: 500000, rollover: true, startDate: oldest.toISOString(), customDays: null }, all, categories),
    ),
  );
  await time('statistics: month breakdown', results, () => categoryBreakdown(month, categories, startOfMonth(now), addDays(now, 1)));
  await time('statistics: 12-month totals', results, () => monthlyTotals(lastMonths(now, 12), all, [], new Set(lastMonths(now, 12))));
  await time('forecast 90 days', results, () =>
    forecastCashflow({
      accounts,
      balances: computeBalances(accounts, all),
      transactions: all,
      rules: [],
      installments: [],
      debts: [],
      payments: [],
      baseCurrency: 'PHP',
      days: 90,
    }),
  );
  await time('save one transaction (validate, pin, outbox)', results, () =>
    phone.transactions.saveTransaction({ ...rows[0]!, uuid: undefined, amountMinor: 999 } as never),
  );

  // eslint-disable-next-line no-console
  console.log(`Pitaka benchmark (${COUNT} transactions, ${month.length} this month):\n${Object.entries(results).map(([k, v]) => `  ${k.padEnd(46)} ${v}`).join('\n')}`);
  expect(all.length).toBe(COUNT);
});
