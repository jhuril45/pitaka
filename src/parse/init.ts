import Parse from 'parse/react-native';

import { readParseConfig } from './config';
import { parseAsyncStorage } from './storage';

let initialized = false;

/**
 * Configure the Parse SDK once at startup: SQLite-backed storage, app keys and
 * the Local Datastore. Safe to call more than once.
 *
 * Works fully offline — nothing here talks to the server.
 */
export function initParse(): typeof Parse {
  if (initialized) return Parse;

  const config = readParseConfig();
  if (!config) {
    throw new Error(
      'Missing EXPO_PUBLIC_PARSE_APP_ID / EXPO_PUBLIC_PARSE_JS_KEY. Copy .env.example to .env.local and fill them in.',
    );
  }

  // Storage must be set before initialize(): the SDK reads the current user and
  // installation id from it.
  Parse.setAsyncStorage(parseAsyncStorage);
  Parse.initialize(config.appId, config.jsKey);
  Parse.serverURL = config.serverURL;

  // `false` turns off the EventuallyQueue health poll (GET /health every 2 s while
  // offline). Our own Outbox handles queued writes, so that poll is wasted traffic.
  Parse.enableLocalDatastore(false);

  initialized = true;
  return Parse;
}

export { Parse };
