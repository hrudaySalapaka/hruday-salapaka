-- Add equipment owner listing fields and ordered multi-photo records.
alter table public.equipment
  add column if not exists brand text,
  add column if not exists model text,
  add column if not exists manufacturing_year smallint,
  add column if not exists price_per_hour numeric check (price_per_hour is null or price_per_hour > 0),
  add column if not exists price_per_day numeric check (price_per_day is null or price_per_day > 0),
  add column if not exists discount_type text not null default 'none' check (discount_type in ('none','percentage','amount')),
  add column if not exists discount_percentage numeric check (discount_percentage is null or discount_percentage between 0 and 100),
  add column if not exists discount_amount numeric check (discount_amount is null or discount_amount >= 0),
  add column if not exists state text,
  add column if not exists district text,
  add column if not exists village text,
  add column if not exists pickup_location text,
  add column if not exists service_area text,
  add column if not exists max_delivery_distance_km numeric check (max_delivery_distance_km is null or max_delivery_distance_km >= 0),
  add column if not exists specifications jsonb not null default '{}'::jsonb,
  add column if not exists available_from date,
  add column if not exists available_until date,
  add column if not exists operating_hours text,
  add column if not exists delivery_available boolean not null default false,
  add column if not exists pickup_available boolean not null default true;

create table if not exists public.equipment_photos (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  image_url text not null,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists equipment_photos_equipment_order_idx on public.equipment_photos(equipment_id, sort_order);
alter table public.equipment_photos enable row level security;

drop policy if exists "equipment photos owner read" on public.equipment_photos;
create policy "equipment photos owner read" on public.equipment_photos
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "equipment photos owner insert" on public.equipment_photos;
create policy "equipment photos owner insert" on public.equipment_photos
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and exists (
      select 1 from public.equipment e where e.id = equipment_id and e.owner_id = (select auth.uid())
    )
  );
drop policy if exists "equipment photos owner update" on public.equipment_photos;
create policy "equipment photos owner update" on public.equipment_photos
  for update to authenticated using (owner_id = (select auth.uid())) with check (
    owner_id = (select auth.uid()) and exists (
      select 1 from public.equipment e where e.id = equipment_id and e.owner_id = (select auth.uid())
    )
  );
drop policy if exists "equipment photos owner delete" on public.equipment_photos;
create policy "equipment photos owner delete" on public.equipment_photos
  for delete to authenticated using (owner_id = (select auth.uid()));
