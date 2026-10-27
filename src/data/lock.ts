/**
 * Serialises Local Datastore writes. Parse pins are read-modify-write JSON
 * arrays with no locking, so two concurrent pins of the same name can lose
 * entries; every write to local data goes through this queue.
 */
let tail: Promise<unknown> = Promise.resolve();

export function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}
