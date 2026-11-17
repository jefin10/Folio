-- =============================================================================
-- Folio 0002: ledger engine — validation, atomic RPCs, balance views
--
-- Clients never insert into entries/postings directly (see 0003 grants). All
-- writes go through the SECURITY DEFINER functions below, which:
--   * check every referenced row belongs to auth.uid()
--   * enforce double-entry balance and per-type accounting rules
--   * are idempotent on (owner_id, idempotency_key)
--   * snapshot the previous version before any correction
-- A deferred constraint trigger re-checks balance at commit as a backstop.
-- =============================================================================

create or replace function private.account_class_for(p_type public.account_type, p_custom public.account_class)
returns public.account_class language sql immutable as $$
  select case
    when p_type in ('credit_card', 'secured_credit_card', 'bnpl', 'personal_loan', 'education_loan', 'vehicle_loan', 'home_loan', 'other_loan', 'other_liability') then 'liability'::public.account_class
    when p_type = 'custom' then coalesce(p_custom, 'asset'::public.account_class)
    else 'asset'::public.account_class
  end
$$;

create or replace function private.account_is_liquid(p_type public.account_type)
returns boolean language sql immutable as $$
  select p_type in ('savings', 'current', 'salary', 'cash', 'wallet')
$$;

create or replace function private.account_group(p_type public.account_type)
returns text language sql immutable as $$
  select case
    when p_type in ('savings', 'current', 'salary') then 'bank'
    when p_type in ('fixed_deposit', 'recurring_deposit') then 'deposit'
    when p_type = 'cash' then 'cash'
    when p_type = 'wallet' then 'wallet'
    when p_type in ('credit_card', 'secured_credit_card', 'bnpl') then 'credit'
    when p_type = 'debit_card' then 'debit'
    when p_type in ('personal_loan', 'education_loan', 'vehicle_loan', 'home_loan', 'other_loan') then 'loan'
    else 'other'
  end
$$;

create or replace function private.require_uid() returns uuid
language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Validation (mirror of packages/core/src/ledger.ts validateEntry)
-- ---------------------------------------------------------------------------
create or replace function private.validate_entry(p_entry_id uuid) returns void
language plpgsql as $$
declare
  e public.entries;
  v_sum bigint;
  v_count int;
  v_accounts int;
  r record;
begin
  select * into e from public.entries where id = p_entry_id;
  if not found or e.status = 'void' then return; end if;

  select coalesce(sum(amount), 0), count(*), count(*) filter (where target = 'account')
    into v_sum, v_count, v_accounts
  from public.postings where entry_id = p_entry_id;

  if v_count < 2 then
    raise exception 'An entry needs at least two legs' using errcode = 'P0001', hint = 'too_few_postings';
  end if;
  if v_sum <> 0 then
    raise exception 'Entry does not balance (off by % paise)', v_sum using errcode = 'P0001', hint = 'unbalanced';
  end if;

  -- Transfers between own accounts: only account legs, plus an optional fee (expense debit).
  if e.type in ('transfer', 'card_repayment', 'cash_withdrawal', 'cash_deposit') then
    if exists (
      select 1 from public.postings p
      left join public.categories c on c.id = p.category_id
      where p.entry_id = p_entry_id
        and (p.target in ('person', 'equity') or (p.target = 'category' and (p.amount < 0 or c.kind <> 'expense')))
    ) then
      raise exception 'Transfers may only move money between your accounts' using errcode = 'P0001', hint = 'transfer_with_category';
    end if;
    if v_accounts < 2 then
      raise exception 'A transfer needs two accounts' using errcode = 'P0001', hint = 'transfer_one_account';
    end if;
  end if;

  if e.type in ('reimbursement_received', 'reimbursement_paid')
     and exists (select 1 from public.postings where entry_id = p_entry_id and target = 'category') then
    raise exception 'Reimbursements are never income or expense' using errcode = 'P0001', hint = 'reimbursement_category';
  end if;

  if e.type not in ('opening_balance', 'adjustment')
     and exists (select 1 from public.postings where entry_id = p_entry_id and target = 'equity') then
    raise exception 'Only opening balances and corrections can use equity' using errcode = 'P0001', hint = 'equity_misuse';
  end if;

  for r in
    select p.target, c.kind as cat_kind, a.type as acc_type, a.currency as acc_currency, a.status as acc_status
    from public.postings p
    left join public.categories c on c.id = p.category_id
    left join public.accounts a on a.id = p.account_id
    where p.entry_id = p_entry_id
  loop
    if r.target = 'account' then
      if r.acc_type = 'debit_card' then
        raise exception 'Debit cards have no balance; post to the linked bank account' using errcode = 'P0001', hint = 'debit_card_posting';
      end if;
      if r.acc_currency <> e.currency then
        raise exception 'All accounts in an entry must use %', e.currency using errcode = 'P0001', hint = 'currency_mismatch';
      end if;
      if r.acc_status = 'closed' then
        raise exception 'Cannot post to a closed account' using errcode = 'P0001', hint = 'closed_account';
      end if;
    elsif r.target = 'category' then
      if r.cat_kind = 'income' and e.type not in ('income', 'interest', 'bank_deposit') then
        raise exception 'A % can never be income', replace(e.type::text, '_', ' ') using errcode = 'P0001', hint = 'income_misuse';
      end if;
      if r.cat_kind = 'expense' and e.type in ('income', 'bank_deposit') then
        raise exception 'Income cannot be booked to an expense category' using errcode = 'P0001', hint = 'expense_misuse';
      end if;
    end if;
  end loop;
