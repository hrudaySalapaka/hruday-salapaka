-- Farmer equipment marketplace: persisted carts, complete rental orders, reviews and safe owner attribution.
alter table public.equipment_bookings
  add column if not exists booking_reference text,
  add column if not exists original_amount numeric not null default 0 check (original_amount >= 0),
  add column if not exists discount_amount numeric not null default 0 check (discount_amount >= 0),
  add column if not exists delivery_charge numeric not null default 0 check (delivery_charge >= 0),
  add column if not exists tax_amount numeric not null default 0 check (tax_amount >= 0),
  add column if not exists security_deposit numeric not null default 0 check (security_deposit >= 0),
  add column if not exists delivery_address jsonb,
  add column if not exists payment_method text,
  add column if not exists payment_status text not null default 'pending' check (payment_status in ('pending','processing','paid','failed','refunded'));

create unique index if not exists equipment_bookings_reference_uidx
  on public.equipment_bookings(booking_reference) where booking_reference is not null;

create table if not exists public.farmer_equipment_cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  quantity integer not null default 1 check (quantity between 1 and 10),
  created_at timestamptz not null default now(),
  unique(user_id, equipment_id)
);
alter table public.farmer_equipment_cart_items enable row level security;
drop policy if exists "farmer equipment cart own all" on public.farmer_equipment_cart_items;
create policy "farmer equipment cart own all" on public.farmer_equipment_cart_items
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Farmer'
  ));

drop policy if exists "equipment photos farmer read active listings" on public.equipment_photos;
create policy "equipment photos farmer read active listings" on public.equipment_photos
  for select to authenticated using (exists (
    select 1 from public.equipment e where e.id = equipment_id
      and ((e.is_available = true and e.listing_status = 'active') or exists (
        select 1 from public.equipment_bookings b where b.equipment_id = e.id and b.renter_id = (select auth.uid())
      ))
  ));

drop policy if exists "farmer read equipment from own rental history" on public.equipment;
create policy "farmer read equipment from own rental history" on public.equipment
  for select to authenticated using (exists (
    select 1 from public.equipment_bookings b where b.equipment_id = equipment.id and b.renter_id = (select auth.uid())
  ));

create table if not exists public.equipment_booking_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.equipment_bookings(id) on delete cascade,
  renter_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('upi','credit_card','debit_card','net_banking')),
  amount numeric not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','processing','paid','failed','refunded')),
  provider_reference text,
  created_at timestamptz not null default now()
);
alter table public.equipment_booking_payments enable row level security;
drop policy if exists "booking payments renter read" on public.equipment_booking_payments;
create policy "booking payments renter read" on public.equipment_booking_payments
  for select to authenticated using (renter_id = (select auth.uid()));
drop policy if exists "booking payments renter create pending" on public.equipment_booking_payments;
create policy "booking payments renter create pending" on public.equipment_booking_payments
  for insert to authenticated with check (
    renter_id = (select auth.uid()) and status = 'pending' and exists (
      select 1 from public.equipment_bookings b where b.id = booking_id
        and b.renter_id = (select auth.uid())
    )
  );
create or replace function public.sync_equipment_booking_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.equipment_bookings
  set payment_status = new.status, payment_method = new.method
  where id = new.booking_id and renter_id = new.renter_id;
  return new;
end;
$$;
drop trigger if exists equipment_booking_payment_sync on public.equipment_booking_payments;
create trigger equipment_booking_payment_sync
  after insert or update of status, method on public.equipment_booking_payments
  for each row execute function public.sync_equipment_booking_payment();

alter table public.reviews add column if not exists equipment_id uuid references public.equipment(id) on delete cascade;
alter table public.reviews add column if not exists media_urls text[] not null default '{}';
alter table public.reviews add column if not exists video_url text;
alter table public.reviews drop constraint if exists reviews_check;
alter table public.reviews add constraint reviews_target_check
  check (target_user_id is not null or product_id is not null or equipment_id is not null);
create index if not exists reviews_equipment_created_idx on public.reviews(equipment_id, created_at desc);
drop policy if exists "equipment renter reviews completed rentals" on public.reviews;
drop policy if exists "reviews author insert" on public.reviews;
create policy "reviews author insert" on public.reviews
  for insert to authenticated with check (
    author_id = (select auth.uid()) and (equipment_id is null or exists (
      select 1 from public.equipment_bookings b
      where b.equipment_id = reviews.equipment_id
        and b.renter_id = (select auth.uid()) and b.status = 'completed'
    ))
  );
drop policy if exists "reviews author update" on public.reviews;
create policy "reviews author update" on public.reviews
  for update to authenticated using (author_id = (select auth.uid())) with check (
    author_id = (select auth.uid()) and (equipment_id is null or exists (
      select 1 from public.equipment_bookings b
      where b.equipment_id = reviews.equipment_id
        and b.renter_id = (select auth.uid()) and b.status = 'completed'
    ))
  );
