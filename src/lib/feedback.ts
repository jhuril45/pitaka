import type { BudgetRecord, CategoryRecord, TransactionRecord } from '@shared/index';

import { budgetStatus, coveredCategories } from './budgets';
import { formatMoney } from './money';

/**
 * One line of instant feedback after saving an expense, computed locally:
 *   1. the tightest budget it counts toward ("That's 72% of your Dining budget with 12 days left")
 *   2. otherwise, the biggest expense this month
 *   3. otherwise, nothing
 */
export function saveFeedback(
  tx: Pick<TransactionRecord, 'uuid' | 'type' | 'amountMinor' | 'categoryUuid' | 'occurredAt'>,
  data: {
    budgets: BudgetRecord[];
    transactions: TransactionRecord[];
    categories: CategoryRecord[];
    currency: string;
    now?: Date;
  },
): string | null {
  if (tx.type !== 'expense') return null;
  const now = data.now ?? new Date();
  const name = (uuid: string | null) => (uuid ? (data.categories.find((c) => c.uuid === uuid)?.name ?? 'category') : 'overall');

  const statuses = data.budgets
    .filter((b) => {
      const covered = coveredCategories(b.categoryUuid, data.categories);
      return !covered || (!!tx.categoryUuid && covered.has(tx.categoryUuid));
    })
    .map((budget) => ({ budget, status: budgetStatus(budget, data.transactions, data.categories, now) }))
    .filter(({ status }) => new Date(tx.occurredAt) >= status.period.start && new Date(tx.occurredAt) < status.period.end)
    .sort((a, b) => b.status.usedBps - a.status.usedBps);
  const tightest = statuses[0];
  if (tightest) {
    const { budget, status } = tightest;
    const label = budget.categoryUuid ? `your ${name(budget.categoryUuid)} budget` : 'your overall budget';
    const days = status.daysLeft === 1 ? '1 day' : `${status.daysLeft} days`;
    if (status.state === 'over') {
      return `You're ${formatMoney(-status.remainingMinor, data.currency)} over ${label}.`;
    }
    return `That's ${Math.floor(status.usedBps / 100)}% of ${label}, with ${days} left.`;
  }

  const month = new Date(tx.occurredAt);
  const sameMonth = data.transactions.filter((t) => {
    if (t.deletedAt || t.type !== 'expense' || t.uuid === tx.uuid) return false;
    const at = new Date(t.occurredAt);
    return at.getFullYear() === month.getFullYear() && at.getMonth() === month.getMonth();
  });
  if (sameMonth.length >= 5 && sameMonth.every((t) => t.amountMinor < tx.amountMinor)) {
    return 'Your biggest expense this month.';
  }
  return null;
}