end $$;

-- Deferred backstop: whatever path wrote postings, the entry must balance at commit.
create or replace function private.check_entry_balanced() returns trigger
language plpgsql as $$
declare
  v_entry uuid := coalesce(new.entry_id, old.entry_id);
begin
  if exists (select 1 from public.entries where id = v_entry and status = 'posted') then
    perform private.validate_entry(v_entry);
  end if;
  return null;
end $$;

create constraint trigger postings_balanced
  after insert or update or delete on public.postings
  deferrable initially deferred
  for each row execute function private.check_entry_balanced();

create or replace function private.check_entry_row_balanced() returns trigger
language plpgsql as $$
begin
  if new.status = 'posted' then
    perform private.validate_entry(new.id);
  end if;
  return null;
end $$;

create constraint trigger entries_balanced
  after insert or update on public.entries
  deferrable initially deferred
  for each row execute function private.check_entry_row_balanced();

-- ---------------------------------------------------------------------------
-- Ownership checks
-- ---------------------------------------------------------------------------
create or replace function private.assert_account(p_owner uuid, p_id uuid) returns public.accounts
language plpgsql stable as $$
declare a public.accounts;
begin
  select * into a from public.accounts where id = p_id and owner_id = p_owner;
  if not found then raise exception 'Unknown account' using errcode = 'P0001', hint = 'unknown_account'; end if;
  return a;
end $$;

create or replace function private.assert_owned_refs(p_owner uuid, p_entry jsonb) returns void
language plpgsql stable as $$
begin
  if nullif(p_entry->>'category_id', '') is not null
     and not exists (select 1 from public.categories where id = (p_entry->>'category_id')::uuid and owner_id = p_owner) then
    raise exception 'Unknown category' using errcode = 'P0001', hint = 'unknown_category';
  end if;
  if nullif(p_entry->>'primary_account_id', '') is not null then perform private.assert_account(p_owner, (p_entry->>'primary_account_id')::uuid); end if;
  if nullif(p_entry->>'instrument_id', '') is not null then perform private.assert_account(p_owner, (p_entry->>'instrument_id')::uuid); end if;
  if nullif(p_entry->>'related_entry_id', '') is not null
     and not exists (select 1 from public.entries where id = (p_entry->>'related_entry_id')::uuid and owner_id = p_owner) then
    raise exception 'Unknown related entry' using errcode = 'P0001', hint = 'unknown_entry';
  end if;
  if nullif(p_entry->>'recurring_rule_id', '') is not null
     and not exists (select 1 from public.recurring_rules where id = (p_entry->>'recurring_rule_id')::uuid and owner_id = p_owner) then
    raise exception 'Unknown recurring payment' using errcode = 'P0001', hint = 'unknown_rule';
  end if;
  if nullif(p_entry->>'statement_id', '') is not null
     and not exists (select 1 from public.statements where id = (p_entry->>'statement_id')::uuid and owner_id = p_owner) then
    raise exception 'Unknown statement' using errcode = 'P0001', hint = 'unknown_statement';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Writing postings
-- ---------------------------------------------------------------------------
create or replace function private.write_postings(p_owner uuid, p_entry_id uuid, p_postings jsonb) returns void
language plpgsql as $$
declare
  p jsonb;
  v_target public.posting_target;
  v_amount bigint;
