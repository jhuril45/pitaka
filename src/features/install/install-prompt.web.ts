import { create } from 'zustand';

/**
 * "Add to home screen" for the web app.
 *
 * Chrome, Edge and Samsung Internet fire `beforeinstallprompt`; we keep the
 * event so a button can open the browser's install dialog later. Safari on
 * iPhone/iPad has no such event: people add it from the Share menu, so we
 * show those steps instead. Nothing is shown once the app runs installed.
 */

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'installed' | 'prompt' | 'ios' | 'none';

interface InstallState {
  event: InstallEvent | null;
  installed: boolean;
}

const useInstallStore = create<InstallState>(() => ({ event: null, installed: false }));

function runningInstalled(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Other iOS browsers can add to the home screen too (iOS 16.4+), through their own Share menu.
  return ios;
}

// Registered when this module loads (imported from the root layout), since the event fires early.
if (typeof window !== 'undefined') {
  useInstallStore.setState({ installed: runningInstalled() });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // We show our own button instead of the browser's mini bar.
    useInstallStore.setState({ event: e as InstallEvent });
  });
  window.addEventListener('appinstalled', () => useInstallStore.setState({ event: null, installed: true }));
}

export function useInstallMode(): InstallMode {
  const { event, installed } = useInstallStore();
  if (installed) return 'installed';
  if (event) return 'prompt';
  if (isIos()) return 'ios';
  return 'none';
}

/** Open the browser's install dialog. Returns true if the user installed. */
export async function promptInstall(): Promise<boolean> {
  const event = useInstallStore.getState().event;
  if (!event) return false;
  await event.prompt();
  const { outcome } = await event.userChoice;
  // The event can only be used once.
  useInstallStore.setState({ event: null, installed: outcome === 'accepted' });
  return outcome === 'accepted';
}
