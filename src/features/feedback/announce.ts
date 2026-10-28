import type { TransactionRecord } from '@shared/index';

import { getRecord } from '@/data/repo';
import { listCategories } from '@/data/repos/categories';
import { listBudgets } from '@/data/repos/plans';
import { listTransactions } from '@/data/repos/transactions';
import { saveFeedback } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';

import { useToastStore } from './toast';

/** Show instant, on-device feedback for a newly saved transaction (best effort). */
export async function announceSaved(tx: TransactionRecord): Promise<void> {
  haptics.success();
  try {
    const [budgets, transactions, categories, profile] = await Promise.all([
      listBudgets(tx.profileUuid),
      listTransactions(tx.profileUuid),
      listCategories(tx.profileUuid),
      getRecord('Profile', tx.profileUuid),
    ]);
    const message = saveFeedback(tx, { budgets, transactions, categories, currency: profile?.baseCurrency ?? 'PHP' });
    if (message) useToastStore.getState().show(message);
  } catch {
    // Feedback is a nicety; never get in the way of saving.
  }
}