begin
  if p_postings is null or jsonb_typeof(p_postings) <> 'array' or jsonb_array_length(p_postings) < 2 then
    raise exception 'An entry needs at least two legs' using errcode = 'P0001', hint = 'too_few_postings';
  end if;
  for p in select * from jsonb_array_elements(p_postings) loop
    v_target := (p->>'target')::public.posting_target;
    v_amount := (p->>'amount')::bigint;
    if v_amount = 0 then
      raise exception 'Zero-amount leg' using errcode = 'P0001', hint = 'zero_posting';
    end if;
    if v_target = 'account' then
      perform private.assert_account(p_owner, (p->>'account_id')::uuid);
    elsif v_target = 'category' then
      if not exists (select 1 from public.categories where id = (p->>'category_id')::uuid and owner_id = p_owner) then
        raise exception 'Unknown category' using errcode = 'P0001', hint = 'unknown_category';
      end if;
    elsif v_target = 'person' then
      if not exists (select 1 from public.people where id = (p->>'person_id')::uuid and owner_id = p_owner) then
        raise exception 'Unknown person' using errcode = 'P0001', hint = 'unknown_person';
      end if;
    end if;
    insert into public.postings (entry_id, owner_id, target, account_id, category_id, person_id, amount, memo)
    values (
      p_entry_id, p_owner, v_target,
      case when v_target = 'account' then (p->>'account_id')::uuid end,
      case when v_target = 'category' then (p->>'category_id')::uuid end,
      case when v_target = 'person' then (p->>'person_id')::uuid end,
      v_amount,
      left(nullif(p->>'memo', ''), 80)
    );
  end loop;
end $$;

create or replace function private.fingerprint(p_type public.entry_type, p_amount bigint, p_on date, p_account uuid, p_desc text)
returns text language sql immutable as $$
  select md5(p_type::text || '|' || p_amount::text || '|' || p_on::text || '|' || coalesce(p_account::text, '-') || '|' || lower(regexp_replace(coalesce(p_desc, ''), '[^a-zA-Z0-9]+', '', 'g')))
$$;

create or replace function private.insert_entry(p_owner uuid, p_entry jsonb, p_postings jsonb) returns uuid
language plpgsql as $$
declare
  v_id uuid;
  v_type public.entry_type := (p_entry->>'type')::public.entry_type;
  v_amount bigint := (p_entry->>'amount')::bigint;
  v_on date := (p_entry->>'occurred_on')::date;
begin
  perform private.assert_owned_refs(p_owner, p_entry);
  insert into public.entries (
    owner_id, type, occurred_on, description, amount, currency, category_id, primary_account_id, instrument_id,
    counterparty, notes, tags, status, source, idempotency_key, fingerprint, related_entry_id,
    recurring_rule_id, recurring_due_on, statement_id
  ) values (
    p_owner, v_type, v_on,
    left(coalesce(nullif(trim(p_entry->>'description'), ''), initcap(replace(v_type::text, '_', ' '))), 140),
    v_amount,
    coalesce(nullif(p_entry->>'currency', ''), 'INR'),
    nullif(p_entry->>'category_id', '')::uuid,
    nullif(p_entry->>'primary_account_id', '')::uuid,
    nullif(p_entry->>'instrument_id', '')::uuid,
    nullif(trim(p_entry->>'counterparty'), ''),
    nullif(trim(p_entry->>'notes'), ''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_entry->'tags', '[]'::jsonb)) x), '{}'),
    'posted',
    coalesce(nullif(p_entry->>'source', ''), 'mobile')::public.entry_source,
    p_entry->>'idempotency_key',
    private.fingerprint(v_type, v_amount, v_on, nullif(p_entry->>'primary_account_id', '')::uuid, p_entry->>'description'),
    nullif(p_entry->>'related_entry_id', '')::uuid,
    nullif(p_entry->>'recurring_rule_id', '')::uuid,
    nullif(p_entry->>'recurring_due_on', '')::date,
    nullif(p_entry->>'statement_id', '')::uuid
  ) returning id into v_id;

  perform private.write_postings(p_owner, v_id, p_postings);
  perform private.validate_entry(v_id);
  return v_id;
end $$;

create or replace function private.snapshot_entry(p_entry_id uuid, p_action text, p_reason text) returns void
language plpgsql as $$
declare
  v_snapshot jsonb;
  v_rev int;
  v_owner uuid;
begin
  select to_jsonb(e) || jsonb_build_object('postings', coalesce((select jsonb_agg(to_jsonb(p) order by p.amount) from public.postings p where p.entry_id = e.id), '[]'::jsonb)), e.owner_id
    into v_snapshot, v_owner
  from public.entries e where e.id = p_entry_id;
  select coalesce(max(revision), 0) + 1 into v_rev from public.entry_revisions where entry_id = p_entry_id;
  insert into public.entry_revisions (entry_id, owner_id, revision, action, snapshot, reason)
  values (p_entry_id, v_owner, v_rev, p_action, v_snapshot, left(p_reason, 200));
end $$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

