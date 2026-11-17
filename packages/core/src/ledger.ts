/**
 * The Folio ledger engine.
 *
 * The UI never writes balances. It describes *what happened* as an intent
 * (an expense, a transfer, a reimbursement…). `buildEntry` turns that intent
 * into a balanced double-entry journal entry. Balances, spending, income,
 * receivables and net worth are all derived from postings, so:
 *
 *  - a transfer between own accounts moves money without touching any
 *    income/expense category,
 *  - a card repayment reduces bank balance and card liability, and creates
 *    no expense,
 *  - a reimbursable purchase splits its cost into a personal expense and a
 *    receivable from the person — never both,
 *  - a reimbursement received clears the receivable and is never income.
 *
 * The same invariants are enforced again in Postgres (`folio.validate_entry`).
 */
import { classOf, groupOf } from './accounts';
import type { ISODate } from './dates';
import { isISODate } from './dates';
import { abs, allocate, sum, ZERO, type Paise } from './money';
import type { Account, AccountClass, Category, Entry, EntrySource, EntryType, Posting } from './types';

export class LedgerError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'invalid_entry',
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

// ---------------------------------------------------------------------------
// Context: the minimal knowledge the engine needs about accounts/categories.
// ---------------------------------------------------------------------------

export interface LedgerContext {
  accounts: Map<string, Pick<Account, 'id' | 'type' | 'class' | 'status' | 'linkedAccountId' | 'name'>>;
  categories: Map<string, Pick<Category, 'id' | 'kind' | 'systemKey' | 'name'>>;
  people?: Set<string>;
}

export function makeContext(accounts: Account[], categories: Category[], peopleIds: string[] = []): LedgerContext {
  return {
    accounts: new Map(accounts.map((a) => [a.id, a])),
    categories: new Map(categories.map((c) => [c.id, c])),
    people: new Set(peopleIds),
  };
}

function requireAccount(ctx: LedgerContext, id: string | null | undefined, role: string) {
  if (!id) throw new LedgerError(`Choose ${role}`, 'missing_account');
  const a = ctx.accounts.get(id);
  if (!a) throw new LedgerError(`Unknown account for ${role}`, 'unknown_account');
  if (a.status === 'closed') throw new LedgerError(`${a.name} is closed`, 'closed_account');
  return a;
}

/** Debit cards carry no balance — money moves on the linked bank account. */
function resolveFundingAccount(ctx: LedgerContext, id: string | null | undefined, role: string): { accountId: string; instrumentId: string | null } {
  const a = requireAccount(ctx, id, role);
  if (a.type === 'debit_card') {
    if (!a.linkedAccountId) throw new LedgerError(`${a.name} is not linked to a bank account`, 'unlinked_debit_card');
    requireAccount(ctx, a.linkedAccountId, role);
    return { accountId: a.linkedAccountId, instrumentId: a.id };
  }
  return { accountId: a.id, instrumentId: null };
}

function requireCategory(ctx: LedgerContext, id: string | null | undefined, kind: 'expense' | 'income') {
  if (!id) throw new LedgerError(`Choose a${kind === 'income' ? 'n income' : 'n expense'} category`, 'missing_category');
  const c = ctx.categories.get(id);
  if (!c) throw new LedgerError('Unknown category', 'unknown_category');
  if (c.kind !== kind) throw new LedgerError(`${c.name} is not an ${kind} category`, 'category_kind');
  return c;
}

function findSystemCategory(ctx: LedgerContext, key: string, kind: 'expense' | 'income'): string | null {
  for (const c of ctx.categories.values()) if (c.systemKey === key && c.kind === kind) return c.id;
  return null;
}

function requirePositive(amount: Paise, label = 'Amount') {
  if (amount <= 0n) throw new LedgerError(`${label} must be greater than zero`, 'non_positive');
}

const acct = (accountId: string, amount: Paise, memo?: string): Posting => ({ target: 'account', accountId, amount, memo: memo ?? null });
const cat = (categoryId: string, amount: Paise, memo?: string): Posting => ({ target: 'category', categoryId, amount, memo: memo ?? null });
const person = (personId: string, amount: Paise, memo?: string): Posting => ({ target: 'person', personId, amount, memo: memo ?? null });
const equity = (amount: Paise, memo?: string): Posting => ({ target: 'equity', amount, memo: memo ?? null });

