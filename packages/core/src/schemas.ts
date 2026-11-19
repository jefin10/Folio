/**
 * Zod schemas for database rows (snake_case, as returned by PostgREST) and
 * mappers into the camelCase domain model. Amounts arrive as JSON numbers or
 * strings and become exact bigints here.
 */
import { z } from 'zod';
import { toPaise } from './money';
import { ACCOUNT_TYPES, CARD_NETWORKS, ENTRY_TYPES, LOAN_KINDS, RECURRING_KINDS } from './types';
import type { Account, AccountBalance, Category, Entry, Person, Posting, RecurringOccurrence, RecurringRule, SettlementAllocation, Statement, StatementLine } from './types';
import type { PersonBalance } from './balances';

const paise = z.union([z.string(), z.number(), z.bigint()]).transform((v) => toPaise(v));
const paiseNullable = z.union([z.string(), z.number(), z.bigint(), z.null()]).transform((v) => (v === null ? null : toPaise(v)));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.string().min(1);
const nstr = z.string().nullable().optional().transform((v) => v ?? null);
const nnum = z.number().nullable().optional().transform((v) => v ?? null);

export const cardDetailsRow = z.object({
  network: z.enum(CARD_NETWORKS).nullable().optional(),
  variant: nstr,
  credit_limit: paiseNullable.optional(),
  statement_day: nnum,
  due_day: nnum,
  annual_fee: paiseNullable.optional(),
  lifetime_free: z.boolean().default(false),
  rewards_info: nstr,
  reward_rate_bps: nnum,
  min_due_bps: nnum,
});

export const loanDetailsRow = z.object({
  loan_kind: z.enum(LOAN_KINDS).default('other'),
  lender: nstr,
  principal_amount: paiseNullable.optional(),
  interest_rate_bps: nnum,
  emi_amount: paiseNullable.optional(),
  tenure_months: nnum,
  emi_day: nnum,
  start_date: date.nullable().optional(),
  emi_account_id: uuid.nullable().optional(),
});

export const growDetailsRow = z.object({
  principal_amount: paiseNullable.optional(),
  interest_rate_bps: nnum,
  start_date: date.nullable().optional(),
  tenure_months: nnum,
  compounding_per_year: z.number().default(4),
  invested_amount: paiseNullable.optional(),
  sip_amount: paiseNullable.optional(),
  sip_frequency: z.enum(['daily', 'weekly', 'monthly']).nullable().optional(),
});

const themeSchema = z
  .object({ preset: z.string(), colors: z.array(z.string()).max(4), ink: z.enum(['light', 'dark']), pattern: z.string().nullable().optional() })
  .nullable()
  .optional();

export const accountRow = z.object({
  id: uuid,
  name: z.string(),
  nickname: nstr,
  type: z.enum(ACCOUNT_TYPES),
  class: z.enum(['asset', 'liability']),
  custom_type_label: nstr,
  institution_id: uuid.nullable().optional(),
  institution_name: nstr,
  currency: z.string().default('INR'),
  last4: nstr,
  color: nstr,
  icon: nstr,
  theme: themeSchema,
  artwork_path: nstr,
  interest_rate_bps: nnum,
  status: z.enum(['active', 'archived', 'closed']),
  include_in_net_worth: z.boolean(),
  is_liquid: z.boolean(),
  sort_order: z.number(),
  notes: nstr,
  linked_account_id: uuid.nullable().optional(),
  opened_on: date.nullable().optional(),
  created_at: z.string().optional(),
  card_details: z.union([cardDetailsRow, z.array(cardDetailsRow)]).nullable().optional(),
  loan_details: z.union([loanDetailsRow, z.array(loanDetailsRow)]).nullable().optional(),
  grow_details: z.union([growDetailsRow, z.array(growDetailsRow)]).nullable().optional(),
});

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export function mapAccount(raw: unknown): Account {
  const r = accountRow.parse(raw);
  const card = one(r.card_details);
  const loan = one(r.loan_details);
  const grow = one(r.grow_details);
  return {
    id: r.id,
    name: r.name,
    nickname: r.nickname,
    type: r.type,
    class: r.class,
    customTypeLabel: r.custom_type_label,
    institutionId: r.institution_id ?? null,
    institutionName: r.institution_name,
    currency: r.currency,
    last4: r.last4,
    color: r.color,
    icon: r.icon,
    theme: r.theme ? { preset: r.theme.preset, colors: r.theme.colors, ink: r.theme.ink, pattern: r.theme.pattern ?? null } : null,
    artworkPath: r.artwork_path,
    interestRateBps: r.interest_rate_bps,
    status: r.status,
    includeInNetWorth: r.include_in_net_worth,
    isLiquid: r.is_liquid,
    sortOrder: r.sort_order,
    notes: r.notes,
    linkedAccountId: r.linked_account_id ?? null,
    openedOn: r.opened_on ?? null,
    createdAt: r.created_at,
    card: card
      ? {
          network: card.network ?? null,
          variant: card.variant,
          creditLimit: card.credit_limit ?? null,
          statementDay: card.statement_day,
          dueDay: card.due_day,
          annualFee: card.annual_fee ?? null,
          lifetimeFree: card.lifetime_free,
          rewardsInfo: card.rewards_info,
          rewardRateBps: card.reward_rate_bps,
          minDueBps: card.min_due_bps,
        }
      : null,
    loan: loan
      ? {
          loanKind: loan.loan_kind,
          lender: loan.lender,
          principalAmount: loan.principal_amount ?? null,
          interestRateBps: loan.interest_rate_bps,
          emiAmount: loan.emi_amount ?? null,
          tenureMonths: loan.tenure_months,
          emiDay: loan.emi_day,
          startDate: loan.start_date ?? null,
          emiAccountId: loan.emi_account_id ?? null,
        }
      : null,
    grow: grow
      ? {
          principalAmount: grow.principal_amount ?? null,
          interestRateBps: grow.interest_rate_bps,
          startDate: grow.start_date ?? null,
          tenureMonths: grow.tenure_months,
          compoundingPerYear: grow.compounding_per_year,
          investedAmount: grow.invested_amount ?? null,
          sipAmount: grow.sip_amount ?? null,
          sipFrequency: grow.sip_frequency ?? null,
        }
      : null,
  };
}

