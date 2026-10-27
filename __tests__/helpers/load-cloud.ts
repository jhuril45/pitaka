/**
 * Loads cloud/main.js the way Back4App does — with a global `Parse` — but with
 * Parse.Cloud replaced by a recorder so tests can call the registered triggers,
 * functions and jobs directly.
 */
import type ParseNode from 'parse/node';

type Handler = (request: Record<string, unknown>) => unknown;

export interface CloudRegistry {
  functions: Record<string, Handler>;
  jobs: Record<string, Handler>;
  beforeSave: Record<string, Handler>;
  beforeDelete: Record<string, Handler>;
  beforeSaveFile?: Handler;
  internals: Record<string, any>;
  Parse: typeof ParseNode;
}

export function loadCloud(): CloudRegistry {
  const registry = {
    functions: {},
    jobs: {},
    beforeSave: {},
    beforeDelete: {},
  } as unknown as CloudRegistry;

  jest.isolateModules(() => {
    const Parse = require('parse/node') as typeof ParseNode;
    Parse.initialize('test-app', 'test-js-key');
    (Parse as any).Cloud = {
      define: (name: string, fn: Handler) => (registry.functions[name] = fn),
      job: (name: string, fn: Handler) => (registry.jobs[name] = fn),
      beforeSave: (name: string, fn: Handler) => (registry.beforeSave[name] = fn),
      beforeDelete: (name: string, fn: Handler) => (registry.beforeDelete[name] = fn),
      beforeSaveFile: (fn: Handler) => (registry.beforeSaveFile = fn),
    };
    (globalThis as any).Parse = Parse;
    registry.Parse = Parse;
    registry.internals = require('../../cloud/main.js');
  });

  return registry;
}
