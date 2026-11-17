-- =============================================================================
-- Folio 0003: Row Level Security, grants, audit trail, storage, realtime,
-- new-user bootstrap.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- RLS: every table is visible only to its owner.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'institutions', 'accounts', 'card_details', 'loan_details', 'people', 'categories', 'recurring_rules',
    'statements', 'statement_lines', 'entries', 'postings', 'entry_revisions', 'recurring_occurrences',
    'settlement_allocations', 'attachments', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t || '_select_own', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Directly writable configuration tables (ledger tables are RPC-only).
do $$
declare t text;
begin
  foreach t in array array['institutions', 'accounts', 'people', 'categories', 'recurring_rules', 'statements', 'statement_lines', 'attachments', 'card_details', 'loan_details'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end $$;

-- Cross-row ownership: references inside a user's rows must point at that user's rows.
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
  elsif tg_table_name in ('statements', 'card_details', 'loan_details') then
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

create trigger accounts_refs before insert or update on public.accounts for each row execute function private.enforce_owned_refs();
create trigger recurring_refs before insert or update on public.recurring_rules for each row execute function private.enforce_owned_refs();
create trigger statements_refs before insert or update on public.statements for each row execute function private.enforce_owned_refs();
create trigger statement_lines_refs before insert or update on public.statement_lines for each row execute function private.enforce_owned_refs();
create trigger card_details_refs before insert or update on public.card_details for each row execute function private.enforce_owned_refs();
create trigger loan_details_refs before insert or update on public.loan_details for each row execute function private.enforce_owned_refs();
create trigger categories_refs before insert or update on public.categories for each row execute function private.enforce_owned_refs();

-- Account class always follows its type (custom types keep the chosen class).
create or replace function private.derive_account_class() returns trigger
language plpgsql as $$
begin
  if new.type <> 'custom' then
    new.class := private.account_class_for(new.type, null);
  end if;
  return new;
end $$;
create trigger accounts_class before insert or update of type, class on public.accounts for each row execute function private.derive_account_class();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
-- Helper functions used by CHECK constraints and invoker triggers must be
-- callable by `authenticated`; ledger-writing internals are not.
revoke all on schema private from anon, public;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.contains_pan(text),
  private.touch_updated_at(),
  private.account_class_for(public.account_type, public.account_class),
  private.account_is_liquid(public.account_type),
  private.account_group(public.account_type),
  private.derive_account_class(),
  private.check_entry_balanced(),
  private.check_entry_row_balanced(),
  private.validate_entry(uuid),
  private.fingerprint(public.entry_type, bigint, date, uuid, text)
to authenticated;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.institutions, public.accounts, public.card_details, public.loan_details, public.people,
  public.categories, public.recurring_rules, public.statements, public.statement_lines, public.attachments to authenticated;
grant update on public.profiles to authenticated;
-- Ledger tables are write-protected: only the RPCs below can change them.
revoke insert, update, delete on public.entries, public.postings, public.entry_revisions, public.recurring_occurrences,
  public.settlement_allocations, public.audit_log from authenticated;

grant execute on function
  public.post_entry(jsonb, jsonb),
  public.update_entry(uuid, int, jsonb, jsonb, text),
  public.void_entry(uuid, text),
  public.restore_entry(uuid),
  public.confirm_occurrence(uuid, date, jsonb, jsonb),
  public.skip_occurrence(uuid, date),
  public.unskip_occurrence(uuid, date),
  public.set_settlement_allocations(uuid, jsonb),
  public.save_account(jsonb, jsonb, jsonb, jsonb),
  public.reorder_accounts(uuid[])
to authenticated;

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_before jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_after jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_after, v_before);
begin
  if tg_op = 'UPDATE' and v_before - 'updated_at' = v_after - 'updated_at' then
    return null;
  end if;
  insert into public.audit_log (owner_id, table_name, record_id, action, before, after)
  values (
    coalesce((v_row->>'owner_id')::uuid, (v_row->>'id')::uuid),
    tg_table_name,
    coalesce(v_row->>'id', v_row->>'account_id'),
    lower(tg_op),
    v_before,
    v_after
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'institutions', 'accounts', 'card_details', 'loan_details', 'people', 'categories', 'recurring_rules', 'statements', 'entries', 'recurring_occurrences', 'settlement_allocations'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- New user bootstrap: profile + starter categories. No accounts are created.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  insert into public.profiles (id, display_name) values (new.id, nullif(split_part(coalesce(new.email, ''), '@', 1), ''))
  on conflict (id) do nothing;
  insert into public.categories (owner_id, kind, name, icon, color, system_key, sort_order)
  select new.id, c.kind::public.category_kind, c.name, c.icon, c.color, c.system_key, c.ord
  from (values
    ('expense', 'Food & dining', 'food', '#ff9f68', null, 1),
    ('expense', 'Groceries', 'basket', '#7bd88f', null, 2),
    ('expense', 'Household', 'home', '#9ec1ff', null, 3),
    ('expense', 'Transport', 'car', '#6aa8ff', null, 4),
    ('expense', 'Fuel', 'fuel', '#ffb86b', null, 5),
    ('expense', 'Shopping', 'bag', '#ff7ab6', null, 6),
    ('expense', 'Bills & utilities', 'bolt', '#f5d76e', null, 7),
    ('expense', 'Rent', 'key', '#c3a6ff', null, 8),
    ('expense', 'Subscriptions', 'repeat', '#8be9fd', null, 9),
    ('expense', 'Health', 'heart', '#ff6b6b', null, 10),
    ('expense', 'Education', 'cap', '#a1e3d8', null, 11),
    ('expense', 'Entertainment', 'film', '#bd93f9', null, 12),
    ('expense', 'Travel', 'plane', '#50e3c2', null, 13),
    ('expense', 'Gifts & donations', 'gift', '#ffa3c4', null, 14),
    ('expense', 'Insurance', 'shield', '#94a3b8', null, 15),
    ('expense', 'Personal care', 'sparkle', '#fbcfe8', null, 16),
    ('expense', 'Interest paid', 'percent', '#f87171', 'interest_paid', 17),
    ('expense', 'Bank charges & fees', 'receipt', '#a3a3a3', 'bank_charges', 18),
    ('expense', 'Other expenses', 'dots', '#737373', 'other_expense', 19),
    ('income', 'Salary', 'briefcase', '#3ddc97', 'salary', 1),
    ('income', 'Internship stipend', 'cap', '#7cf2c4', null, 2),
    ('income', 'Freelance', 'laptop', '#2dd4bf', null, 3),
    ('income', 'Business', 'store', '#5eead4', null, 4),
    ('income', 'Interest earned', 'percent', '#86efac', 'interest_earned', 5),
    ('income', 'Gifts received', 'gift', '#bbf7d0', null, 6),
    ('income', 'Other income', 'dots', '#a7f3d0', 'other_income', 7)
  ) as c(kind, name, icon, color, system_key, ord)
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Storage: private bucket, files live under "<uid>/..."
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('folio', 'folio', false, 20971520, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf', 'text/csv'])
    on conflict (id) do nothing;

    execute $p$create policy folio_read_own on storage.objects for select to authenticated
      using (bucket_id = 'folio' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy folio_insert_own on storage.objects for insert to authenticated
      with check (bucket_id = 'folio' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy folio_update_own on storage.objects for update to authenticated
      using (bucket_id = 'folio' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy folio_delete_own on storage.objects for delete to authenticated
      using (bucket_id = 'folio' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime: push ledger/config changes to every signed-in device.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['accounts', 'entries', 'people', 'categories', 'recurring_rules', 'recurring_occurrences', 'statements', 'profiles', 'settlement_allocations'] loop
      execute format('alter publication supabase_realtime add table public.%I', t);
    end loop;
  end if;
end $$;
