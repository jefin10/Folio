'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ComposerKind = 'expense' | 'income' | 'transfer' | 'card_payment' | 'reimbursement' | 'loan_payment' | 'more';

export interface ComposerPreset {
  kind: ComposerKind;
  accountId?: string;
  toAccountId?: string;
  personId?: string;
  categoryId?: string;
  amount?: string;
  description?: string;
  recurring?: { ruleId: string; dueOn: string };
  /** Correct an existing entry instead of creating one. */
  editEntryId?: string;
}

interface UiState {
  hideBalances: boolean;
  toggleBalances: () => void;
  composer: ComposerPreset | null;
  openComposer: (preset?: Partial<ComposerPreset>) => void;
  closeComposer: () => void;
  entryId: string | null;
  openEntry: (id: string | null) => void;
  accountEditor: { id?: string; type?: string } | null;
  openAccountEditor: (v: { id?: string; type?: string } | null) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      hideBalances: false,
      toggleBalances: () => set((s) => ({ hideBalances: !s.hideBalances })),
      composer: null,
      openComposer: (preset) => set({ composer: { kind: 'expense', ...preset } }),
      closeComposer: () => set({ composer: null }),
      entryId: null,
      openEntry: (id) => set({ entryId: id }),
      accountEditor: null,
      openAccountEditor: (v) => set({ accountEditor: v }),
    }),
    { name: 'folio-ui', partialize: (s) => ({ hideBalances: s.hideBalances }) },
  ),
);