// ---------------------------------------------------------------------------
// Intents
// ---------------------------------------------------------------------------

interface BaseIntent {
  occurredOn: ISODate;
  description?: string;
  notes?: string | null;
  counterparty?: string | null;
  tags?: string[];
  idempotencyKey: string;
  source?: EntrySource;
  currency?: string;
}

export interface SplitShare {
  personId: string;
  amount: Paise;
}

export interface ExpenseIntent extends BaseIntent {
  kind: 'expense';
  /** Bank, cash, wallet, credit card or debit card used to pay. */
  accountId?: string | null;
  /** Someone else paid for this on my behalf (I now owe them). */
  paidByPersonId?: string | null;
  amount: Paise;
  categoryId: string;
  /** Portions that other people owe me. Remaining amount is my own expense. */
  shares?: SplitShare[];
}

export interface IncomeIntent extends BaseIntent {
  kind: 'income';
  accountId: string;
  amount: Paise;
  categoryId: string;
}

export interface TransferIntent extends BaseIntent {
  kind: 'transfer';
  fromAccountId: string;
  toAccountId: string;
  amount: Paise;
  /** Optional transfer fee paid on top by the sender (e.g. IMPS charges). */
  fee?: Paise;
  feeCategoryId?: string | null;
}

export interface LoanRepaymentIntent extends BaseIntent {
  kind: 'loan_repayment';
  fromAccountId: string;
  loanAccountId: string;
  /** Total paid (EMI). */
  amount: Paise;
  /** Part of `amount` that is interest (expense). The rest reduces principal. */
  interest: Paise;
  interestCategoryId?: string | null;
}

export interface LoanDisbursementIntent extends BaseIntent {
  kind: 'loan_disbursement';
  loanAccountId: string;
  /** Account that receives the money. Null when paid directly to a dealer/college. */
  toAccountId?: string | null;
  /** When the loan paid a seller directly, the category of the purchase. */
  purchaseCategoryId?: string | null;
  amount: Paise;
  /** Processing fee deducted from the disbursal. */
  processingFee?: Paise;
}

export interface RefundIntent extends BaseIntent {
  kind: 'refund';
  accountId: string;
  amount: Paise;
  categoryId: string;
  /** Original purchase; used to send the refund back proportionally to people who owed a share. */
  relatedEntry?: Pick<Entry, 'id' | 'amount' | 'postings'> | null;
}

export interface ReimbursementReceivedIntent extends BaseIntent {
  kind: 'reimbursement_received';
  accountId: string;
  personId: string;
  amount: Paise;
}

export interface ReimbursementPaidIntent extends BaseIntent {
  kind: 'reimbursement_paid';
  accountId: string;
  personId: string;
  amount: Paise;
}

export interface InterestIntent extends BaseIntent {
  kind: 'interest';
  accountId: string;
  amount: Paise;
  /** earned: account grows, income. charged: card/loan/bank charges interest, expense. */
  direction: 'earned' | 'charged';
  categoryId?: string | null;
}

export interface ChargeIntent extends BaseIntent {
  kind: 'bank_charges';
  accountId: string;
  amount: Paise;
  categoryId?: string | null;
}

export interface DepositIntent extends BaseIntent {
  kind: 'bank_deposit';
  accountId: string;
  amount: Paise;
  /** Where the money came from: one of my accounts (cash) or, if external, an income category. */
  fromAccountId?: string | null;
  categoryId?: string | null;
}

export interface WithdrawalIntent extends BaseIntent {
  kind: 'bank_withdrawal';
  accountId: string;
  amount: Paise;
  toAccountId?: string | null;
  categoryId?: string | null;
}

export interface AdjustmentIntent extends BaseIntent {
  kind: 'adjustment';
  accountId: string;
  /** The balance the account should show after the adjustment (natural sign). */
  targetBalance: Paise;
  /** Current natural balance as computed by the ledger. */
  currentBalance: Paise;
}

