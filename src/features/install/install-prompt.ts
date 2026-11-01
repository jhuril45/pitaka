/** The phone apps are already installed: nothing to offer. (The web version is install-prompt.web.ts.) */

export type InstallMode = 'installed' | 'prompt' | 'ios' | 'none';

export function useInstallMode(): InstallMode {
  return 'installed';
}

export async function promptInstall(): Promise<boolean> {
  return false;
}
