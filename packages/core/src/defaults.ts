import type { CategoryKind } from './types';

/**
 * Starter categories created for a new profile (by the database trigger
 * `folio.seed_profile`). These are categories, not financial accounts —
 * Folio never pre-creates banks, cards or loans. Users can rename, recolour,
 * archive or extend them.
 */
export interface DefaultCategory {
  kind: CategoryKind;
  name: string;
  icon: string;
  color: string;
  systemKey?: string;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { kind: 'expense', name: 'Food & dining', icon: 'food', color: '#ff9f68' },
  { kind: 'expense', name: 'Groceries', icon: 'basket', color: '#7bd88f' },
  { kind: 'expense', name: 'Household', icon: 'home', color: '#9ec1ff' },
  { kind: 'expense', name: 'Transport', icon: 'car', color: '#6aa8ff' },
  { kind: 'expense', name: 'Fuel', icon: 'fuel', color: '#ffb86b' },
  { kind: 'expense', name: 'Shopping', icon: 'bag', color: '#ff7ab6' },
  { kind: 'expense', name: 'Bills & utilities', icon: 'bolt', color: '#f5d76e' },
  { kind: 'expense', name: 'Rent', icon: 'key', color: '#c3a6ff' },
  { kind: 'expense', name: 'Subscriptions', icon: 'repeat', color: '#8be9fd' },
  { kind: 'expense', name: 'Health', icon: 'heart', color: '#ff6b6b' },
  { kind: 'expense', name: 'Education', icon: 'cap', color: '#a1e3d8' },
  { kind: 'expense', name: 'Entertainment', icon: 'film', color: '#bd93f9' },
  { kind: 'expense', name: 'Travel', icon: 'plane', color: '#50e3c2' },
  { kind: 'expense', name: 'Gifts & donations', icon: 'gift', color: '#ffa3c4' },
  { kind: 'expense', name: 'Insurance', icon: 'shield', color: '#94a3b8' },
  { kind: 'expense', name: 'Personal care', icon: 'sparkle', color: '#fbcfe8' },
  { kind: 'expense', name: 'Interest paid', icon: 'percent', color: '#f87171', systemKey: 'interest_paid' },
  { kind: 'expense', name: 'Bank charges & fees', icon: 'receipt', color: '#a3a3a3', systemKey: 'bank_charges' },
  { kind: 'expense', name: 'Other expenses', icon: 'dots', color: '#737373', systemKey: 'other_expense' },
  { kind: 'income', name: 'Salary', icon: 'briefcase', color: '#3ddc97', systemKey: 'salary' },
  { kind: 'income', name: 'Internship stipend', icon: 'cap', color: '#7cf2c4' },
  { kind: 'income', name: 'Freelance', icon: 'laptop', color: '#2dd4bf' },
  { kind: 'income', name: 'Business', icon: 'store', color: '#5eead4' },
  { kind: 'income', name: 'Interest earned', icon: 'percent', color: '#86efac', systemKey: 'interest_earned' },
  { kind: 'income', name: 'Gifts received', icon: 'gift', color: '#bbf7d0' },
  { kind: 'income', name: 'Other income', icon: 'dots', color: '#a7f3d0', systemKey: 'other_income' },
];
