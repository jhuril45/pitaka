import { useEffect, useEffectEvent, useState } from 'react';

import { onChange } from './events';

/**
 * Run an async Local Datastore query and re-run it whenever one of `classes`
 * changes locally (a save here or a sync pull). Changes to `deps` re-run it too.
 */
export function useLocalQuery<T>(query: () => Promise<T>, classes: readonly string[], deps: readonly unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  // Always calls the latest `query` without making it an effect dependency.
  const runQuery = useEffectEvent(() => query());
  const classKey = classes.join(',');

  useEffect(() => {
    let active = true;
    let version = 0;
    const run = () => {
      const mine = ++version;
      runQuery()
        .then((result) => {
          if (active && mine === version) {
            setData(result);
            setError(null);
          }
        })
        .catch((e: unknown) => {
          if (active && mine === version) setError(e instanceof Error ? e : new Error(String(e)));
        });
    };
    run();
    const watched = new Set(classKey.split(','));
    const unsubscribe = onChange((changed) => {
      for (const name of changed) {
        if (watched.has(name)) return run();
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classKey, ...deps]);

  return { data, error, loading: data === undefined && !error };
}
