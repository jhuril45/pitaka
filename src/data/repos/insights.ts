import type { InsightRecord, MonthlySummaryRecord } from '@shared/index';

import { markInsightRead } from '@/parse/cloud';

import { emitChange } from '../events';
import { listPin, putLocal } from '../local-store';
import { insightsPin, summaryPin } from '../pins';
import { useLocalQuery } from '../use-local-query';

/** Server-written rows (read-only here): weekly insights and monthly summaries. */

export async function listUnreadInsights(profileUuid: string): Promise<InsightRecord[]> {
  const rows = await listPin<InsightRecord & Record<string, unknown>>('Insight', insightsPin(profileUuid));
  return rows.filter((r) => !r.readAt).sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));
}

export function useUnreadInsights(profileUuid: string) {
  return useLocalQuery(() => listUnreadInsights(profileUuid), ['Insight'], [profileUuid]);
}

/** Hide an insight now; tell the server so other devices hide it too (best effort, online). */
export async function dismissInsight(insight: InsightRecord): Promise<void> {
  const record = { ...insight, readAt: new Date().toISOString() };
  await putLocal('Insight', record, insight);
  emitChange('Insight');
  try {
    await markInsightRead(insight.uuid);
  } catch {
    // Offline: it stays hidden here; other devices still show it.
  }
}

export async function listSummaries(profileUuid: string): Promise<MonthlySummaryRecord[]> {
  return listPin<MonthlySummaryRecord & Record<string, unknown>>('MonthlySummary', summaryPin(profileUuid));
}

export function useSummaries(profileUuid: string) {
  return useLocalQuery(() => listSummaries(profileUuid), ['MonthlySummary'], [profileUuid]);
}
