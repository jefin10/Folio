import { create } from 'zustand';
import { secureGet, secureSet } from './secure-kv';

interface UiState {
  hideBalances: boolean;
  setHideBalances: (v: boolean) => void;
  locked: boolean;
  setLocked: (v: boolean) => void;
  biometricEnabled: boolean;
  setBiometricEnabled: (v: boolean) => void;
  hydrate: () => Promise<void>;
}

export const useUi = create<UiState>((set) => ({
  hideBalances: false,
  setHideBalances: (v) => {
    set({ hideBalances: v });
    void secureSet('folio.ui.hide', v ? '1' : '0');
  },
  locked: true,
  setLocked: (v) => set({ locked: v }),
  biometricEnabled: true,
  setBiometricEnabled: (v) => {
    set({ biometricEnabled: v });
    void secureSet('folio.ui.bio', v ? '1' : '0');
  },
  hydrate: async () => {
    const [hide, bio] = await Promise.all([secureGet('folio.ui.hide'), secureGet('folio.ui.bio')]);
    set({ hideBalances: hide === '1', biometricEnabled: bio !== '0' });
  },
}));
