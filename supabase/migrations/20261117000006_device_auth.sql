-- =============================================================================
-- Folio 0006: passphrase-per-device sign-in hardening, and clean user deletion.
--
-- Folio has one owner. Each new device unlocks once with the owner's
-- passphrase (a GoTrue password); afterwards the device keeps its session and
-- uses biometrics locally. Because a passphrase can be short, every password
-- check passes through this hook: after 8 wrong attempts in 15 minutes (from
-- anywhere), all attempts are refused for 15 minutes — even correct ones.
-- =============================================================================

-- Postings must not block deleting a whole user (RESTRICT is checked before
-- the owner cascade finishes; NO ACTION is checked at end of statement).
alter table public.postings
  drop constraint postings_account_id_fkey,
  add constraint postings_account_id_fkey foreign key (account_id) references public.accounts (id),
  drop constraint postings_category_id_fkey,
  add constraint postings_category_id_fkey foreign key (category_id) references public.categories (id),
  drop constraint postings_person_id_fkey,
  add constraint postings_person_id_fkey foreign key (person_id) references public.people (id);

create table private.auth_attempts (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  valid boolean not null
);
create index auth_attempts_at_idx on private.auth_attempts (at);
revoke all on private.auth_attempts from public, anon, authenticated;

-- GoTrue "password verification attempt" hook (pg-functions://postgres/private/hook_password_verification_attempt).
create or replace function private.hook_password_verification_attempt(event jsonb) returns jsonb
language plpgsql security definer set search_path = private, pg_temp as $$
declare
  v_fails int;
begin
  insert into private.auth_attempts (user_id, valid)
  values (nullif(event->>'user_id', '')::uuid, coalesce((event->>'valid')::boolean, false));
  delete from private.auth_attempts where at < now() - interval '2 days';
  select count(*) into v_fails from private.auth_attempts where not valid and at > now() - interval '15 minutes';
  if v_fails >= 8 then
    return jsonb_build_object('decision', 'reject', 'message', 'Too many wrong passphrases. Folio is locked for 15 minutes.', 'should_logout_user', false);
  end if;
  return jsonb_build_object('decision', 'continue');
end $$;

revoke execute on function private.hook_password_verification_attempt(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema private to supabase_auth_admin;
    grant execute on function private.hook_password_verification_attempt(jsonb) to supabase_auth_admin;
  end if;
end $$;
