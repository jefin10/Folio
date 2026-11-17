import { formatMoney, type DueItem, type RecurringRule } from '@folio/core';

/** Route params for /add that pre-fill confirming a recurring obligation. */
export function presetForDue(item: DueItem, rule: RecurringRule | undefined): Record<string, string> {
  const p: Record<string, string> = { ruleId: item.ruleId, dueOn: item.dueOn, description: item.name };
  if (item.amount) p.amount = formatMoney(item.amount, { symbol: '', decimals: 'auto' }).replace(/,/g, '');
  const src = rule?.sourceAccountId ?? undefined;
  const dst = rule?.targetAccountId ?? undefined;
  switch (item.kind) {
    case 'emi':
      return { ...p, kind: 'loan_payment', ...(src ? { accountId: src } : {}), ...(dst ? { toAccountId: dst } : {}) };
    case 'card_autopay':
      return { ...p, kind: 'card_payment', ...(src ? { accountId: src } : {}), ...(dst ? { toAccountId: dst } : {}) };
    case 'income':
      return { ...p, kind: 'income', ...(dst ?? src ? { accountId: (dst ?? src)! } : {}), ...(rule?.categoryId ? { categoryId: rule.categoryId } : {}) };
    case 'transfer':
    case 'sip':
      return { ...p, kind: 'transfer', ...(src ? { accountId: src } : {}), ...(dst ? { toAccountId: dst } : {}) };
    default:
      return { ...p, kind: 'expense', ...(src ? { accountId: src } : {}), ...(rule?.categoryId ? { categoryId: rule.categoryId } : {}) };
  }
}