export const balanceRow = z.object({ account_id: uuid, ledger_sum: paise, balance: paise, last_activity_on: date.nullable(), posting_count: z.number() });
export function mapBalance(raw: unknown): AccountBalance {
  const r = balanceRow.parse(raw);
  return { accountId: r.account_id, ledgerSum: r.ledger_sum, balance: r.balance, lastActivityOn: r.last_activity_on, postingCount: r.posting_count };
}

export const personBalanceRow = z.object({ person_id: uuid, paid_on_behalf: paise, reimbursed: paise, outstanding: paise, last_activity_on: date.nullable() });
export function mapPersonBalance(raw: unknown): PersonBalance {
  const r = personBalanceRow.parse(raw);
  return { personId: r.person_id, paidOnBehalf: r.paid_on_behalf, reimbursed: r.reimbursed, outstanding: r.outstanding, lastActivityOn: r.last_activity_on };
}

export const personRow = z.object({
  id: uuid,
  name: z.string(),
  relation: z.enum(['parent', 'family', 'friend', 'roommate', 'partner', 'colleague', 'other']),
  color: nstr,
  emoji: nstr,
  phone: nstr,
  notes: nstr,
  archived: z.boolean(),
});
export function mapPerson(raw: unknown): Person {
  const r = personRow.parse(raw);
  return { ...r };
}

export const categoryRow = z.object({
  id: uuid,
  kind: z.enum(['expense', 'income']),
  name: z.string(),
  icon: nstr,
  color: nstr,
  parent_id: uuid.nullable().optional(),
  system_key: nstr,
  archived: z.boolean(),
  sort_order: z.number(),
});
export function mapCategory(raw: unknown): Category {
  const r = categoryRow.parse(raw);
  return { id: r.id, kind: r.kind, name: r.name, icon: r.icon, color: r.color, parentId: r.parent_id ?? null, systemKey: r.system_key, archived: r.archived, sortOrder: r.sort_order };
}

export const postingRow = z.object({
  id: uuid.optional(),
  target: z.enum(['account', 'category', 'person', 'equity']),
  account_id: uuid.nullable().optional(),
  category_id: uuid.nullable().optional(),
  person_id: uuid.nullable().optional(),
  amount: paise,
  memo: nstr,
});
export function mapPosting(raw: unknown): Posting {
  const r = postingRow.parse(raw);
  return { id: r.id, target: r.target, accountId: r.account_id ?? null, categoryId: r.category_id ?? null, personId: r.person_id ?? null, amount: r.amount, memo: r.memo };
}

