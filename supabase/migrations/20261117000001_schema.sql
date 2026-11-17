-- =============================================================================
-- Folio — personal financial operating system
-- 0001: core relational schema
--
-- Money is stored as BIGINT minor units (paise). Every row is owned by the
-- authenticated user (owner_id = auth.uid()); RLS lives in 0003.
-- =============================================================================

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.account_type as enum (
  'savings', 'current', 'salary', 'fixed_deposit', 'recurring_deposit', 'cash', 'wallet',
  'credit_card', 'debit_card', 'secured_credit_card', 'bnpl',
  'personal_loan', 'education_loan', 'vehicle_loan', 'home_loan', 'other_loan',
  'other_liability', 'other_asset', 'custom'
);
create type public.account_class as enum ('asset', 'liability');
create type public.account_status as enum ('active', 'archived', 'closed');
create type public.card_network as enum ('visa', 'mastercard', 'rupay', 'amex', 'diners', 'discover', 'jcb', 'unionpay', 'other');
create type public.loan_kind as enum ('two_wheeler', 'car', 'education', 'personal', 'home', 'gold', 'consumer_durable', 'other');
create type public.category_kind as enum ('expense', 'income');
create type public.person_relation as enum ('parent', 'family', 'friend', 'roommate', 'partner', 'colleague', 'other');
create type public.entry_type as enum (
  'income', 'expense', 'bank_deposit', 'bank_withdrawal', 'transfer', 'card_purchase', 'card_repayment',
  'loan_disbursement', 'loan_repayment', 'interest', 'bank_charges', 'refund',
  'reimbursement_received', 'reimbursement_paid', 'cash_withdrawal', 'cash_deposit', 'adjustment', 'opening_balance'
);
create type public.entry_status as enum ('posted', 'void');
create type public.entry_source as enum ('mobile', 'web', 'watch', 'widget', 'import', 'recurring', 'system');
create type public.posting_target as enum ('account', 'category', 'person', 'equity');
create type public.recurring_kind as enum ('emi', 'subscription', 'insurance', 'mobile', 'electricity', 'internet', 'rent', 'card_autopay', 'sip', 'income', 'transfer', 'other');
create type public.frequency as enum ('weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'half_yearly', 'yearly', 'custom_days');
create type public.occurrence_status as enum ('paid', 'skipped');
create type public.statement_status as enum ('open', 'partially_paid', 'paid', 'reconciled');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Luhn check over any 13–19 digit run: refuses full card numbers in free text.
create or replace function private.contains_pan(p_text text) returns boolean
language plpgsql immutable as $$
declare
  m text;
  s int;
  d int;
  alt boolean;
  i int;
begin
  if p_text is null then return false; end if;
  for m in select (regexp_matches(regexp_replace(p_text, '[\s-]', '', 'g'), '\d{13,19}', 'g'))[1] loop
    s := 0; alt := false;
    for i in reverse length(m)..1 loop
      d := substr(m, i, 1)::int;
      if alt then d := d * 2; if d > 9 then d := d - 9; end if; end if;
      s := s + d; alt := not alt;
    end loop;
    if s % 10 = 0 then return true; end if;
  end loop;
  return false;
end $$;

-- ---------------------------------------------------------------------------
-- Profile & preferences
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  base_currency char(3) not null default 'INR',
  locale text not null default 'en-IN',
  timezone text not null default 'Asia/Kolkata',
  date_format text not null default 'DD/MM/YYYY',
  dashboard jsonb,
  lock_timeout_seconds int not null default 60 check (lock_timeout_seconds between 0 and 3600),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text,
  logo_path text,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

-- ---------------------------------------------------------------------------
-- Accounts (banks, cards, wallets, cash, deposits, loans — all user-defined)
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  nickname text check (char_length(nickname) <= 40),
  type public.account_type not null,
  class public.account_class not null,
  custom_type_label text check (char_length(custom_type_label) <= 40),
  institution_id uuid references public.institutions (id) on delete set null,
  institution_name text check (char_length(institution_name) <= 60),
  currency char(3) not null default 'INR',
  last4 text check (last4 ~ '^\d{4}$'),
  color text,
  icon text,
  theme jsonb,
  artwork_path text,
  interest_rate_bps int check (interest_rate_bps between 0 and 10000),
  status public.account_status not null default 'active',
  include_in_net_worth boolean not null default true,
  is_liquid boolean not null default false,
  sort_order int not null default 0,
  notes text check (char_length(notes) <= 500),
  linked_account_id uuid references public.accounts (id) on delete set null,
  opened_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_no_pan check (not private.contains_pan(coalesce(name, '') || ' ' || coalesce(nickname, '') || ' ' || coalesce(notes, ''))),
  constraint accounts_debit_linked check (type <> 'debit_card' or linked_account_id is not null),
  constraint accounts_not_self_linked check (linked_account_id is null or linked_account_id <> id)
);
create index accounts_owner_idx on public.accounts (owner_id, status, sort_order);
create trigger accounts_touch before update on public.accounts for each row execute function private.touch_updated_at();

