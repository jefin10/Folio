import { formatMoney, type DueItem, type RecurringRule } from '@folio/core';
import type { ComposerPreset } from './store';

const plain = (p: bigint | null | undefined) => (p == null ? undefined : formatMoney(p, { symbol: '', decimals: 'auto' }).replace(/,/g, ''));

/** Pre-fill the composer to confirm a recurring obligation was actually paid. */
export function presetForDue(item: DueItem, rule: RecurringRule | undefined): Partial<ComposerPreset> {
  const recurring = { ruleId: item.ruleId, dueOn: item.dueOn };
  const amount = plain(item.amount);
  const base = { recurring, amount, description: item.name };
  switch (item.kind) {
    case 'emi':
      return { ...base, kind: 'loan_payment', accountId: rule?.sourceAccountId ?? undefined, toAccountId: rule?.targetAccountId ?? undefined };
    case 'card_autopay':
      return { ...base, kind: 'card_payment', accountId: rule?.sourceAccountId ?? undefined, toAccountId: rule?.targetAccountId ?? undefined };
    case 'income':
      return { ...base, kind: 'income', accountId: rule?.targetAccountId ?? rule?.sourceAccountId ?? undefined, categoryId: rule?.categoryId ?? undefined };
    case 'transfer':
    case 'sip':
      return { ...base, kind: 'transfer', accountId: rule?.sourceAccountId ?? undefined, toAccountId: rule?.targetAccountId ?? undefined };
    default:
      return { ...base, kind: 'expense', accountId: rule?.sourceAccountId ?? undefined, categoryId: rule?.categoryId ?? undefined };
  }
}