export interface OpeningBalanceIntent extends BaseIntent {
  kind: 'opening_balance';
  accountId: string;
  /** Natural balance: money held for assets, amount owed for liabilities. */
  balance: Paise;
}

export type EntryIntent =
  | ExpenseIntent
  | IncomeIntent
  | TransferIntent
  | LoanRepaymentIntent
  | LoanDisbursementIntent
  | RefundIntent
  | ReimbursementReceivedIntent
  | ReimbursementPaidIntent
  | InterestIntent
  | ChargeIntent
  | DepositIntent
  | WithdrawalIntent
  | AdjustmentIntent
  | OpeningBalanceIntent;

/** Convert a natural balance to the signed posting amount for that class. */
export function naturalToSigned(balance: Paise, cls: AccountClass): Paise {
  return cls === 'asset' ? balance : -balance;
}

export function signedToNatural(ledgerSum: Paise, cls: AccountClass): Paise {
  return cls === 'asset' ? ledgerSum : -ledgerSum;
}

function base(intent: BaseIntent, type: EntryType, amount: Paise, description: string): Omit<Entry, 'postings'> {
  if (!isISODate(intent.occurredOn)) throw new LedgerError('Pick a valid date', 'bad_date');
  if (!intent.idempotencyKey || intent.idempotencyKey.length < 8) {
    throw new LedgerError('Missing idempotency key', 'missing_idempotency_key');
  }
  return {
    type,
    occurredOn: intent.occurredOn,
    description: (intent.description ?? '').trim() || description,
    amount: abs(amount),
    currency: intent.currency ?? 'INR',
    categoryId: null,
    primaryAccountId: null,
    instrumentId: null,
    counterparty: intent.counterparty?.trim() || null,
    notes: intent.notes?.trim() || null,
    tags: intent.tags ?? [],
    status: 'posted',
    source: intent.source ?? 'mobile',
    idempotencyKey: intent.idempotencyKey,
    relatedEntryId: null,
    recurringRuleId: null,
    recurringDueOn: null,
    statementId: null,
  };
}

/**
 * Turn an intent into a validated, balanced entry.
 * Throws LedgerError with a user-presentable message when the intent is invalid.
 */
export function buildEntry(intent: EntryIntent, ctx: LedgerContext): Entry {
  const entry = buildEntryUnchecked(intent, ctx);
  validateEntry(entry, ctx);
  return entry;
}