create table public.card_details (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  network public.card_network,
  variant text check (char_length(variant) <= 40),
  credit_limit bigint check (credit_limit >= 0),
  statement_day smallint check (statement_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  annual_fee bigint check (annual_fee >= 0),
  lifetime_free boolean not null default false,
  rewards_info text check (char_length(rewards_info) <= 300),
  reward_rate_bps int check (reward_rate_bps between 0 and 10000),
  min_due_bps int check (min_due_bps between 0 and 10000),
  updated_at timestamptz not null default now()
);

create table public.loan_details (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  loan_kind public.loan_kind not null default 'other',
  lender text check (char_length(lender) <= 60),
  principal_amount bigint check (principal_amount >= 0),
  interest_rate_bps int check (interest_rate_bps between 0 and 10000),
  emi_amount bigint check (emi_amount >= 0),
  tenure_months int check (tenure_months between 1 and 600),
  emi_day smallint check (emi_day between 1 and 31),
  start_date date,
  emi_account_id uuid references public.accounts (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- People & categories
-- ---------------------------------------------------------------------------
create table public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  relation public.person_relation not null default 'friend',
  color text,
  emoji text check (char_length(emoji) <= 8),
  phone text check (char_length(phone) <= 20),
  notes text check (char_length(notes) <= 500),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index people_owner_idx on public.people (owner_id, archived);
create trigger people_touch before update on public.people for each row execute function private.touch_updated_at();

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.category_kind not null,
  name text not null check (char_length(name) between 1 and 40),
  icon text,
  color text,
  parent_id uuid references public.categories (id) on delete set null,
  system_key text,
  archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (owner_id, kind, name)
);
create unique index categories_system_key_idx on public.categories (owner_id, system_key) where system_key is not null;

-- ---------------------------------------------------------------------------
-- Recurring obligations (tracked & reminded — never auto-paid)
-- ---------------------------------------------------------------------------
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind public.recurring_kind not null default 'other',
  amount bigint check (amount > 0),
  is_variable boolean not null default false,
  frequency public.frequency not null default 'monthly',
  interval_days int check (interval_days between 1 and 3660),
  start_on date not null,
  end_on date,
  max_occurrences int check (max_occurrences > 0),
  day_of_month smallint check (day_of_month between 1 and 31),
  source_account_id uuid references public.accounts (id) on delete set null,
  target_account_id uuid references public.accounts (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  person_id uuid references public.people (id) on delete set null,
  reminder_days_before int not null default 1 check (reminder_days_before between 0 and 30),
  reminder_time time not null default '09:00',
  is_active boolean not null default true,
  bank_autopay boolean not null default false,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_amount_known check (is_variable or amount is not null),
  constraint recurring_custom_interval check (frequency <> 'custom_days' or interval_days is not null),
  constraint recurring_dates check (end_on is null or end_on >= start_on)
);
create index recurring_owner_idx on public.recurring_rules (owner_id, is_active);
create trigger recurring_touch before update on public.recurring_rules for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Statements
-- ---------------------------------------------------------------------------
create table public.statements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  statement_date date not null,
  due_date date,
  statement_balance bigint not null,
  minimum_due bigint check (minimum_due >= 0),
  file_path text,
  status public.statement_status not null default 'open',
  reconciled_at timestamptz,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint statements_period check (period_end >= period_start),
  unique (account_id, statement_date)
);
create trigger statements_touch before update on public.statements for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  type public.entry_type not null,
  occurred_on date not null,
  description text not null check (char_length(description) between 1 and 140),
  amount bigint not null check (amount >= 0),
  currency char(3) not null default 'INR',
  category_id uuid references public.categories (id) on delete set null,
  primary_account_id uuid references public.accounts (id) on delete set null,
  instrument_id uuid references public.accounts (id) on delete set null,
  counterparty text check (char_length(counterparty) <= 80),
  notes text check (char_length(notes) <= 1000),
  tags text[] not null default '{}',
  status public.entry_status not null default 'posted',
  source public.entry_source not null default 'mobile',
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120),
  fingerprint text,
  related_entry_id uuid references public.entries (id) on delete set null,
  recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  recurring_due_on date,
  statement_id uuid references public.statements (id) on delete set null,
  version int not null default 1,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entries_no_pan check (not private.contains_pan(description || ' ' || coalesce(notes, ''))),
  constraint entries_recurring_pair check ((recurring_rule_id is null) = (recurring_due_on is null) or recurring_rule_id is null)
);
-- One submission = one entry, forever (retries, offline replays, watch re-sends).
create unique index entries_idempotency_idx on public.entries (owner_id, idempotency_key);
-- One confirmed payment per recurring occurrence.
create unique index entries_recurring_once_idx on public.entries (owner_id, recurring_rule_id, recurring_due_on) where status = 'posted' and recurring_rule_id is not null;
create index entries_owner_date_idx on public.entries (owner_id, occurred_on desc, created_at desc);
create index entries_fingerprint_idx on public.entries (owner_id, fingerprint);
create index entries_related_idx on public.entries (related_entry_id) where related_entry_id is not null;