export const entryRow = z.object({
  id: uuid,
  type: z.enum(ENTRY_TYPES),
  occurred_on: date,
  description: z.string(),
  amount: paise,
  currency: z.string(),
  category_id: uuid.nullable().optional(),
  primary_account_id: uuid.nullable().optional(),
  instrument_id: uuid.nullable().optional(),
  counterparty: nstr,
  notes: nstr,
  tags: z.array(z.string()).nullable().optional(),
  status: z.enum(['posted', 'void']),
  source: z.enum(['mobile', 'web', 'watch', 'widget', 'import', 'recurring', 'system']),
  idempotency_key: z.string(),
  related_entry_id: uuid.nullable().optional(),
  recurring_rule_id: uuid.nullable().optional(),
  recurring_due_on: date.nullable().optional(),
  statement_id: uuid.nullable().optional(),
  version: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  postings: z.array(z.unknown()).optional(),
});
export function mapEntry(raw: unknown): Entry {
  const r = entryRow.parse(raw);
  return {
    id: r.id,
    type: r.type,
    occurredOn: r.occurred_on,
    description: r.description,
    amount: r.amount,
    currency: r.currency,
    categoryId: r.category_id ?? null,
    primaryAccountId: r.primary_account_id ?? null,
    instrumentId: r.instrument_id ?? null,
    counterparty: r.counterparty,
    notes: r.notes,
    tags: r.tags ?? [],
    status: r.status,
    source: r.source,
    idempotencyKey: r.idempotency_key,
    relatedEntryId: r.related_entry_id ?? null,
    recurringRuleId: r.recurring_rule_id ?? null,
    recurringDueOn: r.recurring_due_on ?? null,
    statementId: r.statement_id ?? null,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    postings: (r.postings ?? []).map(mapPosting),
  };
}

export const ruleRow = z.object({
  id: uuid,
  name: z.string(),
  kind: z.enum(RECURRING_KINDS),
  amount: paiseNullable,
  is_variable: z.boolean(),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'half_yearly', 'yearly', 'custom_days']),
  interval_days: nnum,
  start_on: date,
  end_on: date.nullable().optional(),
  max_occurrences: nnum,
  day_of_month: nnum,
  source_account_id: uuid.nullable().optional(),
  target_account_id: uuid.nullable().optional(),
  category_id: uuid.nullable().optional(),
  person_id: uuid.nullable().optional(),
  reminder_days_before: z.number(),
  reminder_time: z.string(),
  is_active: z.boolean(),
  bank_autopay: z.boolean(),
  notes: nstr,
});
export function mapRule(raw: unknown): RecurringRule {
  const r = ruleRow.parse(raw);
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    amount: r.amount,
    isVariable: r.is_variable,
    frequency: r.frequency,
    intervalDays: r.interval_days,
    startOn: r.start_on,
    endOn: r.end_on ?? null,
    maxOccurrences: r.max_occurrences,
    dayOfMonth: r.day_of_month,
    sourceAccountId: r.source_account_id ?? null,
    targetAccountId: r.target_account_id ?? null,
    categoryId: r.category_id ?? null,
    personId: r.person_id ?? null,
    reminderDaysBefore: r.reminder_days_before,
    reminderTime: r.reminder_time.slice(0, 5),
    isActive: r.is_active,
    bankAutopay: r.bank_autopay,
    notes: r.notes,
  };
}

export const occurrenceRow = z.object({ id: uuid, rule_id: uuid, due_on: date, status: z.enum(['paid', 'skipped']), entry_id: uuid.nullable().optional(), amount: paiseNullable, resolved_at: z.string().optional() });
export function mapOccurrence(raw: unknown): RecurringOccurrence {
  const r = occurrenceRow.parse(raw);
  return { id: r.id, ruleId: r.rule_id, dueOn: r.due_on, status: r.status, entryId: r.entry_id ?? null, amount: r.amount, resolvedAt: r.resolved_at };
}

export const statementRow = z.object({
  id: uuid,
  account_id: uuid,
  period_start: date,
  period_end: date,
  statement_date: date,
  due_date: date.nullable().optional(),
  statement_balance: paise,
  minimum_due: paiseNullable,
  file_path: nstr,
  status: z.enum(['open', 'partially_paid', 'paid', 'reconciled']),
  reconciled_at: z.string().nullable().optional(),
  notes: nstr,
});
export function mapStatement(raw: unknown): Statement {
  const r = statementRow.parse(raw);
  return {
    id: r.id,
    accountId: r.account_id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    statementDate: r.statement_date,
    dueDate: r.due_date ?? null,
    statementBalance: r.statement_balance,
    minimumDue: r.minimum_due,
    filePath: r.file_path,
    status: r.status,
    reconciledAt: r.reconciled_at ?? null,
    notes: r.notes,
  };
}

