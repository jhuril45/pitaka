import { randomUUID } from 'expo-crypto';

import { Parse } from './init';

const PIN = 'diagnostics';

export interface DatastoreCheckResult {
  ok: boolean;
  pinMs: number;
  queryMs: number;
  error?: string;
}

/**
 * Pin an unsaved object, read it back by uuid from its named pin, then unpin.
 * Exercises the kv-store adapter and the crypto shim (unsaved objects get a
 * `local<uuid>` id) without touching the network.
 */
export async function checkLocalDatastore(): Promise<DatastoreCheckResult> {
  const id = randomUUID();
  try {
    const probe = new Parse.Object('DiagnosticProbe');
    probe.set('uuid', id);
    probe.set('createdOnDevice', new Date());

    const t0 = Date.now();
    await probe.pinWithName(PIN);
    const t1 = Date.now();

    const query = new Parse.Query('DiagnosticProbe');
    query.fromPinWithName(PIN);
    query.equalTo('uuid', id);
    const found = await query.first();
    const t2 = Date.now();

    await Parse.Object.unPinAllObjectsWithName(PIN);
    return { ok: found?.get('uuid') === id, pinMs: t1 - t0, queryMs: t2 - t1 };
  } catch (error) {
    return { ok: false, pinMs: 0, queryMs: 0, error: error instanceof Error ? error.message : String(error) };
  }
}
