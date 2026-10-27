import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

const KEY = 'pitaka.hide-amounts';

interface PrivacyState {
  /** Mask money on overview screens (Home's eye toggle). */
  hideAmounts: boolean;
  toggleHideAmounts: () => void;
}

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  hideAmounts: Storage.getItemSync(KEY) === '1',
  toggleHideAmounts: () => {
    const next = !get().hideAmounts;
    Storage.setItemSync(KEY, next ? '1' : '0');
    set({ hideAmounts: next });
  },
}));