-- Post a new entry. Idempotent: replaying the same idempotency_key returns the
-- original entry and never creates a second one.
create or replace function public.post_entry(p_entry jsonb, p_postings jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_owner uuid := private.require_uid();
  v_existing uuid;
  v_id uuid;
begin
  if coalesce(p_entry->>'idempotency_key', '') = '' then
    raise exception 'Missing idempotency key' using errcode = 'P0001', hint = 'missing_idempotency_key';
  end if;
  select id into v_existing from public.entries where owner_id = v_owner and idempotency_key = p_entry->>'idempotency_key';
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'created', false);
  end if;
  begin
    v_id := private.insert_entry(v_owner, p_entry, p_postings);
  exception when unique_violation then
    select id into v_existing from public.entries where owner_id = v_owner and idempotency_key = p_entry->>'idempotency_key';
    if v_existing is not null then
      return jsonb_build_object('id', v_existing, 'created', false);
    end if;
    raise;
  end;
  return jsonb_build_object('id', v_id, 'created', true);
end $$;

-- Correct an entry. Optimistic concurrency on `version`; full snapshot kept.
create or replace function public.update_entry(p_entry_id uuid, p_expected_version int, p_entry jsonb, p_postings jsonb, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_owner uuid := private.require_uid();
  e public.entries;
  v_type public.entry_type := (p_entry->>'type')::public.entry_type;
  v_amount bigint := (p_entry->>'amount')::bigint;
  v_on date := (p_entry->>'occurred_on')::date;
begin
  select * into e from public.entries where id = p_entry_id and owner_id = v_owner for update;
  if not found then raise exception 'Entry not found' using errcode = 'P0001', hint = 'unknown_entry'; end if;
  if e.status = 'void' then raise exception 'Voided entries cannot be edited' using errcode = 'P0001', hint = 'entry_void'; end if;
  if p_expected_version is not null and e.version <> p_expected_version then
    raise exception 'This entry changed on another device. Reload and try again.' using errcode = 'P0001', hint = 'version_conflict';
  end if;
  perform private.assert_owned_refs(v_owner, p_entry);
  perform private.snapshot_entry(p_entry_id, 'edit', p_reason);

  update public.entries set
    type = v_type,
    occurred_on = v_on,
    description = left(coalesce(nullif(trim(p_entry->>'description'), ''), e.description), 140),
    amount = v_amount,
    category_id = nullif(p_entry->>'category_id', '')::uuid,
    primary_account_id = nullif(p_entry->>'primary_account_id', '')::uuid,
    instrument_id = nullif(p_entry->>'instrument_id', '')::uuid,
    counterparty = nullif(trim(p_entry->>'counterparty'), ''),
    notes = nullif(trim(p_entry->>'notes'), ''),
    tags = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_entry->'tags', '[]'::jsonb)) x), '{}'),
    related_entry_id = nullif(p_entry->>'related_entry_id', '')::uuid,
    statement_id = nullif(p_entry->>'statement_id', '')::uuid,
    fingerprint = private.fingerprint(v_type, v_amount, v_on, nullif(p_entry->>'primary_account_id', '')::uuid, p_entry->>'description'),
    version = e.version + 1
  where id = p_entry_id;

  delete from public.postings where entry_id = p_entry_id;
  perform private.write_postings(v_owner, p_entry_id, p_postings);
  perform private.validate_entry(p_entry_id);
  -- Allocations may no longer fit the corrected amounts; let FIFO recompute.
  delete from public.settlement_allocations where settlement_entry_id = p_entry_id or claim_entry_id = p_entry_id;
  return jsonb_build_object('id', p_entry_id, 'version', e.version + 1);
end $$;

