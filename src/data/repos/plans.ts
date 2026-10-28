import type { BudgetRecord, GoalContributionRecord, GoalRecord } from '@shared/index';

import { listLive } from '../local-store';
import { profilePin } from '../pins';
import { deleteRecord, saveRecord, type Draft } from '../repo';
import { useLocalQuery } from '../use-local-query';

/** Budgets and savings goals (with their contributions) of a profile. */

export async function listBudgets(profileUuid: string): Promise<BudgetRecord[]> {
  return listLive<BudgetRecord>('Budget', [profilePin(profileUuid)]);
}

export function useBudgets(profileUuid: string) {
  return useLocalQuery(() => listBudgets(profileUuid), ['Budget'], [profileUuid]);
}

export const saveBudget = (draft: Draft<'Budget'>) => saveRecord('Budget', draft);
export const removeBudget = (uuid: string) => deleteRecord('Budget', uuid);

export async function listGoals(profileUuid: string): Promise<GoalRecord[]> {
  const goals = await listLive<GoalRecord>('Goal', [profilePin(profileUuid)]);
  return goals.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listContributions(profileUuid: string): Promise<GoalContributionRecord[]> {
  const rows = await listLive<GoalContributionRecord>('GoalContribution', [profilePin(profileUuid)]);
  return rows.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
}

export function useGoals(profileUuid: string) {
  return useLocalQuery(
    async () => ({ goals: await listGoals(profileUuid), contributions: await listContributions(profileUuid) }),
    ['Goal', 'GoalContribution'],
    [profileUuid],
  );
}

export const saveGoal = (draft: Draft<'Goal'>) => saveRecord('Goal', draft);
export const saveContribution = (draft: Draft<'GoalContribution'>) => saveRecord('GoalContribution', draft);
export const removeContribution = (uuid: string) => deleteRecord('GoalContribution', uuid);

/** Deleting a goal also deletes its contributions. */
export async function removeGoal(uuid: string, contributions: GoalContributionRecord[]): Promise<void> {
  for (const c of contributions.filter((c) => c.goalUuid === uuid)) await deleteRecord('GoalContribution', c.uuid);
  await deleteRecord('Goal', uuid);
}
