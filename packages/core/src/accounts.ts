import type { Account, AccountClass, AccountGroup, AccountType, CardTheme } from './types';

export interface AccountTypeMeta {
  type: AccountType;
  label: string;
  short: string;
  class: AccountClass;
  group: AccountGroup;
  liquid: boolean;
  /** Icon key understood by both icon sets (web + mobile). */
  icon: string;
  description: string;
}

export const ACCOUNT_TYPE_META: Record<AccountType, AccountTypeMeta> = {
  savings: { type: 'savings', label: 'Savings account', short: 'Savings', class: 'asset', group: 'bank', liquid: true, icon: 'bank', description: 'Everyday bank account' },
  current: { type: 'current', label: 'Current account', short: 'Current', class: 'asset', group: 'bank', liquid: true, icon: 'briefcase', description: 'Business or high-volume account' },
  salary: { type: 'salary', label: 'Salary account', short: 'Salary', class: 'asset', group: 'bank', liquid: true, icon: 'bank', description: 'Where your pay lands' },
  fixed_deposit: { type: 'fixed_deposit', label: 'Fixed deposit', short: 'FD', class: 'asset', group: 'deposit', liquid: false, icon: 'lock', description: 'Locked-in deposit' },
  recurring_deposit: { type: 'recurring_deposit', label: 'Recurring deposit', short: 'RD', class: 'asset', group: 'deposit', liquid: false, icon: 'repeat', description: 'Monthly deposit plan' },
  stocks: { type: 'stocks', label: 'Stocks', short: 'Stocks', class: 'asset', group: 'other', liquid: false, icon: 'chart', description: 'Shares, ETFs and equities' },
  mutual_funds: { type: 'mutual_funds', label: 'Mutual funds', short: 'Funds', class: 'asset', group: 'other', liquid: false, icon: 'pie', description: 'SIP or lump-sum funds' },
  cash: { type: 'cash', label: 'Cash', short: 'Cash', class: 'asset', group: 'cash', liquid: true, icon: 'cash', description: 'Money in your pocket' },
  wallet: { type: 'wallet', label: 'Digital wallet', short: 'Wallet', class: 'asset', group: 'wallet', liquid: true, icon: 'wallet', description: 'Prepaid / UPI wallet' },
  credit_card: { type: 'credit_card', label: 'Credit card', short: 'Credit', class: 'liability', group: 'credit', liquid: false, icon: 'card', description: 'Revolving credit line' },
  debit_card: { type: 'debit_card', label: 'Debit card', short: 'Debit', class: 'asset', group: 'debit', liquid: false, icon: 'card', description: 'Spends from a linked bank account' },
  secured_credit_card: { type: 'secured_credit_card', label: 'Secured credit card', short: 'Secured', class: 'liability', group: 'credit', liquid: false, icon: 'shield', description: 'Card backed by a deposit' },
  bnpl: { type: 'bnpl', label: 'Pay later', short: 'BNPL', class: 'liability', group: 'credit', liquid: false, icon: 'clock', description: 'Buy now, pay later line' },
  personal_loan: { type: 'personal_loan', label: 'Personal loan', short: 'Loan', class: 'liability', group: 'loan', liquid: false, icon: 'loan', description: 'Unsecured loan' },
  education_loan: { type: 'education_loan', label: 'Education loan', short: 'Edu loan', class: 'liability', group: 'loan', liquid: false, icon: 'cap', description: 'Student loan' },
  vehicle_loan: { type: 'vehicle_loan', label: 'Vehicle loan', short: 'Vehicle', class: 'liability', group: 'loan', liquid: false, icon: 'car', description: 'Two-wheeler or car loan' },
  home_loan: { type: 'home_loan', label: 'Home loan', short: 'Home', class: 'liability', group: 'loan', liquid: false, icon: 'home', description: 'Mortgage' },
  other_loan: { type: 'other_loan', label: 'Other loan', short: 'Loan', class: 'liability', group: 'loan', liquid: false, icon: 'loan', description: 'Any other borrowing' },
  other_liability: { type: 'other_liability', label: 'Other liability', short: 'Liability', class: 'liability', group: 'other', liquid: false, icon: 'minus', description: 'Something you owe' },
  other_asset: { type: 'other_asset', label: 'Other asset', short: 'Asset', class: 'asset', group: 'other', liquid: false, icon: 'gem', description: 'Gold, investments, deposits held elsewhere' },
  custom: { type: 'custom', label: 'Custom', short: 'Custom', class: 'asset', group: 'other', liquid: false, icon: 'sparkle', description: 'Define your own' },
};

export function accountMeta(type: AccountType): AccountTypeMeta {
  return ACCOUNT_TYPE_META[type];
}