create table public.postings (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  target public.posting_target not null,
  account_id uuid references public.accounts (id) on delete restrict,
  category_id uuid references public.categories (id) on delete restrict,
  person_id uuid references public.people (id) on delete restrict,
  amount bigint not null check (amount <> 0),
  memo text check (char_length(memo) <= 80),
  constraint postings_target_shape check (
    (target = 'account' and account_id is not null and category_id is null and person_id is null) or
    (target = 'category' and category_id is not null and account_id is null and person_id is null) or
    (target = 'person' and person_id is not null and account_id is null and category_id is null) or
    (target = 'equity' and account_id is null and category_id is null and person_id is null)
  )
);
create index postings_entry_idx on public.postings (entry_id);
create index postings_account_idx on public.postings (account_id) where account_id is not null;
create index postings_category_idx on public.postings (category_id) where category_id is not null;
create index postings_person_idx on public.postings (person_id) where person_id is not null;
create index postings_owner_idx on public.postings (owner_id);

-- Correction history: full snapshot (entry + postings) before every edit/void.
create table public.entry_revisions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  revision int not null,
  action text not null check (action in ('edit', 'void', 'restore')),
  snapshot jsonb not null,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  unique (entry_id, revision)
);

create table public.recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  rule_id uuid not null references public.recurring_rules (id) on delete cascade,
  due_on date not null,
  status public.occurrence_status not null,
  entry_id uuid references public.entries (id) on delete set null,
  amount bigint,
  resolved_at timestamptz not null default now(),
  unique (rule_id, due_on)
);
create index occurrences_owner_idx on public.recurring_occurrences (owner_id, due_on);

create table public.settlement_allocations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  settlement_entry_id uuid not null references public.entries (id) on delete cascade,
  claim_entry_id uuid not null references public.entries (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (settlement_entry_id, claim_entry_id)
);

create table public.statement_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  statement_id uuid not null references public.statements (id) on delete cascade,
  occurred_on date not null,
  description text not null check (char_length(description) <= 200),
  amount bigint not null,
  matched_entry_id uuid references public.entries (id) on delete set null,
  created_at timestamptz not null default now()
);
create index statement_lines_stmt_idx on public.statement_lines (statement_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id uuid references public.entries (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete cascade,
  statement_id uuid references public.statements (id) on delete cascade,
  path text not null,
  mime text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null,
  table_name text not null,
  record_id text not null,
  action text not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index audit_owner_idx on public.audit_log (owner_id, at desc);
