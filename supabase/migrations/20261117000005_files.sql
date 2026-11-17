-- =============================================================================
-- Folio 0005: files in Postgres (replaces the Storage service).
--
-- Bank logos, card artwork and statement PDFs are small and few, so they live
-- in a table under the same row-level security as everything else. This keeps
-- the self-hosted stack to Postgres + PostgREST + GoTrue only.
-- =============================================================================
create table public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder text not null check (folder in ('artwork', 'logos', 'statements', 'receipts')),
  name text not null check (char_length(name) between 1 and 120),
  mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf', 'text/csv')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 6291456),
  data text not null check (octet_length(data) <= 8400000), -- base64
  created_at timestamptz not null default now()
);
create index files_owner_idx on public.files (owner_id, folder);

alter table public.files enable row level security;
create policy files_select_own on public.files for select to authenticated using (owner_id = (select auth.uid()));
create policy files_insert_own on public.files for insert to authenticated with check (owner_id = (select auth.uid()));
create policy files_delete_own on public.files for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.files from anon;
grant select, insert, delete on public.files to authenticated;