-- Void (soft-delete) an entry. Balances ignore void entries. A voided
-- recurring payment re-opens its occurrence so it can be confirmed again.
create or replace function public.void_entry(p_entry_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_owner uuid := private.require_uid();
  e public.entries;
begin
  select * into e from public.entries where id = p_entry_id and owner_id = v_owner for update;
  if not found then raise exception 'Entry not found' using errcode = 'P0001', hint = 'unknown_entry'; end if;
  if e.status = 'void' then return jsonb_build_object('id', p_entry_id, 'status', 'void'); end if;
  perform private.snapshot_entry(p_entry_id, 'void', p_reason);
  update public.entries set status = 'void', voided_at = now(), void_reason = left(p_reason, 200), version = version + 1 where id = p_entry_id;
  delete from public.recurring_occurrences where entry_id = p_entry_id;
  delete from public.settlement_allocations where settlement_entry_id = p_entry_id or claim_entry_id = p_entry_id;
  return jsonb_build_object('id', p_entry_id, 'status', 'void');
end $$;

create or replace function public.restore_entry(p_entry_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_owner uuid := private.require_uid();
  e public.entries;
begin
  select * into e from public.entries where id = p_entry_id and owner_id = v_owner for update;
  if not found then raise exception 'Entry not found' using errcode = 'P0001', hint = 'unknown_entry'; end if;
  if e.status = 'posted' then return jsonb_build_object('id', p_entry_id, 'status', 'posted'); end if;
  perform private.snapshot_entry(p_entry_id, 'restore', null);
  update public.entries set status = 'posted', voided_at = null, void_reason = null, version = version + 1 where id = p_entry_id;
  perform private.validate_entry(p_entry_id);
  if e.recurring_rule_id is not null then
    insert into public.recurring_occurrences (owner_id, rule_id, due_on, status, entry_id, amount)
    values (v_owner, e.recurring_rule_id, e.recurring_due_on, 'paid', e.id, e.amount)
    on conflict (rule_id, due_on) do nothing;
  end if;
  return jsonb_build_object('id', p_entry_id, 'status', 'posted');
end $$;

-- Confirm that a recurring obligation was actually paid. Exactly once per
-- (rule, due date): a second confirmation returns the first entry.
create or replace function public.confirm_occurrence(p_rule_id uuid, p_due_on date, p_entry jsonb, p_postings jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_owner uuid := private.require_uid();
  v_existing public.recurring_occurrences;
  v_id uuid;
begin
  if not exists (select 1 from public.recurring_rules where id = p_rule_id and owner_id = v_owner) then
    raise exception 'Unknown recurring payment' using errcode = 'P0001', hint = 'unknown_rule';
  end if;
  -- Serialise concurrent confirmations of the same occurrence.
  perform pg_advisory_xact_lock(hashtextextended(p_rule_id::text || p_due_on::text, 0));
  select * into v_existing from public.recurring_occurrences where rule_id = p_rule_id and due_on = p_due_on;
  if found then
    return jsonb_build_object('id', v_existing.entry_id, 'created', false, 'status', v_existing.status);
  end if;
  select id into v_id from public.entries where owner_id = v_owner and idempotency_key = p_entry->>'idempotency_key';
  if v_id is null then
    v_id := private.insert_entry(
      v_owner,
      p_entry || jsonb_build_object('recurring_rule_id', p_rule_id, 'recurring_due_on', p_due_on, 'source', coalesce(nullif(p_entry->>'source', ''), 'recurring')),
      p_postings
    );
  end if;
  insert into public.recurring_occurrences (owner_id, rule_id, due_on, status, entry_id, amount)
  values (v_owner, p_rule_id, p_due_on, 'paid', v_id, (p_entry->>'amount')::bigint);
  return jsonb_build_object('id', v_id, 'created', true, 'status', 'paid');
end $$;

create or replace function public.skip_occurrence(p_rule_id uuid, p_due_on date)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_owner uuid := private.require_uid();
begin
  if not exists (select 1 from public.recurring_rules where id = p_rule_id and owner_id = v_owner) then
    raise exception 'Unknown recurring payment' using errcode = 'P0001', hint = 'unknown_rule';
  end if;
  insert into public.recurring_occurrences (owner_id, rule_id, due_on, status)
  values (v_owner, p_rule_id, p_due_on, 'skipped')
  on conflict (rule_id, due_on) do nothing;
end $$;

create or replace function public.unskip_occurrence(p_rule_id uuid, p_due_on date)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_owner uuid := private.require_uid();
begin
  delete from public.recurring_occurrences where rule_id = p_rule_id and due_on = p_due_on and owner_id = v_owner and status = 'skipped';
end $$;

-- Explicitly choose which purchases a reimbursement settles.
create or replace function public.set_settlement_allocations(p_settlement_entry_id uuid, p_allocations jsonb)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_owner uuid := private.require_uid();
  a jsonb;
  v_person uuid;
  v_available bigint;
  v_total bigint := 0;
  v_claim bigint;
begin
  if not exists (select 1 from public.entries where id = p_settlement_entry_id and owner_id = v_owner and status = 'posted') then
    raise exception 'Unknown settlement' using errcode = 'P0001', hint = 'unknown_entry';
  end if;
  delete from public.settlement_allocations where settlement_entry_id = p_settlement_entry_id;
  for a in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    v_person := (a->>'person_id')::uuid;
    select -coalesce(sum(amount), 0) into v_available from public.postings
      where entry_id = p_settlement_entry_id and person_id = v_person and amount < 0;
    select coalesce(sum(p.amount), 0) into v_claim from public.postings p join public.entries e on e.id = p.entry_id
      where p.entry_id = (a->>'claim_entry_id')::uuid and p.person_id = v_person and p.amount > 0 and e.owner_id = v_owner and e.status = 'posted';
    if v_claim = 0 then
      raise exception 'That purchase has no share owed by this person' using errcode = 'P0001', hint = 'bad_claim';
    end if;
    if (a->>'amount')::bigint > v_claim then
      raise exception 'Allocation exceeds what was owed on that purchase' using errcode = 'P0001', hint = 'allocation_exceeds_claim';
    end if;
    v_total := v_total + (a->>'amount')::bigint;
    if v_total > v_available then
      raise exception 'Allocations exceed the amount received' using errcode = 'P0001', hint = 'allocation_exceeds_settlement';
    end if;
    insert into public.settlement_allocations (owner_id, settlement_entry_id, claim_entry_id, person_id, amount)
    values (v_owner, p_settlement_entry_id, (a->>'claim_entry_id')::uuid, v_person, (a->>'amount')::bigint);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Accounts: create/update with card or loan details and opening balance, atomically.
-- ---------------------------------------------------------------------------
create or replace function private.set_opening(p_owner uuid, p_account public.accounts, p_balance bigint, p_on date) returns void
language plpgsql as $$
declare
  v_key text := 'opening:' || p_account.id::text;
  v_entry public.entries;
  v_signed bigint;
  v_postings jsonb;
begin
  select * into v_entry from public.entries where owner_id = p_owner and idempotency_key = v_key for update;
  v_signed := case when p_account.class = 'asset' then p_balance else -p_balance end;
  v_postings := jsonb_build_array(
    jsonb_build_object('target', 'account', 'account_id', p_account.id, 'amount', v_signed, 'memo', 'Opening balance'),
    jsonb_build_object('target', 'equity', 'amount', -v_signed, 'memo', 'Opening balance')
  );
  if v_entry.id is null then
    if p_balance = 0 then return; end if;
    perform private.insert_entry(p_owner, jsonb_build_object(
      'type', 'opening_balance', 'occurred_on', p_on, 'description', 'Opening balance', 'amount', abs(p_balance),
      'currency', p_account.currency, 'primary_account_id', p_account.id, 'source', 'system', 'idempotency_key', v_key
    ), v_postings);
    return;
  end if;
  -- Correct an existing opening balance, keeping history.
  if v_entry.status = 'posted' and v_entry.occurred_on = p_on and v_entry.amount = abs(p_balance)
     and exists (select 1 from public.postings where entry_id = v_entry.id and account_id = p_account.id and amount = v_signed) then
    return; -- unchanged
  end if;
  perform private.snapshot_entry(v_entry.id, 'edit', 'Opening balance corrected');
  if p_balance = 0 then
    update public.entries set status = 'void', voided_at = now(), void_reason = 'Opening balance set to zero', version = version + 1 where id = v_entry.id;
    return;
  end if;
  update public.entries set status = 'posted', voided_at = null, void_reason = null, occurred_on = p_on, amount = abs(p_balance), version = version + 1 where id = v_entry.id;
  delete from public.postings where entry_id = v_entry.id;
  perform private.write_postings(p_owner, v_entry.id, v_postings);
  perform private.validate_entry(v_entry.id);
end $$;

create or replace function public.save_account(p_account jsonb, p_card jsonb default null, p_loan jsonb default null, p_opening jsonb default null)
returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_owner uuid := private.require_uid();
  v_id uuid := nullif(p_account->>'id', '')::uuid;
  v_type public.account_type := (p_account->>'type')::public.account_type;
  v_class public.account_class := private.account_class_for(v_type, nullif(p_account->>'custom_class', '')::public.account_class);
  v_acc public.accounts;
  v_linked uuid := nullif(p_account->>'linked_account_id', '')::uuid;
  v_emi_acc uuid := nullif(p_loan->>'emi_account_id', '')::uuid;
begin
  if v_linked is not null then
    perform private.assert_account(v_owner, v_linked);
    if private.account_group((select type from public.accounts where id = v_linked)) not in ('bank', 'wallet') then
      raise exception 'A debit card must be linked to a bank account' using errcode = 'P0001', hint = 'bad_link';
    end if;
  end if;
  if v_emi_acc is not null then perform private.assert_account(v_owner, v_emi_acc); end if;

  if v_id is null then
    insert into public.accounts (
      owner_id, name, nickname, type, class, custom_type_label, institution_name, currency, last4, color, icon, theme,
      artwork_path, interest_rate_bps, include_in_net_worth, is_liquid, sort_order, notes, linked_account_id, opened_on
    ) values (
      v_owner, trim(p_account->>'name'), nullif(trim(p_account->>'nickname'), ''), v_type, v_class,
      nullif(trim(p_account->>'custom_type_label'), ''), nullif(trim(p_account->>'institution_name'), ''),
      coalesce(nullif(p_account->>'currency', ''), 'INR'), nullif(p_account->>'last4', ''),
      nullif(p_account->>'color', ''), nullif(p_account->>'icon', ''), p_account->'theme',
      nullif(p_account->>'artwork_path', ''), nullif(p_account->>'interest_rate_bps', '')::int,
      coalesce((p_account->>'include_in_net_worth')::boolean, true),
      coalesce((p_account->>'is_liquid')::boolean, private.account_is_liquid(v_type)),
      coalesce(nullif(p_account->>'sort_order', '')::int, (select coalesce(max(sort_order), -1) + 1 from public.accounts where owner_id = v_owner)),
      nullif(trim(p_account->>'notes'), ''), v_linked,
      coalesce(nullif(p_account->>'opened_on', '')::date, (now() at time zone 'Asia/Kolkata')::date)
    ) returning * into v_acc;
  else
    select * into v_acc from public.accounts where id = v_id and owner_id = v_owner for update;
    if not found then raise exception 'Unknown account' using errcode = 'P0001', hint = 'unknown_account'; end if;
    if v_acc.class <> v_class and exists (select 1 from public.postings where account_id = v_id) then
      raise exception 'Cannot switch between asset and liability once the account has entries' using errcode = 'P0001', hint = 'class_change';
    end if;
    update public.accounts set
      name = trim(p_account->>'name'),
      nickname = nullif(trim(p_account->>'nickname'), ''),
      type = v_type,
      class = v_class,
      custom_type_label = nullif(trim(p_account->>'custom_type_label'), ''),
      institution_name = nullif(trim(p_account->>'institution_name'), ''),
      last4 = nullif(p_account->>'last4', ''),
      color = nullif(p_account->>'color', ''),
      icon = nullif(p_account->>'icon', ''),
      theme = coalesce(p_account->'theme', theme),
      artwork_path = case when p_account ? 'artwork_path' then nullif(p_account->>'artwork_path', '') else artwork_path end,
      interest_rate_bps = nullif(p_account->>'interest_rate_bps', '')::int,
      include_in_net_worth = coalesce((p_account->>'include_in_net_worth')::boolean, include_in_net_worth),
      is_liquid = coalesce((p_account->>'is_liquid')::boolean, is_liquid),
      notes = nullif(trim(p_account->>'notes'), ''),
      linked_account_id = v_linked,
      opened_on = coalesce(nullif(p_account->>'opened_on', '')::date, opened_on)
    where id = v_id
    returning * into v_acc;
  end if;

  if p_card is not null and private.account_group(v_type) = 'credit' then
    insert into public.card_details (account_id, owner_id, network, variant, credit_limit, statement_day, due_day, annual_fee, lifetime_free, rewards_info, reward_rate_bps, min_due_bps)
    values (
      v_acc.id, v_owner, nullif(p_card->>'network', '')::public.card_network, nullif(trim(p_card->>'variant'), ''),
      nullif(p_card->>'credit_limit', '')::bigint, nullif(p_card->>'statement_day', '')::smallint, nullif(p_card->>'due_day', '')::smallint,
      nullif(p_card->>'annual_fee', '')::bigint, coalesce((p_card->>'lifetime_free')::boolean, false),
      nullif(trim(p_card->>'rewards_info'), ''), nullif(p_card->>'reward_rate_bps', '')::int, nullif(p_card->>'min_due_bps', '')::int
    )
    on conflict (account_id) do update set
      network = excluded.network, variant = excluded.variant, credit_limit = excluded.credit_limit,
      statement_day = excluded.statement_day, due_day = excluded.due_day, annual_fee = excluded.annual_fee,
      lifetime_free = excluded.lifetime_free, rewards_info = excluded.rewards_info,
      reward_rate_bps = excluded.reward_rate_bps, min_due_bps = excluded.min_due_bps, updated_at = now();
  end if;

  if p_loan is not null and private.account_group(v_type) = 'loan' then
    insert into public.loan_details (account_id, owner_id, loan_kind, lender, principal_amount, interest_rate_bps, emi_amount, tenure_months, emi_day, start_date, emi_account_id)
    values (
      v_acc.id, v_owner, coalesce(nullif(p_loan->>'loan_kind', ''), 'other')::public.loan_kind, nullif(trim(p_loan->>'lender'), ''),
      nullif(p_loan->>'principal_amount', '')::bigint, nullif(p_loan->>'interest_rate_bps', '')::int, nullif(p_loan->>'emi_amount', '')::bigint,
      nullif(p_loan->>'tenure_months', '')::int, nullif(p_loan->>'emi_day', '')::smallint, nullif(p_loan->>'start_date', '')::date, v_emi_acc
    )
    on conflict (account_id) do update set
      loan_kind = excluded.loan_kind, lender = excluded.lender, principal_amount = excluded.principal_amount,
      interest_rate_bps = excluded.interest_rate_bps, emi_amount = excluded.emi_amount, tenure_months = excluded.tenure_months,
      emi_day = excluded.emi_day, start_date = excluded.start_date, emi_account_id = excluded.emi_account_id, updated_at = now();
  end if;

  if p_opening is not null and v_type <> 'debit_card' then
    perform private.set_opening(v_owner, v_acc, coalesce(nullif(p_opening->>'balance', '')::bigint, 0),
      coalesce(nullif(p_opening->>'on', '')::date, v_acc.opened_on, (now() at time zone 'Asia/Kolkata')::date));
  end if;
  return v_acc.id;
end $$;

create or replace function public.reorder_accounts(p_ids uuid[])
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_owner uuid := private.require_uid();
begin
  update public.accounts a set sort_order = x.ord - 1
  from unnest(p_ids) with ordinality as x(id, ord)
  where a.id = x.id and a.owner_id = v_owner;
end $$;

-- ---------------------------------------------------------------------------
-- Views (security_invoker: RLS of the caller applies)
-- ---------------------------------------------------------------------------
create or replace view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.owner_id,
  coalesce(s.ledger_sum, 0)::bigint as ledger_sum,
  (case when a.class = 'asset' then coalesce(s.ledger_sum, 0) else -coalesce(s.ledger_sum, 0) end)::bigint as balance,
  s.last_activity_on,
  coalesce(s.posting_count, 0)::int as posting_count
from public.accounts a
left join (
  select p.account_id, sum(p.amount) as ledger_sum, max(e.occurred_on) as last_activity_on, count(*) as posting_count
  from public.postings p
  join public.entries e on e.id = p.entry_id and e.status = 'posted'
  where p.target = 'account'
  group by p.account_id
) s on s.account_id = a.id;

create or replace view public.person_balances with (security_invoker = true) as
select
  pe.id as person_id,
  pe.owner_id,
  coalesce(s.paid_on_behalf, 0)::bigint as paid_on_behalf,
  coalesce(s.reimbursed, 0)::bigint as reimbursed,
  coalesce(s.outstanding, 0)::bigint as outstanding,
  s.last_activity_on
from public.people pe
left join (
  select p.person_id,
    sum(p.amount) filter (where p.amount > 0) as paid_on_behalf,
    -sum(p.amount) filter (where p.amount < 0) as reimbursed,
    sum(p.amount) as outstanding,
    max(e.occurred_on) as last_activity_on
  from public.postings p
  join public.entries e on e.id = p.entry_id and e.status = 'posted'
  where p.target = 'person'
  group by p.person_id
) s on s.person_id = pe.id;

-- Month × category totals (natural sign: spending positive, income positive).
create or replace view public.monthly_category_totals with (security_invoker = true) as
select
  e.owner_id,
  to_char(e.occurred_on, 'YYYY-MM') as month,
  p.category_id,
  c.kind,
  (case when c.kind = 'expense' then sum(p.amount) else -sum(p.amount) end)::bigint as amount,
  count(*)::int as legs
from public.postings p
join public.entries e on e.id = p.entry_id and e.status = 'posted'
join public.categories c on c.id = p.category_id
where p.target = 'category'
group by e.owner_id, to_char(e.occurred_on, 'YYYY-MM'), p.category_id, c.kind;

-- Month summary: income, personal spend, paid for others, paid back. Transfers excluded by construction.
create or replace view public.monthly_summary with (security_invoker = true) as
select
  e.owner_id,
  to_char(e.occurred_on, 'YYYY-MM') as month,
  coalesce(-sum(p.amount) filter (where p.target = 'category' and c.kind = 'income'), 0)::bigint as income,
  coalesce(sum(p.amount) filter (where p.target = 'category' and c.kind = 'expense'), 0)::bigint as personal_expense,
  coalesce(sum(p.amount) filter (where p.target = 'person' and e.type in ('expense', 'card_purchase', 'refund', 'bank_withdrawal', 'loan_disbursement')), 0)::bigint as reimbursable,
  coalesce(-sum(p.amount) filter (where p.target = 'person' and e.type = 'reimbursement_received'), 0)::bigint as reimbursements_received
from public.entries e
join public.postings p on p.entry_id = e.id
left join public.categories c on c.id = p.category_id
where e.status = 'posted'
group by e.owner_id, to_char(e.occurred_on, 'YYYY-MM');
