import type { Account } from '@folio/core';

/** Debit cards linked to a bank account, oldest first. */
export function debitCardsOf(bankId: string, accounts: Account[]): Account[] {
  return accounts.filter((a) => a.type === 'debit_card' && a.status === 'active' && a.linkedAccountId === bankId).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * A bank account and its debit card are one thing in Folio: the debit card is
 * the face (its photo, its last 4, chip), the bank account is what's behind it
 * (balance, ledger). Returns the account to render on the card face.
 */
export function bankFace(bank: Account, accounts: Account[]): Account {
  const debit = debitCardsOf(bank.id, accounts)[0];
  if (!debit) return bank;
  return {
    ...bank,
    type: 'debit_card',
    last4: debit.last4 ?? bank.last4,
    theme: debit.theme ?? bank.theme,
    artworkPath: debit.artworkPath ?? bank.artworkPath,
    institutionName: bank.institutionName ?? debit.institutionName,
    institutionId: bank.institutionId ?? debit.institutionId,
  };
}

/** Accounts to offer when paying: each bank once (shown as its debit card), never its debit cards separately. */
export function payableAccounts(accounts: Account[]): Account[] {
  const banksWithCards = new Set(accounts.filter((a) => a.type === 'debit_card' && a.linkedAccountId).map((a) => a.linkedAccountId!));
  return accounts.filter((a) => !(a.type === 'debit_card' && a.linkedAccountId && accounts.some((b) => b.id === a.linkedAccountId && b.status === 'active'))).map((a) => (banksWithCards.has(a.id) ? bankFace(a, accounts) : a));
}
