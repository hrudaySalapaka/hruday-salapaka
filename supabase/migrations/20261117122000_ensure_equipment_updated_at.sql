-- Older equipment tables may predate the updated_at column used by the owner listing.
alter table public.equipment
  add column if not exists updated_at timestamptz not null default now();