export function classOf(type: AccountType, override?: AccountClass | null): AccountClass {
  if (type === 'custom' && override) return override;
  return ACCOUNT_TYPE_META[type].class;
}

export function groupOf(account: Pick<Account, 'type'>): AccountGroup {
  return ACCOUNT_TYPE_META[account.type].group;
}

export const isCreditLike = (a: Pick<Account, 'type'>) => groupOf(a) === 'credit';
export const isLoan = (a: Pick<Account, 'type'>) => groupOf(a) === 'loan';
export const isBankLike = (a: Pick<Account, 'type'>) => groupOf(a) === 'bank';
export const isCash = (a: Pick<Account, 'type'>) => groupOf(a) === 'cash';
export const isLiability = (a: Pick<Account, 'class'>) => a.class === 'liability';

/** Accounts that can directly fund a purchase. */
export function canPayFrom(a: Account): boolean {
  if (a.status !== 'active') return false;
  const g = groupOf(a);
  return g === 'bank' || g === 'cash' || g === 'wallet' || g === 'credit' || g === 'debit' || a.type === 'other_asset' || a.type === 'custom';
}

/** Accounts that can receive money (income, transfers in). */
export function canReceiveInto(a: Account): boolean {
  if (a.status !== 'active') return false;
  return a.type !== 'debit_card';
}

export function displayName(a: Pick<Account, 'name' | 'nickname'>): string {
  return a.nickname?.trim() || a.name;
}

export function maskedNumber(last4: string | null, style: 'dots' | 'x' = 'dots'): string {
  if (!last4) return '';
  return style === 'dots' ? `•••• ${last4}` : `XXXX XXXX XXXX ${last4}`;
}

export function sortAccounts<T extends Pick<Account, 'sortOrder' | 'name'>>(accounts: T[]): T[] {
  return [...accounts].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * Curated original artwork presets. Colours are Folio's own; the user can
 * also supply arbitrary gradients or upload artwork.
 */
export const CARD_THEME_PRESETS: Record<string, CardTheme & { label: string }> = {
  obsidian: { label: 'Obsidian', preset: 'obsidian', colors: ['#1a1a1a', '#0b0b0b', '#2b2b2b'], ink: 'light', pattern: 'lines' },
  mint: { label: 'Mint', preset: 'mint', colors: ['#0f3d33', '#0a2621', '#1d6b57'], ink: 'light', pattern: 'waves' },
  aurum: { label: 'Aurum', preset: 'aurum', colors: ['#3a2c12', '#17120a', '#8a6a2e'], ink: 'light', pattern: 'lines' },
  ivory: { label: 'Ivory', preset: 'ivory', colors: ['#f2efe7', '#d9d4c7', '#ffffff'], ink: 'dark', pattern: 'dots' },
  ember: { label: 'Ember', preset: 'ember', colors: ['#3d1410', '#1a0807', '#7a2a1d'], ink: 'light', pattern: 'waves' },
  cobalt: { label: 'Cobalt', preset: 'cobalt', colors: ['#10204a', '#070d20', '#2a4aa0'], ink: 'light', pattern: 'grid' },
  orchid: { label: 'Orchid', preset: 'orchid', colors: ['#2e1238', '#120716', '#6a2d80'], ink: 'light', pattern: 'rings' },
  slate: { label: 'Slate', preset: 'slate', colors: ['#2a3036', '#14181b', '#47515a'], ink: 'light', pattern: 'grid' },
  rose: { label: 'Rose', preset: 'rose', colors: ['#f3d5d0', '#e2b3ab', '#fbeae6'], ink: 'dark', pattern: 'rings' },
  titanium: { label: 'Titanium', preset: 'titanium', colors: ['#5d6166', '#2c2f33', '#8f949a'], ink: 'light', pattern: 'lines' },
  forest: { label: 'Forest', preset: 'forest', colors: ['#16301c', '#0a170d', '#2f5d38'], ink: 'light', pattern: 'dots' },
  sand: { label: 'Sand', preset: 'sand', colors: ['#d9c3a0', '#b89d73', '#efe1c8'], ink: 'dark', pattern: 'waves' },
};

export const ACCENT_SWATCHES = ['#3ddc97', '#7cf2c4', '#f5c26b', '#ff7a59', '#6aa8ff', '#c38bff', '#ff6b9a', '#e8e8e8', '#9aa4ad', '#2dd4bf'];

export function themeFor(account: Pick<Account, 'theme' | 'type' | 'color'>): CardTheme {
  if (account.theme && account.theme.colors.length > 0) return account.theme;
  const fallback = ACCOUNT_TYPE_META[account.type].group === 'credit' ? CARD_THEME_PRESETS.obsidian! : CARD_THEME_PRESETS.mint!;
  return fallback;
}
