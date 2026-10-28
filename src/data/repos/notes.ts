import type { NoteRecord } from '@shared/index';

import { listLive } from '../local-store';
import { profilePin } from '../pins';
import { deleteRecord, saveRecord, type Draft } from '../repo';
import { useLocalQuery } from '../use-local-query';

/** Quick notes: open ones first (soonest due first), then done ones (newest first). */
export async function listNotes(profileUuid: string): Promise<NoteRecord[]> {
  const notes = await listLive<NoteRecord & Record<string, unknown>>('Note', [profilePin(profileUuid)]);
  return notes.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.done && (a.dueAt || b.dueAt)) return !a.dueAt ? 1 : !b.dueAt ? -1 : a.dueAt.localeCompare(b.dueAt);
    return b.clientUpdatedAt.localeCompare(a.clientUpdatedAt);
  });
}

export function useNotes(profileUuid: string) {
  return useLocalQuery(() => listNotes(profileUuid), ['Note'], [profileUuid]);
}

export const saveNote = (draft: Draft<'Note'>) => saveRecord('Note', draft);
export const removeNote = (uuid: string) => deleteRecord('Note', uuid);
export const toggleNote = (note: NoteRecord) => saveRecord('Note', { ...note, done: !note.done });
