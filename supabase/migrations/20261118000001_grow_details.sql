-- =============================================================================
-- Folio 20261118000001: Grow details — per-type behaviour for FD / RD /
-- stocks / mutual funds: principal, rate, tenure, compounding for deposits,
-- invested amount and SIP plan for market accounts.
-- =============================================================================

create table public.grow_details (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Deposits (FD / RD). FD: one-time deposit amount. RD: monthly installment.
  principal_amount bigint check (principal_amount >= 0),
  interest_rate_bps int check (interest_rate_bps between 0 and 10000),
  start_date date,
  tenure_months smallint check (tenure_months between 1 and 600),
  compounding_per_year smallint not null default 4 check (compounding_per_year in (1, 2, 4, 12)),
  -- Market (stocks / mutual funds): money actually put in; current value is the ledger balance.
  invested_amount bigint check (invested_amount >= 0),
  sip_amount bigint check (sip_amount >= 0),
  sip_frequency text check (sip_frequency in ('daily', 'weekly', 'monthly')),
  updated_at timestamptz not null default now()
);
create index grow_details_owner_idx on public.grow_details (owner_id);
create trigger grow_details_touch before update on public.grow_details for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Security, audit, realtime — same shape as card_details / loan_details.
-- ---------------------------------------------------------------------------
alter table public.grow_details enable row level security;
create policy grow_details_select_own on public.grow_details for select to authenticated using (owner_id = (select auth.uid()));
create policy grow_details_insert_own on public.grow_details for insert to authenticated with check (owner_id = (select auth.uid()));
create policy grow_details_update_own on public.grow_details for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy grow_details_delete_own on public.grow_details for delete to authenticated using (owner_id = (select auth.uid()));

create or replace function private.enforce_owned_refs() returns trigger
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_owner uuid := new.owner_id;
begin
  if tg_table_name = 'accounts' then
    if new.linked_account_id is not null and not exists (select 1 from public.accounts where id = new.linked_account_id and owner_id = v_owner) then
      raise exception 'Unknown linked account' using errcode = 'P0001';
    end if;
    if new.institution_id is not null and not exists (select 1 from public.institutions where id = new.institution_id and owner_id = v_owner) then
      raise exception 'Unknown institution' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and new.class <> old.class and exists (select 1 from public.postings where account_id = new.id) then
      raise exception 'Cannot switch between asset and liability once the account has entries' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'recurring_rules' then
    if (new.source_account_id is not null and not exists (select 1 from public.accounts where id = new.source_account_id and owner_id = v_owner))
       or (new.target_account_id is not null and not exists (select 1 from public.accounts where id = new.target_account_id and owner_id = v_owner))
       or (new.category_id is not null and not exists (select 1 from public.categories where id = new.category_id and owner_id = v_owner))
       or (new.person_id is not null and not exists (select 1 from public.people where id = new.person_id and owner_id = v_owner)) then
      raise exception 'Recurring payment references something that is not yours' using errcode = 'P0001';
    end if;
  elsif tg_table_name in ('statements', 'card_details', 'loan_details', 'grow_details') then
    if not exists (select 1 from public.accounts where id = new.account_id and owner_id = v_owner) then
      raise exception 'Unknown account' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'statement_lines' then
    if not exists (select 1 from public.statements where id = new.statement_id and owner_id = v_owner)
       or (new.matched_entry_id is not null and not exists (select 1 from public.entries where id = new.matched_entry_id and owner_id = v_owner)) then
      raise exception 'Unknown statement or entry' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'categories' then
    if new.parent_id is not null and not exists (select 1 from public.categories where id = new.parent_id and owner_id = v_owner and kind = new.kind) then
      raise exception 'Parent category must be yours and of the same kind' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger grow_details_refs before insert or update on public.grow_details for each row execute function private.enforce_owned_refs();

grant select, insert, update, delete on public.grow_details to authenticated;

create trigger grow_details_audit after insert or update or delete on public.grow_details for each row execute function private.audit();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.grow_details';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- save_account grows a p_grow argument. Old callers without it keep working
-- (the parameter defaults to null = leave any existing grow details alone).
-- ---------------------------------------------------------------------------
drop function if exists public.save_account(jsonb, jsonb, jsonb, jsonb);
create or replace function public.save_account(p_account jsonb, p_card jsonb default null, p_loan jsonb default null, p_opening jsonb default null, p_grow jsonb default null)
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
      raise exception 'A debit card must be linked to a bank account' using errcode = 'P0001';
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
    if not found then raise exception 'Unknown account' using errcode = 'P0001'; end if;
    if v_acc.class <> v_class and exists (select 1 from public.postings where account_id = v_id) then
      raise exception 'Cannot switch between asset and liability once the account has entries' using errcode = 'P0001';
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

  if p_grow is not null and v_type in ('fixed_deposit', 'recurring_deposit', 'stocks', 'mutual_funds') then
    insert into public.grow_details (account_id, owner_id, principal_amount, interest_rate_bps, start_date, tenure_months, compounding_per_year, invested_amount, sip_amount, sip_frequency)
    values (
      v_acc.id, v_owner,
      nullif(p_grow->>'principal_amount', '')::bigint,
      nullif(p_grow->>'interest_rate_bps', '')::int,
      nullif(p_grow->>'start_date', '')::date,
      nullif(p_grow->>'tenure_months', '')::smallint,
      coalesce(nullif(p_grow->>'compounding_per_year', '')::smallint, 4),
      nullif(p_grow->>'invested_amount', '')::bigint,
      nullif(p_grow->>'sip_amount', '')::bigint,
      nullif(p_grow->>'sip_frequency', '')
    )
    on conflict (account_id) do update set
      principal_amount = excluded.principal_amount,
      interest_rate_bps = excluded.interest_rate_bps,
      start_date = excluded.start_date,
      tenure_months = excluded.tenure_months,
      compounding_per_year = excluded.compounding_per_year,
      invested_amount = excluded.invested_amount,
      sip_amount = excluded.sip_amount,
      sip_frequency = excluded.sip_frequency,
      updated_at = now();
  end if;

  if p_opening is not null and v_type <> 'debit_card' then
    perform private.set_opening(v_owner, v_acc, coalesce(nullif(p_opening->>'balance', '')::bigint, 0),
      coalesce(nullif(p_opening->>'on', '')::date, v_acc.opened_on, (now() at time zone 'Asia/Kolkata')::date));
  end if;
  return v_acc.id;
end $$;

grant execute on function public.save_account(jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