function buildEntryUnchecked(intent: EntryIntent, ctx: LedgerContext): Entry {
  switch (intent.kind) {
    case 'expense': {
      requirePositive(intent.amount);
      requireCategory(ctx, intent.categoryId, 'expense');
      const shares = (intent.shares ?? []).filter((s) => s.amount !== 0n);
      const seen = new Set<string>();
      for (const s of shares) {
        requirePositive(s.amount, 'Each share');
        if (seen.has(s.personId)) throw new LedgerError('Each person can appear only once in a split', 'duplicate_share');
        seen.add(s.personId);
        if (s.personId === intent.paidByPersonId) throw new LedgerError('The person who paid cannot also owe a share', 'payer_share');
      }
      const shared = sum(shares.map((s) => s.amount));
      if (shared > intent.amount) throw new LedgerError('Shares owed by others exceed the total amount', 'shares_exceed_total');
      const personal = intent.amount - shared;
      let type: EntryType = 'expense';
      const postings: Posting[] = [];
      let primaryAccountId: string | null = null;
      let instrumentId: string | null = null;
      if (intent.paidByPersonId) {
        if (intent.accountId) throw new LedgerError('Choose either an account or a person who paid, not both', 'two_payers');
        postings.push(person(intent.paidByPersonId, -intent.amount, 'Paid on my behalf'));
      } else {
        const funding = resolveFundingAccount(ctx, intent.accountId, 'how you paid');
        const fundingAccount = ctx.accounts.get(funding.accountId)!;
        if (groupOf(fundingAccount) === 'loan') throw new LedgerError('Pay from a bank, cash, wallet or card', 'bad_funding');
        if (groupOf(fundingAccount) === 'credit') type = 'card_purchase';
        primaryAccountId = funding.accountId;
        instrumentId = funding.instrumentId;
        postings.push(acct(funding.accountId, -intent.amount));
      }
      if (personal > 0n) postings.push(cat(intent.categoryId, personal));
      for (const s of shares) postings.push(person(s.personId, s.amount, 'Owes their share'));
      return {
        ...base(intent, type, intent.amount, 'Expense'),
        categoryId: intent.categoryId,
        primaryAccountId,
        instrumentId,
        postings,
      };
    }

    case 'income': {
      requirePositive(intent.amount);
      const to = resolveFundingAccount(ctx, intent.accountId, 'the account that received it');
      const toAccount = ctx.accounts.get(to.accountId)!;
      if (toAccount.class !== 'asset') throw new LedgerError('Income must land in a bank, cash or wallet account', 'income_into_liability');
      requireCategory(ctx, intent.categoryId, 'income');
      return {
        ...base(intent, 'income', intent.amount, 'Income'),
        categoryId: intent.categoryId,
        primaryAccountId: to.accountId,
        postings: [acct(to.accountId, intent.amount), cat(intent.categoryId, -intent.amount)],
      };
    }

    case 'transfer': {
      requirePositive(intent.amount);
      const from = resolveFundingAccount(ctx, intent.fromAccountId, 'the source account');
      const to = resolveFundingAccount(ctx, intent.toAccountId, 'the destination account');
      if (from.accountId === to.accountId) throw new LedgerError('Source and destination must be different', 'same_account');
      const fromA = ctx.accounts.get(from.accountId)!;
      const toA = ctx.accounts.get(to.accountId)!;
      const fromGroup = groupOf(fromA);
      const toGroup = groupOf(toA);
      let type: EntryType = 'transfer';
      if (toGroup === 'credit') type = 'card_repayment';
      else if (toGroup === 'loan') type = 'loan_repayment';
      else if (fromGroup === 'loan') type = 'loan_disbursement';
      else if (toGroup === 'cash' && fromGroup === 'bank') type = 'cash_withdrawal';
      else if (fromGroup === 'cash' && toGroup === 'bank') type = 'cash_deposit';
      const fee = intent.fee ?? ZERO;
      if (fee < 0n) throw new LedgerError('Fee cannot be negative', 'negative_fee');
      const postings: Posting[] = [acct(from.accountId, -(intent.amount + fee)), acct(to.accountId, intent.amount)];
      if (fee > 0n) {
        const feeCat = intent.feeCategoryId ?? findSystemCategory(ctx, 'bank_charges', 'expense');
        if (!feeCat) throw new LedgerError('Create a "Bank charges" category for transfer fees', 'missing_fee_category');
        requireCategory(ctx, feeCat, 'expense');
        postings.push(cat(feeCat, fee, 'Transfer fee'));
      }
      const label =
        type === 'card_repayment' ? `Paid ${toA.name}` : type === 'cash_withdrawal' ? 'Cash withdrawal' : type === 'cash_deposit' ? 'Cash deposit' : `${fromA.name} → ${toA.name}`;
      return {
        ...base(intent, type, intent.amount, label),
        primaryAccountId: from.accountId,
        instrumentId: from.instrumentId,
        postings,
      };
    }

    case 'loan_repayment': {
      requirePositive(intent.amount);
      if (intent.interest < 0n || intent.interest > intent.amount) throw new LedgerError('Interest must be between zero and the amount paid', 'bad_interest');
      const from = resolveFundingAccount(ctx, intent.fromAccountId, 'the account you paid from');
      const loan = requireAccount(ctx, intent.loanAccountId, 'the loan');
      if (groupOf(loan) !== 'loan' && loan.type !== 'other_liability') throw new LedgerError('Choose a loan account', 'not_a_loan');
      const principal = intent.amount - intent.interest;
      const postings: Posting[] = [acct(from.accountId, -intent.amount)];
      if (principal > 0n) postings.push(acct(loan.id, principal, 'Principal'));
      if (intent.interest > 0n) {
        const interestCat = intent.interestCategoryId ?? findSystemCategory(ctx, 'interest_paid', 'expense');
        if (!interestCat) throw new LedgerError('Create an "Interest paid" expense category', 'missing_interest_category');
        requireCategory(ctx, interestCat, 'expense');
        postings.push(cat(interestCat, intent.interest, 'Interest'));
      }
      return {
        ...base(intent, 'loan_repayment', intent.amount, `${loan.name} EMI`),
        primaryAccountId: from.accountId,
        instrumentId: from.instrumentId,
        postings,
      };
    }

    case 'loan_disbursement': {
      requirePositive(intent.amount);
      const loan = requireAccount(ctx, intent.loanAccountId, 'the loan');
      if (classOf(loan.type, loan.class) !== 'liability') throw new LedgerError('Choose a loan account', 'not_a_loan');
      const fee = intent.processingFee ?? ZERO;
      if (fee < 0n || fee >= intent.amount) throw new LedgerError('Processing fee must be less than the loan amount', 'bad_fee');
      const postings: Posting[] = [acct(loan.id, -intent.amount, 'Disbursed')];
      if (intent.toAccountId) {
        const to = resolveFundingAccount(ctx, intent.toAccountId, 'the receiving account');
        postings.push(acct(to.accountId, intent.amount - fee));
      } else {
        requireCategory(ctx, intent.purchaseCategoryId, 'expense');
        postings.push(cat(intent.purchaseCategoryId!, intent.amount - fee, 'Paid directly to seller'));
      }
      if (fee > 0n) {
        const feeCat = findSystemCategory(ctx, 'bank_charges', 'expense');
        if (!feeCat) throw new LedgerError('Create a "Bank charges" category for processing fees', 'missing_fee_category');
        postings.push(cat(feeCat, fee, 'Processing fee'));
      }
      return {
        ...base(intent, 'loan_disbursement', intent.amount, `${loan.name} disbursed`),
        primaryAccountId: intent.toAccountId ?? loan.id,
        categoryId: intent.toAccountId ? null : intent.purchaseCategoryId ?? null,
        postings,
      };
    }

    case 'refund': {
      requirePositive(intent.amount);
      const to = resolveFundingAccount(ctx, intent.accountId, 'the account refunded to');
      requireCategory(ctx, intent.categoryId, 'expense');
      const postings: Posting[] = [acct(to.accountId, intent.amount)];
      const related = intent.relatedEntry;
      if (related) {
        if (intent.amount > related.amount) throw new LedgerError('Refund is larger than the original purchase', 'refund_exceeds_original');
        // Return the refund to each party in the same proportion as the original split.
        const legs = related.postings.filter((p) => (p.target === 'category' || p.target === 'person') && p.amount > 0n);
        const parts = allocate(intent.amount, legs.map((l) => l.amount));
        legs.forEach((leg, i) => {
          const part = parts[i]!;
          if (part === 0n) return;
          if (leg.target === 'person') postings.push(person(leg.personId!, -part, 'Their share refunded'));
          else postings.push(cat(leg.categoryId!, -part));
        });
      } else {
        postings.push(cat(intent.categoryId, -intent.amount));
      }
      return {
        ...base(intent, 'refund', intent.amount, 'Refund'),
        categoryId: intent.categoryId,
        primaryAccountId: to.accountId,
        instrumentId: to.instrumentId,
        relatedEntryId: related?.id ?? null,
        postings,
      };
    }

    case 'reimbursement_received': {
      requirePositive(intent.amount);
      const to = resolveFundingAccount(ctx, intent.accountId, 'the account that received it');
      return {
        ...base(intent, 'reimbursement_received', intent.amount, 'Reimbursement received'),
        primaryAccountId: to.accountId,
        postings: [acct(to.accountId, intent.amount), person(intent.personId, -intent.amount, 'Settled')],
      };
    }

    case 'reimbursement_paid': {
      requirePositive(intent.amount);
      const from = resolveFundingAccount(ctx, intent.accountId, 'the account you paid from');
      return {
        ...base(intent, 'reimbursement_paid', intent.amount, 'Paid back'),
        primaryAccountId: from.accountId,
        instrumentId: from.instrumentId,
        postings: [acct(from.accountId, -intent.amount), person(intent.personId, intent.amount, 'Paid to them')],
      };
    }

    case 'interest': {
      requirePositive(intent.amount);
      const a = requireAccount(ctx, intent.accountId, 'the account');
      if (intent.direction === 'earned') {
        const c = intent.categoryId ?? findSystemCategory(ctx, 'interest_earned', 'income');
        requireCategory(ctx, c, 'income');
        return {
          ...base(intent, 'interest', intent.amount, 'Interest earned'),
          categoryId: c,
          primaryAccountId: a.id,
          postings: [acct(a.id, intent.amount), cat(c!, -intent.amount)],
        };
      }
      const c = intent.categoryId ?? findSystemCategory(ctx, 'interest_paid', 'expense');
      requireCategory(ctx, c, 'expense');
      return {
        ...base(intent, 'interest', intent.amount, 'Interest charged'),
        categoryId: c,
        primaryAccountId: a.id,
        postings: [acct(a.id, -intent.amount), cat(c!, intent.amount)],
      };
    }

    case 'bank_charges': {
      requirePositive(intent.amount);
      const a = requireAccount(ctx, intent.accountId, 'the account');
      const c = intent.categoryId ?? findSystemCategory(ctx, 'bank_charges', 'expense');
      requireCategory(ctx, c, 'expense');
      return {
        ...base(intent, 'bank_charges', intent.amount, 'Bank charges'),
        categoryId: c,
        primaryAccountId: a.id,
        postings: [acct(a.id, -intent.amount), cat(c!, intent.amount)],
      };
    }

    case 'bank_deposit': {
      requirePositive(intent.amount);
      const to = requireAccount(ctx, intent.accountId, 'the account');
      const postings: Posting[] = [acct(to.id, intent.amount)];
      if (intent.fromAccountId) {
        const from = requireAccount(ctx, intent.fromAccountId, 'the source');
        if (from.id === to.id) throw new LedgerError('Source and destination must be different', 'same_account');
        postings.push(acct(from.id, -intent.amount));
      } else {
        const c = intent.categoryId ?? findSystemCategory(ctx, 'other_income', 'income');
        requireCategory(ctx, c, 'income');
        postings.push(cat(c!, -intent.amount));
      }
      return {
        ...base(intent, 'bank_deposit', intent.amount, 'Deposit'),
        categoryId: intent.fromAccountId ? null : intent.categoryId ?? null,
        primaryAccountId: to.id,
        postings,
      };
    }

    case 'bank_withdrawal': {
      requirePositive(intent.amount);
      const from = requireAccount(ctx, intent.accountId, 'the account');
      const postings: Posting[] = [acct(from.id, -intent.amount)];
      if (intent.toAccountId) {
        const to = requireAccount(ctx, intent.toAccountId, 'the destination');
        if (from.id === to.id) throw new LedgerError('Source and destination must be different', 'same_account');
        postings.push(acct(to.id, intent.amount));
      } else {
        requireCategory(ctx, intent.categoryId, 'expense');
        postings.push(cat(intent.categoryId!, intent.amount));
      }
      return {
        ...base(intent, 'bank_withdrawal', intent.amount, 'Withdrawal'),
        categoryId: intent.toAccountId ? null : intent.categoryId ?? null,
        primaryAccountId: from.id,
        postings,
      };
    }

    case 'adjustment': {
      const a = requireAccount(ctx, intent.accountId, 'the account');
      const deltaNatural = intent.targetBalance - intent.currentBalance;
      if (deltaNatural === 0n) throw new LedgerError('Balance already matches — nothing to adjust', 'no_change');
      const signed = naturalToSigned(deltaNatural, a.class);
      return {
        ...base(intent, 'adjustment', deltaNatural, 'Balance correction'),
        primaryAccountId: a.id,
        postings: [acct(a.id, signed), equity(-signed, 'Balance correction')],
      };
    }

    case 'opening_balance': {
      const a = requireAccount(ctx, intent.accountId, 'the account');
      if (intent.balance === 0n) throw new LedgerError('Opening balance is zero — no entry needed', 'no_change');
      const signed = naturalToSigned(intent.balance, a.class);
      return {
        ...base(intent, 'opening_balance', intent.balance, 'Opening balance'),
        primaryAccountId: a.id,
        postings: [acct(a.id, signed), equity(-signed, 'Opening balance')],
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Validation — mirrors folio.validate_entry() in Postgres.
// ---------------------------------------------------------------------------

const ACCOUNT_ONLY_TYPES: ReadonlySet<EntryType> = new Set(['transfer', 'card_repayment', 'cash_withdrawal', 'cash_deposit']);
const NO_INCOME_TYPES: ReadonlySet<EntryType> = new Set([
  'transfer',
  'card_repayment',
  'cash_withdrawal',
  'cash_deposit',
  'reimbursement_received',
  'reimbursement_paid',
  'expense',
  'card_purchase',
  'loan_repayment',
  'bank_charges',
  'refund',
  'adjustment',
  'opening_balance',
  'bank_withdrawal',
  'loan_disbursement',
]);

export function validateEntry(entry: Entry, ctx?: LedgerContext): void {
  const { postings } = entry;
  if (postings.length < 2) throw new LedgerError('An entry needs at least two legs', 'too_few_postings');
  let total = 0n;
  for (const p of postings) {
    if (p.amount === 0n) throw new LedgerError('Zero-amount leg', 'zero_posting');
    total += p.amount;
    const filled = [p.accountId, p.categoryId, p.personId].filter((x) => x != null).length;
    if (p.target === 'equity' ? filled !== 0 : filled !== 1) throw new LedgerError('Malformed posting target', 'bad_target');
    if (p.target === 'account' && !p.accountId) throw new LedgerError('Account leg without account', 'bad_target');
    if (p.target === 'category' && !p.categoryId) throw new LedgerError('Category leg without category', 'bad_target');
    if (p.target === 'person' && !p.personId) throw new LedgerError('Person leg without person', 'bad_target');
  }
  if (total !== 0n) throw new LedgerError(`Entry does not balance (off by ${total} paise)`, 'unbalanced');
  if (entry.amount < 0n) throw new LedgerError('Headline amount must be positive', 'negative_amount');

  if (ACCOUNT_ONLY_TYPES.has(entry.type)) {
    // Money moves between own accounts; the only other leg allowed is a fee (an expense debit).
    const illegal = postings.filter((p) => p.target === 'person' || p.target === 'equity' || (p.target === 'category' && p.amount < 0n));
    if (illegal.length > 0) throw new LedgerError('Transfers may only move money between your accounts', 'transfer_with_category');
    if (postings.filter((p) => p.target === 'account').length < 2) throw new LedgerError('A transfer needs two accounts', 'transfer_one_account');
  }
  if (entry.type === 'reimbursement_received' || entry.type === 'reimbursement_paid') {
    if (postings.some((p) => p.target === 'category')) throw new LedgerError('Reimbursements are never income or expense', 'reimbursement_category');
  }
  if (entry.type !== 'opening_balance' && entry.type !== 'adjustment' && postings.some((p) => p.target === 'equity')) {
    throw new LedgerError('Only opening balances and corrections can use equity', 'equity_misuse');
  }

  if (ctx) {
    for (const p of postings) {
      if (p.target === 'account') {
        const a = ctx.accounts.get(p.accountId!);
        if (!a) throw new LedgerError('Unknown account', 'unknown_account');
        if (a.type === 'debit_card') throw new LedgerError('Debit cards have no balance; post to the linked bank account', 'debit_card_posting');
      }
      if (p.target === 'category') {
        const c = ctx.categories.get(p.categoryId!);
        if (!c) throw new LedgerError('Unknown category', 'unknown_category');
        if (c.kind === 'income' && NO_INCOME_TYPES.has(entry.type)) {
          throw new LedgerError(`A ${entry.type.replace('_', ' ')} can never be income`, 'income_misuse');
        }
        if (c.kind === 'expense' && (entry.type === 'income' || entry.type === 'bank_deposit')) {
          throw new LedgerError('Income cannot be booked to an expense category', 'expense_misuse');
        }
      }
      if (p.target === 'person' && ctx.people && ctx.people.size > 0 && !ctx.people.has(p.personId!)) {
        throw new LedgerError('Unknown person', 'unknown_person');
      }
    }
  }
}

/** Serialise an entry for the `folio.post_entry` RPC (amounts as strings). */
export function entryToWire(entry: Entry) {
  return {
    entry: {
      type: entry.type,
      occurred_on: entry.occurredOn,
      description: entry.description,
      amount: entry.amount.toString(),
      currency: entry.currency,
      category_id: entry.categoryId,
      primary_account_id: entry.primaryAccountId,
      instrument_id: entry.instrumentId,
      counterparty: entry.counterparty,
      notes: entry.notes,
      tags: entry.tags,
      source: entry.source,
      idempotency_key: entry.idempotencyKey,
      related_entry_id: entry.relatedEntryId,
      recurring_rule_id: entry.recurringRuleId,
      recurring_due_on: entry.recurringDueOn,
      statement_id: entry.statementId,
    },
    postings: entry.postings.map((p) => ({
      target: p.target,
      account_id: p.accountId ?? null,
      category_id: p.categoryId ?? null,
      person_id: p.personId ?? null,
      amount: p.amount.toString(),
      memo: p.memo ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Derived classification of an entry, used by lists and analytics.
// ---------------------------------------------------------------------------

export interface EntryBreakdown {
  /** Money spent on myself (expense categories, net of refunds). */
  personalExpense: Paise;
  /** Amount paid on behalf of others in this entry. */
  reimbursable: Paise;
  /** Income recognised. */
  income: Paise;
  /** Receivable reduction from people paying me back. */
  reimbursementReceived: Paise;
  /** Change in net worth caused by this entry. */
  netWorthDelta: Paise;
}

export function breakdown(entry: Pick<Entry, 'type' | 'postings' | 'status'>, categoryKind: (id: string) => 'expense' | 'income' | undefined): EntryBreakdown {
  const out: EntryBreakdown = { personalExpense: 0n, reimbursable: 0n, income: 0n, reimbursementReceived: 0n, netWorthDelta: 0n };
  if (entry.status === 'void') return out;
  for (const p of entry.postings) {
    if (p.target === 'category') {
      const kind = categoryKind(p.categoryId!);
      if (kind === 'expense') out.personalExpense += p.amount;
      else if (kind === 'income') out.income += -p.amount;
    } else if (p.target === 'person') {
      if ((entry.type === 'expense' || entry.type === 'card_purchase' || entry.type === 'refund') && p.amount !== 0n) out.reimbursable += p.amount;
      if (entry.type === 'reimbursement_received') out.reimbursementReceived += -p.amount;
    }
  }
  // Net worth moves only through income/expense/equity legs (everything else is internal).
  out.netWorthDelta = sum(entry.postings.filter((p) => p.target === 'category' || p.target === 'equity').map((p) => -p.amount));
  return out;
}

export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  income: 'Income',
  expense: 'Expense',
  bank_deposit: 'Deposit',
  bank_withdrawal: 'Withdrawal',
  transfer: 'Transfer',
  card_purchase: 'Card spend',
  card_repayment: 'Card payment',
  loan_disbursement: 'Loan disbursed',
  loan_repayment: 'Loan repayment',
  interest: 'Interest',
  bank_charges: 'Charges',
  refund: 'Refund',
  reimbursement_received: 'Paid back to you',
  reimbursement_paid: 'You paid back',
  cash_withdrawal: 'Cash withdrawal',
  cash_deposit: 'Cash deposit',
  adjustment: 'Correction',
  opening_balance: 'Opening balance',
};

/** How an entry affects one specific account, for account ledgers. */
export function effectOnAccount(entry: Pick<Entry, 'postings'>, accountId: string): Paise {
  return sum(entry.postings.filter((p) => p.target === 'account' && p.accountId === accountId).map((p) => p.amount));
}
