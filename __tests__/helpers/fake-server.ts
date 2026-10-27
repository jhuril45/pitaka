/**
 * In-memory stand-in for the syncPush / syncPull / bootstrap Cloud functions,
 * following the same rules as cloud/main.js: upsert by (owner, uuid),
 * last write wins on clientUpdatedAt (ties accepted), cursor
 * (serverUpdatedAt, class index, id) so rows sharing a timestamp are never
 * skipped. Every row in one push shares one serverUpdatedAt, which makes ties
 * common on purpose.
 */
import { USER_DATA_CLASSES } from '@shared/index';

type Row = Record<string, unknown> & { uuid: string; clientUpdatedAt: string };
interface Stored {
  className: string;
  record: Row;
  t: string;
}
interface Cursor {
  t: string;
  c: number;
  id: string;
}

const PULL_CLASSES = [...USER_DATA_CLASSES, 'MonthlySummary', 'Insight'];

function compare(a: Cursor, b: Cursor): number {
  if (a.t !== b.t) return a.t < b.t ? -1 : 1;
  if (a.c !== b.c) return a.c - b.c;
  return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
}

export function createFakeServer() {
  const users = new Map<string, Map<string, Stored>>();
  let clock = Date.parse('2026-01-01T00:00:00.000Z');
  const rejectUuids = new Set<string>();
  let pushCalls = 0;
  let pullCalls = 0;

  const rowsOf = (userId: string) => {
    if (!users.get(userId)) users.set(userId, new Map());
    return users.get(userId)!;
  };
  const tick = () => new Date((clock += 1000)).toISOString();
  const keyOf = (s: Stored): Cursor => ({ t: s.t, c: PULL_CLASSES.indexOf(s.className), id: s.record.uuid });

  return {
    rejectUuids,
    get pushCalls() {
      return pushCalls;
    },
    get pullCalls() {
      return pullCalls;
    },
    rows(userId: string): Stored[] {
      return [...rowsOf(userId).values()];
    },
    /** Insert a row as if another device had pushed it (server-side seeding). */
    seed(userId: string, className: string, record: Row): void {
      const t = tick();
      rowsOf(userId).set(`${className}:${record.uuid}`, { className, record: { ...record, serverUpdatedAt: t }, t });
    },

    push(userId: string, changes: { className: string; record: Row }[]) {
      pushCalls += 1;
      const t = tick();
      const rows = rowsOf(userId);
      const accepted: { className: string; uuid: string; serverUpdatedAt: string }[] = [];
      const conflicts: { className: string; uuid: string; server: Row }[] = [];
      const rejected: { className: string; uuid: string; error: string }[] = [];
      for (const { className, record } of changes) {
        if (rejectUuids.has(record.uuid)) {
          rejected.push({ className, uuid: record.uuid, error: 'invalid' });
          continue;
        }
        const key = `${className}:${record.uuid}`;
        const current = rows.get(key);
        if (current && Date.parse(current.record.clientUpdatedAt) > Date.parse(record.clientUpdatedAt)) {
          conflicts.push({ className, uuid: record.uuid, server: current.record });
          continue;
        }
        rows.set(key, { className, record: { ...record, serverUpdatedAt: t }, t });
        accepted.push({ className, uuid: record.uuid, serverUpdatedAt: t });
      }
      return { accepted, conflicts, rejected, serverTime: t };
    },

    pull(userId: string, cursor: Cursor | null, limit: number) {
      pullCalls += 1;
      const all = [...rowsOf(userId).values()]
        .filter((s) => !cursor || compare(keyOf(s), cursor) > 0)
        .sort((a, b) => compare(keyOf(a), keyOf(b)));
      const page = all.slice(0, limit);
      return {
        changes: page.map((s) => ({ className: s.className, record: s.record })),
        cursor: page.length ? keyOf(page[page.length - 1]!) : cursor,
        hasMore: all.length > limit,
        serverTime: new Date(clock).toISOString(),
      };
    },

    bootstrap(userId: string) {
      const since = clock - 90 * 24 * 60 * 60 * 1000;
      const changes = [...rowsOf(userId).values()]
        .filter((s) => s.className !== 'Transaction' || Date.parse(String(s.record.occurredAt)) >= since)
        .map((s) => ({ className: s.className, record: s.record }));
      return { changes, shared: { bankTemplates: [], categories: [] }, serverTime: new Date(clock).toISOString() };
    },
  };
}

export type FakeServer = ReturnType<typeof createFakeServer>;
