-- =============================================================================
-- Folio 0004: optional single-owner lock for self-hosted personal instances.
--
-- When private.instance_settings has single_owner = 'on' (the deploy's
-- migrate step sets it), the first account created owns the instance and any
-- further sign-up is refused by the database itself — no race, no reliance on
-- an auth-server flag. Off by default, so tests and local dev allow many users.
-- =============================================================================
create table if not exists private.instance_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.instance_settings from public, anon, authenticated;

create or replace function private.enforce_single_owner() returns trigger
language plpgsql security definer set search_path = public, private, auth, pg_temp as $$
begin
  if coalesce((select value from private.instance_settings where key = 'single_owner'), 'off') <> 'on' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('folio:single-owner'));
  if exists (select 1 from auth.users where id <> new.id) then
    raise exception 'This Folio instance already has an owner' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists folio_single_owner on auth.users;
create trigger folio_single_owner before insert on auth.users for each row execute function private.enforce_single_owner();
