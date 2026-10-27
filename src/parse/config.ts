/**
 * Public Parse settings bundled into the app. Only the Application ID and the
 * JavaScript Key belong here — never the master key or REST/third-party keys.
 *
 * EXPO_PUBLIC_* variables are inlined at build time, so they must be read with
 * literal `process.env.EXPO_PUBLIC_…` member access.
 */
export interface ParseConfig {
  appId: string;
  jsKey: string;
  serverURL: string;
}

const DEFAULT_SERVER_URL = 'https://parseapi.back4app.com';

export function readParseConfig(): ParseConfig | null {
  const appId = process.env.EXPO_PUBLIC_PARSE_APP_ID ?? '';
  const jsKey = process.env.EXPO_PUBLIC_PARSE_JS_KEY ?? '';
  const serverURL = process.env.EXPO_PUBLIC_PARSE_SERVER_URL || DEFAULT_SERVER_URL;
  if (!appId || !jsKey) return null;
  return { appId, jsKey, serverURL };
}