create policy "equipment renter reviews completed rentals" on public.reviews
  for insert to authenticated with check (
    equipment_id is not null and author_id = (select auth.uid()) and exists (
      select 1 from public.equipment_bookings b
      where b.equipment_id = reviews.equipment_id
        and b.renter_id = (select auth.uid()) and b.status = 'completed'
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipment-review-media', 'equipment-review-media', true, 52428800,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "equipment review media authenticated upload" on storage.objects;
create policy "equipment review media authenticated upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'equipment-review-media' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "equipment review media public read" on storage.objects;
create policy "equipment review media public read" on storage.objects
  for select to public using (bucket_id = 'equipment-review-media');
drop policy if exists "equipment review media author delete" on storage.objects;
create policy "equipment review media author delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'equipment-review-media' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Exposes only marketplace-safe owner fields; the profiles table remains private to its owner.
create or replace view public.equipment_owner_public_profiles
with (security_barrier = true) as
select p.id, p.full_name, p.avatar_path
from public.profiles p
where exists (
  select 1 from public.equipment e
  where e.owner_id = p.id and (
    (e.is_available = true and e.listing_status = 'active') or exists (
      select 1 from public.equipment_bookings b where b.equipment_id = e.id
    )
  )
);
grant select on public.equipment_owner_public_profiles to authenticated;

create or replace view public.equipment_review_public_profiles
with (security_barrier = true) as
select p.id, p.full_name, p.avatar_path
from public.profiles p
where exists (select 1 from public.reviews r where r.author_id = p.id and r.equipment_id is not null);
grant select on public.equipment_review_public_profiles to authenticated;

create or replace view public.equipment_public_availability
with (security_barrier = true) as
select b.equipment_id, b.booking_start, b.booking_end
from public.equipment_bookings b
where b.status in ('pending','accepted');
grant select on public.equipment_public_availability to authenticated;

create or replace view public.equipment_co_rental_frequency
with (security_barrier = true) as
select a.equipment_id, z.equipment_id as paired_equipment_id, count(*)::bigint as rental_count
from public.equipment_bookings a
join public.equipment_bookings z on z.renter_id = a.renter_id and z.equipment_id > a.equipment_id
  and a.booking_start < z.booking_end and z.booking_start < a.booking_end
where a.status in ('accepted','completed') and z.status in ('accepted','completed')
group by a.equipment_id, z.equipment_id;
grant select on public.equipment_co_rental_frequency to authenticated;

-- Keep checkout totals authoritative and prevent overlapping reservations.
create or replace function public.create_equipment_rental_order(
  p_equipment_id uuid,
  p_booking_start timestamptz,
  p_booking_end timestamptz,
  p_rate_period text,
  p_delivery_requested boolean,
  p_delivery_address jsonb
) returns table (booking_id uuid, booking_reference text, total_amount numeric)
language plpgsql security definer set search_path = public, auth as $$
declare
  listing public.equipment%rowtype;
  base_rate numeric;
  units numeric;
  original_total numeric;
  discounted_total numeric;
  discount_total numeric;
  delivery_total numeric;
  deposit_total numeric;
  reference text;
  created_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Farmer'
  ) then raise exception 'Only signed-in farmers can place an equipment rental order.'; end if;
  if p_booking_start <= now() or p_booking_end <= p_booking_start then
    raise exception 'Choose a future rental start and an end time after it.';
  end if;
  if p_rate_period not in ('hour','day') then raise exception 'Choose an hourly or daily rate.'; end if;

  select e.* into listing from public.equipment e
  where e.id = p_equipment_id and e.is_available = true and e.listing_status = 'active'
  for update;
  if not found then raise exception 'This equipment listing is no longer available.'; end if;
  if listing.available_from is not null and p_booking_start::date < listing.available_from then
    raise exception 'The rental starts before the owner availability window.';
  end if;
  if listing.available_until is not null and p_booking_end::date > listing.available_until then
    raise exception 'The rental ends after the owner availability window.';
  end if;
  if p_delivery_requested and not listing.delivery_available then
    raise exception 'Delivery is not available for this equipment.';
  end if;
  if exists (
    select 1 from public.equipment_bookings b where b.equipment_id = p_equipment_id
      and b.status in ('pending','accepted')
      and b.booking_start < p_booking_end and b.booking_end > p_booking_start
  ) then raise exception 'Those rental dates overlap another booking.'; end if;

  base_rate := case when p_rate_period = 'hour'
    then coalesce(listing.price_per_hour, case when listing.pricing_model ilike '%hour%' then listing.price_per_unit end, 0)
    else coalesce(listing.price_per_day, case when listing.pricing_model ilike '%day%' then listing.price_per_unit end, 0)
  end;
  if base_rate <= 0 then raise exception 'This listing does not have a rate for that rental period.'; end if;
  units := greatest(1, ceil(extract(epoch from (p_booking_end - p_booking_start)) / case when p_rate_period = 'hour' then 3600 else 86400 end));
  original_total := base_rate * units;
  discounted_total := greatest(0, case listing.discount_type
    when 'percentage' then original_total * (1 - coalesce(listing.discount_percentage, 0) / 100)
    when 'amount' then original_total - coalesce(listing.discount_amount, 0) * units
    else original_total end);
  discount_total := greatest(0, original_total - discounted_total);
  delivery_total := case when p_delivery_requested then coalesce(listing.additional_charges, 0) else 0 end;
  deposit_total := coalesce(listing.security_deposit, 0);
  reference := 'KH-RNT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.equipment_bookings (
    equipment_id, renter_id, owner_id, booking_start, booking_end, total_amount,
    booking_reference, original_amount, discount_amount, delivery_charge, tax_amount,
    security_deposit, delivery_address, status, payment_status
  ) values (
    listing.id, auth.uid(), listing.owner_id, p_booking_start, p_booking_end,
    discounted_total + delivery_total + deposit_total,
    reference, original_total, discount_total, delivery_total, 0,
    deposit_total, p_delivery_address, 'pending', 'pending'
  ) returning id into created_id;

  return query select created_id, reference, discounted_total + delivery_total + deposit_total;
end;
$$;
revoke all on function public.create_equipment_rental_order(uuid,timestamptz,timestamptz,text,boolean,jsonb) from public;
grant execute on function public.create_equipment_rental_order(uuid,timestamptz,timestamptz,text,boolean,jsonb) to authenticated;
