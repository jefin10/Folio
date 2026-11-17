import type { ISODate } from './dates';
import type { Paise } from './money';

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const ACCOUNT_TYPES = [
  'savings',
  'current',
  'salary',
  'fixed_deposit',
  'recurring_deposit',
  'stocks',
  'mutual_funds',
  'cash',
  'wallet',
  'credit_card',
  'debit_card',
  'secured_credit_card',
  'bnpl',
  'personal_loan',
  'education_loan',
  'vehicle_loan',
  'home_loan',
  'other_loan',
  'other_liability',
  'other_asset',
  'custom',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type AccountClass = 'asset' | 'liability';

/** UI grouping that drives which carousel / section an account appears in. */
export type AccountGroup = 'bank' | 'deposit' | 'cash' | 'wallet' | 'credit' | 'debit' | 'loan' | 'other';

export type AccountStatus = 'active' | 'archived' | 'closed';

export const CARD_NETWORKS = ['visa', 'mastercard', 'rupay', 'amex', 'diners', 'discover', 'jcb', 'unionpay', 'other'] as const;
export type CardNetwork = (typeof CARD_NETWORKS)[number];

export const LOAN_KINDS = ['two_wheeler', 'car', 'education', 'personal', 'home', 'gold', 'consumer_durable', 'other'] as const;
export type LoanKind = (typeof LOAN_KINDS)[number];

export interface CardDetails {
  network: CardNetwork | null;
  variant: string | null; // card product name e.g. "Elite"
  creditLimit: Paise | null;
  statementDay: number | null; // 1..31
  dueDay: number | null; // 1..31 (day of month)
  annualFee: Paise | null;
  lifetimeFree: boolean;
  rewardsInfo: string | null;
  rewardRateBps: number | null; // e.g. 200 = 2% back
  minDueBps: number | null; // minimum due as % of statement balance (default 500 = 5%)
}

export interface LoanDetails {
  loanKind: LoanKind;
  lender: string | null;
  principalAmount: Paise | null; // sanctioned / disbursed amount
  interestRateBps: number | null; // annual, e.g. 1050 = 10.5%
  emiAmount: Paise | null;
  tenureMonths: number | null;
  emiDay: number | null;
  startDate: ISODate | null;
  emiAccountId: string | null; // the account EMI is paid from
}

export interface CardTheme {
  /** Preset artwork key or 'custom' */
  preset: string;
  /** Up to 3 gradient stops (hex). */
  colors: string[];
  /** Foreground ink: light or dark text on the card. */
  ink: 'light' | 'dark';
  /** Optional pattern overlay key. */
  pattern?: string | null;
}

export interface Account {
  id: string;
  name: string;
  nickname: string | null;
  type: AccountType;
  class: AccountClass;
  customTypeLabel: string | null;
  institutionName: string | null;
  institutionId: string | null;
  currency: string;
  last4: string | null;
  color: string | null;
  icon: string | null;
  theme: CardTheme | null;
  artworkPath: string | null;
  interestRateBps: number | null;
  status: AccountStatus;
  includeInNetWorth: boolean;
  isLiquid: boolean;
  sortOrder: number;
  notes: string | null;
  linkedAccountId: string | null; // debit card → bank account
  card: CardDetails | null;
  loan: LoanDetails | null;
  openedOn: ISODate | null;
  createdAt?: string;
}

export interface AccountBalance {
  accountId: string;
  /** Signed sum of postings (debit positive). */
  ledgerSum: Paise;
  /** Natural balance: assets = money held, liabilities = amount owed. */
  balance: Paise;
  lastActivityOn: ISODate | null;
  postingCount: number;
}

// ---------------------------------------------------------------------------
// People, categories
// ---------------------------------------------------------------------------

export type PersonRelation = 'parent' | 'family' | 'friend' | 'roommate' | 'partner' | 'colleague' | 'other';

export interface Person {
  id: string;
  name: string;
  relation: PersonRelation;
  color: string | null;
  emoji: string | null;
  phone: string | null;
  notes: string | null;
  archived: boolean;
}

export type CategoryKind = 'expense' | 'income';

export interface Category {
  id: string;
  kind: CategoryKind;
  name: string;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  systemKey: string | null; // e.g. 'interest_paid', 'bank_charges', 'salary'
  archived: boolean;
  sortOrder: number;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export const ENTRY_TYPES = [
  'income',
  'expense',
  'bank_deposit',
  'bank_withdrawal',
  'transfer',
  'card_purchase',
  'card_repayment',
  'loan_disbursement',
  'loan_repayment',
  'interest',
  'bank_charges',
  'refund',
  'reimbursement_received',
  'reimbursement_paid',
  'cash_withdrawal',
  'cash_deposit',
  'adjustment',
  'opening_balance',
] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export type PostingTarget = 'account' | 'category' | 'person' | 'equity';

/**
 * One leg of a journal entry. `amount` follows double-entry sign convention:
 * positive = debit, negative = credit. The legs of an entry always sum to 0.
 *
 *  account (asset)      debit  → balance up      credit → balance down
 *  account (liability)  debit  → owed goes down  credit → owed goes up
 *  category (expense)   debit  → spending        credit → refund
 *  category (income)    credit → income          debit  → income reversal
 *  person               debit  → they owe me     credit → they paid me / I owe them
 *  equity               opening balances and manual adjustments
 */
export interface Posting {
  id?: string;
  target: PostingTarget;
  accountId?: string | null;
  categoryId?: string | null;
  personId?: string | null;
  amount: Paise;
  memo?: string | null;
}

export type EntrySource = 'mobile' | 'web' | 'watch' | 'widget' | 'import' | 'recurring' | 'system';
export type EntryStatus = 'posted' | 'void';

export interface Entry {
  id?: string;
  type: EntryType;
  occurredOn: ISODate;
  description: string;
  /** Headline amount (always positive) shown in lists. */
  amount: Paise;
  currency: string;
  categoryId: string | null;
  /** The account the user thinks of as "paid from / received in". */
  primaryAccountId: string | null;
  /** Debit card used, if the payment went through one (postings hit its bank). */
  instrumentId: string | null;
  counterparty: string | null;
  notes: string | null;
  tags: string[];
  status: EntryStatus;
  source: EntrySource;
  idempotencyKey: string;
  relatedEntryId: string | null;
  recurringRuleId: string | null;
  recurringDueOn: ISODate | null;
  statementId: string | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  postings: Posting[];
}

// ---------------------------------------------------------------------------
// Recurring obligations
// ---------------------------------------------------------------------------

export const RECURRING_KINDS = [
  'emi',
  'subscription',
  'insurance',
  'mobile',
  'electricity',
  'internet',
  'rent',
  'card_autopay',
  'sip',
  'income',
  'transfer',
  'other',
] as const;
export type RecurringKind = (typeof RECURRING_KINDS)[number];

export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'custom_days';

export interface RecurringRule {
  id: string;
  name: string;
  kind: RecurringKind;
  amount: Paise | null; // null when variable
  isVariable: boolean;
  frequency: Frequency;
  intervalDays: number | null; // for custom_days
  startOn: ISODate; // first due date (anchor)
  endOn: ISODate | null;
  maxOccurrences: number | null;
  dayOfMonth: number | null; // preferred day (keeps 31st semantics)
  sourceAccountId: string | null; // pays from
  targetAccountId: string | null; // card / loan / destination account
  categoryId: string | null;
  personId: string | null;
  reminderDaysBefore: number;
  reminderTime: string; // HH:MM
  isActive: boolean;
  bankAutopay: boolean; // a mandate exists at the bank (informational only)
  notes: string | null;
}

export type OccurrenceStatus = 'paid' | 'skipped';

export interface RecurringOccurrence {
  id?: string;
  ruleId: string;
  dueOn: ISODate;
  status: OccurrenceStatus;
  entryId: string | null;
  amount: Paise | null;
  resolvedAt?: string;
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export type StatementStatus = 'open' | 'partially_paid' | 'paid' | 'reconciled';

export interface Statement {
  id: string;
  accountId: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  statementDate: ISODate;
  dueDate: ISODate | null;
  statementBalance: Paise;
  minimumDue: Paise | null;
  filePath: string | null;
  status: StatementStatus;
  reconciledAt: string | null;
  notes: string | null;
}

export interface StatementLine {
  id?: string;
  statementId?: string;
  occurredOn: ISODate;
  description: string;
  /** From the card/account holder's point of view: positive = charge/debit, negative = credit/payment. */
  amount: Paise;
  matchedEntryId?: string | null;
}

// ---------------------------------------------------------------------------
// Reimbursement allocations
// ---------------------------------------------------------------------------

export interface SettlementAllocation {
  settlementEntryId: string;
  claimEntryId: string;
  personId: string;
  amount: Paise;
}
