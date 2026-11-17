/**
 * Financial position — answers the questions Folio exists for:
 * what do I have, what do I owe, who owes me, what is coming up, and what
 * will be left afterwards.
 */
import { groupOf } from './accounts';
import type { PersonBalance } from './balances';
import { max, ZERO, type Paise } from './money';
import type { DueItem } from './recurring';
import type { Account, AccountBalance } from './types';

export interface FinancialPosition {
  /** Liquid money: bank + cash + wallets (active, not excluded). */
  liquid: Paise;
  /** Bank accounts only (savings/current/salary). */
  bankBalance: Paise;
  cash: Paise;
  wallets: Paise;
  deposits: Paise;
  otherAssets: Paise;
  totalAssets: Paise;

  creditOutstanding: Paise;
  creditLimit: Paise;
  availableCredit: Paise;
  loanOutstanding: Paise;
  otherLiabilities: Paise;
  totalLiabilities: Paise;

  /** People who owe me (sum of positive person balances). */
  receivables: Paise;
  /** People I owe (sum of negative person balances, as a positive figure). */
  payables: Paise;

  /** Assets + receivables − liabilities − payables. Credit limits are never assets. */
  netWorth: Paise;

  /** Obligations due within the horizon that will be paid from liquid money. */
  upcomingObligations: Paise;
  /** Liquid money minus upcoming obligations (can be negative). */
  afterObligations: Paise;

  byAccount: Map<string, Paise>;
}

export interface PositionInput {
  accounts: Account[];
  balances: Map<string, AccountBalance>;
  personBalances: Map<string, PersonBalance> | PersonBalance[];
  upcoming?: DueItem[];
  /** Only obligations due within this many days count towards afterObligations. */
  horizonDays?: number;
}

export function computePosition(input: PositionInput): FinancialPosition {
  const p: FinancialPosition = {
    liquid: ZERO,
    bankBalance: ZERO,
    cash: ZERO,
    wallets: ZERO,
    deposits: ZERO,
    otherAssets: ZERO,
    totalAssets: ZERO,
    creditOutstanding: ZERO,
    creditLimit: ZERO,
    availableCredit: ZERO,
    loanOutstanding: ZERO,
    otherLiabilities: ZERO,
    totalLiabilities: ZERO,
    receivables: ZERO,
    payables: ZERO,
    netWorth: ZERO,
    upcomingObligations: ZERO,
    afterObligations: ZERO,
    byAccount: new Map(),
  };

  for (const a of input.accounts) {
    if (a.status === 'closed') continue;
    const bal = input.balances.get(a.id)?.balance ?? ZERO;
    p.byAccount.set(a.id, bal);
    if (a.type === 'debit_card') continue; // no balance of its own
    const counts = a.includeInNetWorth;
    const g = groupOf(a);
    if (a.class === 'asset') {
      if (!counts) continue;
      p.totalAssets += bal;
      if (g === 'bank') p.bankBalance += bal;
      else if (g === 'cash') p.cash += bal;
      else if (g === 'wallet') p.wallets += bal;
      else if (g === 'deposit') p.deposits += bal;
      else p.otherAssets += bal;
      if (a.isLiquid) p.liquid += bal;
    } else {
      if (g === 'credit') {
        if (a.card?.creditLimit && a.status === 'active') {
          p.creditLimit += a.card.creditLimit;
          p.availableCredit += max(ZERO, a.card.creditLimit - bal);
        }
        if (counts) p.creditOutstanding += bal;
      } else if (g === 'loan') {
        if (counts) p.loanOutstanding += bal;
      } else if (counts) {
        p.otherLiabilities += bal;
      }
      if (counts) p.totalLiabilities += bal;
    }
  }

  const people = Array.isArray(input.personBalances) ? input.personBalances : [...input.personBalances.values()];
  for (const pb of people) {
    if (pb.outstanding > 0n) p.receivables += pb.outstanding;
    else if (pb.outstanding < 0n) p.payables += -pb.outstanding;
  }

  p.netWorth = p.totalAssets + p.receivables - p.totalLiabilities - p.payables;

  const horizon = input.horizonDays ?? 30;
  const accountById = new Map(input.accounts.map((a) => [a.id, a]));
  for (const item of input.upcoming ?? []) {
    if (item.state === 'paid' || item.state === 'skipped') continue;
    if (item.daysAway > horizon || item.kind === 'income') continue;
    if (!item.amount) continue;
    // Only obligations paid from liquid money reduce what's left. A subscription
    // charged to a credit card is already part of card outstanding later.
    const src = item.sourceAccountId ? accountById.get(item.sourceAccountId) : undefined;
    if (src && src.class === 'liability') continue;
    p.upcomingObligations += item.amount;
  }
  p.afterObligations = p.liquid - p.upcomingObligations;
  return p;
}