export const statementLineRow = z.object({ id: uuid, statement_id: uuid, occurred_on: date, description: z.string(), amount: paise, matched_entry_id: uuid.nullable().optional() });
export function mapStatementLine(raw: unknown): StatementLine {
  const r = statementLineRow.parse(raw);
  return { id: r.id, statementId: r.statement_id, occurredOn: r.occurred_on, description: r.description, amount: r.amount, matchedEntryId: r.matched_entry_id ?? null };
}

export const allocationRow = z.object({ settlement_entry_id: uuid, claim_entry_id: uuid, person_id: uuid, amount: paise });
export function mapAllocation(raw: unknown): SettlementAllocation {
  const r = allocationRow.parse(raw);
  return { settlementEntryId: r.settlement_entry_id, claimEntryId: r.claim_entry_id, personId: r.person_id, amount: r.amount };
}

export const profileRow = z.object({
  id: uuid,
  display_name: nstr,
  base_currency: z.string(),
  locale: z.string(),
  timezone: z.string(),
  date_format: z.string(),
  dashboard: z.unknown().nullable().optional(),
  onboarded_at: z.string().nullable().optional(),
  lock_timeout_seconds: z.number().default(60),
});
export type Profile = {
  id: string;
  displayName: string | null;
  baseCurrency: string;
  locale: string;
  timezone: string;
  dateFormat: string;
  dashboard: unknown;
  onboardedAt: string | null;
  lockTimeoutSeconds: number;
};
export function mapProfile(raw: unknown): Profile {
  const r = profileRow.parse(raw);
  return {
    id: r.id,
    displayName: r.display_name,
    baseCurrency: r.base_currency,
    locale: r.locale,
    timezone: r.timezone,
    dateFormat: r.date_format,
    dashboard: r.dashboard ?? null,
    onboardedAt: r.onboarded_at ?? null,
    lockTimeoutSeconds: r.lock_timeout_seconds,
  };
}

// ---------------------------------------------------------------------------
// Form schemas (shared validation for web + mobile forms)
// ---------------------------------------------------------------------------

const optionalDay = z.number().int().min(1).max(31).nullable();

export const accountFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the account a name').max(60),
    nickname: z.string().trim().max(40).nullable(),
    type: z.enum(ACCOUNT_TYPES),
    customClass: z.enum(['asset', 'liability']).nullable(),
    customTypeLabel: z.string().trim().max(40).nullable(),
    institutionName: z.string().trim().max(60).nullable(),
    last4: z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'Only the last 4 digits')
      .nullable(),
    color: z.string().nullable(),
    icon: z.string().nullable(),
    openingBalance: z.bigint(),
    openedOn: date,
    interestRateBps: z.number().int().min(0).max(100_00).nullable(),
    includeInNetWorth: z.boolean(),
    notes: z.string().max(500).nullable(),
    linkedAccountId: z.string().nullable(),
    creditLimit: z.bigint().nullable(),
    statementDay: optionalDay,
    dueDay: optionalDay,
    network: z.enum(CARD_NETWORKS).nullable(),
    variant: z.string().max(40).nullable(),
    annualFee: z.bigint().nullable(),
    lifetimeFree: z.boolean(),
    rewardsInfo: z.string().max(300).nullable(),
    rewardRateBps: z.number().int().min(0).max(100_00).nullable(),
  })
  .refine((v) => v.type !== 'debit_card' || !!v.linkedAccountId, { message: 'Link the debit card to a bank account', path: ['linkedAccountId'] })
  .refine((v) => v.type !== 'custom' || !!v.customClass, { message: 'Is this something you own or owe?', path: ['customClass'] });
export type AccountForm = z.infer<typeof accountFormSchema>;

/** Full-PAN guard: Folio refuses anything that looks like a full card number, CVV or OTP. */
export function containsSensitiveCardData(text: string): boolean {
  const digits = text.replace(/[\s-]/g, '');
  if (/\d{12,19}/.test(digits) && luhn(digits.match(/\d{12,19}/)![0])) return true;
  if (/\b(cvv|cvc|otp|pin)\b\s*[:=]?\s*\d{3,6}/i.test(text)) return true;
  return false;
}

function luhn(num: string): boolean {
  let s = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    s += n;
    alt = !alt;
  }
  return s % 10 === 0;
}
