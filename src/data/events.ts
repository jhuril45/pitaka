/**
 * Tiny in-app event bus: repositories emit after local data changes, and hooks
 * re-run their Local Datastore queries when a class they read has changed.
 */
type Listener = (classNames: ReadonlySet<string>) => void;

const listeners = new Set<Listener>();

export function emitChange(...classNames: string[]): void {
  if (!classNames.length) return;
  const changed = new Set(classNames);
  for (const listener of listeners) listener(changed);
}

export function onChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
