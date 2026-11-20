-- Apply once in the Supabase SQL editor. All access is scoped to auth.uid().
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', role text check (role in ('Farmer','Equipment Owner','Customer','Delivery Partner','Ride Booking Partner','Market Seller','Event Manager','Food Seller')),
  phone text, avatar_path text, state text, district text, village text, pin_code text,
  address text, location jsonb, role_info jsonb not null default '{}'::jsonb,
  profile_complete boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('Farmer','Equipment Owner','Customer','Delivery Partner','Ride Booking Partner','Market Seller','Event Manager','Food Seller')),
  created_at timestamptz not null default now()
);
do $$
begin
  if to_regtype('public.app_role') is not null then
    execute 'alter type public.app_role add value if not exists ''event_manager''';
    execute 'alter type public.app_role add value if not exists ''food_seller''';
  end if;
  if to_regclass('public.profiles') is not null then
    alter table public.profiles drop constraint if exists profiles_role_check;
    alter table public.profiles drop constraint if exists profiles_role_allowed_check;
    alter table public.profiles add constraint profiles_role_allowed_check
      check (role is null or role in ('Farmer','Equipment Owner','Customer','Delivery Partner','Ride Booking Partner','Market Seller','Event Manager','Food Seller'));
  end if;
  if to_regclass('public.user_roles') is not null and exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_roles'
      and column_name = 'role' and data_type <> 'USER-DEFINED'
  ) then
    alter table public.user_roles drop constraint if exists user_roles_role_check;
    alter table public.user_roles add constraint user_roles_role_check
      check (role in ('Farmer','Equipment Owner','Customer','Delivery Partner','Ride Booking Partner','Market Seller','Event Manager','Food Seller'));
  end if;
end;
$$;
create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null, location text not null, area_acres numeric check (area_acres is null or area_acres >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.crops (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null, variety text, quantity numeric check (quantity is null or quantity >= 0), unit text,
  expected_harvest_at date, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null, equipment_type text not null, description text, pricing_model text,
  price_per_unit numeric not null check (price_per_unit >= 0), location text, image_url text,
  is_available boolean not null default true, is_used boolean not null default false,
  brand text, model text, manufacturing_year smallint,
  price_per_hour numeric check (price_per_hour is null or price_per_hour > 0),
  price_per_day numeric check (price_per_day is null or price_per_day > 0),
  discount_type text not null default 'none' check (discount_type in ('none','percentage','amount')),
  discount_percentage numeric check (discount_percentage is null or discount_percentage between 0 and 100),
  discount_amount numeric check (discount_amount is null or discount_amount >= 0),
  state text, district text, village text, pickup_location text, service_area text,
  max_delivery_distance_km numeric check (max_delivery_distance_km is null or max_delivery_distance_km >= 0),
  specifications jsonb not null default '{}'::jsonb,
  equipment_capacity text, fuel_type text, equipment_condition text,
  security_deposit numeric not null default 0 check (security_deposit >= 0),
  additional_charges numeric not null default 0 check (additional_charges >= 0),
  operator_available boolean not null default false, terms_and_conditions text,
  listing_status text not null default 'active' check (listing_status in ('draft','active')),
  available_from date, available_until date, operating_hours text,
  delivery_available boolean not null default false, pickup_available boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.equipment_photos (
  id uuid primary key default gen_random_uuid(), equipment_id uuid not null references public.equipment(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, storage_path text not null unique,
  image_url text not null, is_primary boolean not null default false, sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists equipment_photos_equipment_order_idx on public.equipment_photos(equipment_id, sort_order);
create table if not exists public.equipment_bookings (
  id uuid primary key default gen_random_uuid(), equipment_id uuid not null references public.equipment(id) on delete restrict,
  renter_id uuid not null references auth.users(id) on delete cascade, owner_id uuid not null references auth.users(id) on delete cascade,
  booking_start timestamptz not null, booking_end timestamptz not null, total_amount numeric not null check (total_amount >= 0),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled','completed')),
  created_at timestamptz not null default now(), check (booking_end > booking_start)
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null, description text, price numeric not null check (price >= 0), currency text not null default 'INR',
  unit text, stock numeric not null default 0 check (stock >= 0), image_url text, status text not null default 'active' check (status in ('active','draft','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(), cart_id uuid not null references public.carts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric not null default 1 check (quantity > 0), created_at timestamptz not null default now(),
  unique(cart_id, product_id)
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), order_number text not null unique default ('KH-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  customer_id uuid not null references auth.users(id) on delete restrict, seller_id uuid references auth.users(id) on delete restrict,
  farmer_id uuid references auth.users(id) on delete set null, status text not null default 'pending' check (status in ('pending','accepted','packed','shipped','delivered','cancelled')),
  total_amount numeric not null check (total_amount >= 0), currency text not null default 'INR', delivery_address jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null, seller_id uuid references auth.users(id) on delete set null,
  name text not null, quantity numeric not null check (quantity > 0), unit_price numeric not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(), payer_id uuid references auth.users(id) on delete set null,
  payee_id uuid not null references auth.users(id) on delete cascade, amount numeric not null check (amount >= 0),
  currency text not null default 'INR', status text not null default 'pending' check (status in ('pending','authorized','paid','failed','refunded')),
  provider_reference text, created_at timestamptz not null default now()
);
create table if not exists public.delivery_jobs (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id) on delete restrict,
  partner_id uuid references auth.users(id) on delete set null, order_id uuid references public.orders(id) on delete set null,
  pickup_address text not null, dropoff_address text not null, status text not null default 'available' check (status in ('available','accepted','picked_up','in_transit','delivered','cancelled')),
  proof_path text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.delivery_tracking (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.delivery_jobs(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade, location jsonb not null,
  status text not null, created_at timestamptz not null default now()
);
create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(), rider_id uuid not null references auth.users(id) on delete cascade,
  driver_id uuid references auth.users(id) on delete set null, vehicle_type text not null check (vehicle_type in ('Bike','Auto','Car')),
  pickup_address text not null, dropoff_address text not null, pickup_location jsonb, dropoff_location jsonb,
  estimated_fare numeric check (estimated_fare is null or estimated_fare >= 0), status text not null default 'requested' check (status in ('requested','accepted','in_progress','completed','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, body text not null, read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete cascade, product_id uuid references public.products(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5), body text, created_at timestamptz not null default now(),
  check (target_user_id is not null or product_id is not null)
);
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null, amount numeric not null check (amount >= 0), status text not null default 'pending' check (status in ('pending','active','expired','cancelled')),
  starts_at timestamptz, ends_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.kyc_documents (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null, storage_path text not null, status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null, message text not null, status text not null default 'open' check (status in ('open','in_progress','closed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.farms enable row level security;
alter table public.crops enable row level security;
alter table public.equipment enable row level security;
alter table public.equipment_photos enable row level security;
alter table public.equipment_bookings enable row level security;
alter table public.products enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.delivery_jobs enable row level security;
alter table public.delivery_tracking enable row level security;
alter table public.rides enable row level security;
alter table public.notifications enable row level security;
alter table public.reviews enable row level security;
alter table public.memberships enable row level security;
alter table public.kyc_documents enable row level security;
alter table public.support_tickets enable row level security;

create policy "profiles read own" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles insert own" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles update own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "roles read own" on public.user_roles for select to authenticated using (user_id = (select auth.uid()));
create policy "farms own all" on public.farms for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "crops own all" on public.crops for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "equipment visible" on public.equipment for select to authenticated using (is_available or owner_id = (select auth.uid()));
create policy "equipment owner insert" on public.equipment for insert to authenticated with check (owner_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Equipment Owner'));
create policy "equipment owner update" on public.equipment for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "equipment owner delete" on public.equipment for delete to authenticated using (owner_id = (select auth.uid()));
create policy "equipment photos owner read" on public.equipment_photos for select to authenticated using (owner_id = (select auth.uid()));
create policy "equipment photos owner insert" on public.equipment_photos for insert to authenticated with check (owner_id = (select auth.uid()) and exists (select 1 from public.equipment e where e.id = equipment_id and e.owner_id = (select auth.uid())));
create policy "equipment photos owner update" on public.equipment_photos for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and exists (select 1 from public.equipment e where e.id = equipment_id and e.owner_id = (select auth.uid())));
create policy "equipment photos owner delete" on public.equipment_photos for delete to authenticated using (owner_id = (select auth.uid()));
create policy "booking participants read" on public.equipment_bookings for select to authenticated using (renter_id = (select auth.uid()) or owner_id = (select auth.uid()));
create policy "renter creates own booking" on public.equipment_bookings for insert to authenticated with check (renter_id = (select auth.uid()) and exists (select 1 from public.equipment e where e.id = equipment_id and e.owner_id = owner_id and e.is_available));
create policy "equipment owner responds" on public.equipment_bookings for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "product listing read" on public.products for select to authenticated using (status = 'active' or owner_id = (select auth.uid()));
create policy "seller product insert" on public.products for insert to authenticated with check (owner_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Market Seller','Farmer')));
create policy "seller product update" on public.products for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "seller product delete" on public.products for delete to authenticated using (owner_id = (select auth.uid()));
create policy "cart own all" on public.carts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "cart items own all" on public.cart_items for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));
create policy "order participants read" on public.orders for select to authenticated using (customer_id = (select auth.uid()) or seller_id = (select auth.uid()) or farmer_id = (select auth.uid()));
create policy "customer order insert" on public.orders for insert to authenticated with check (customer_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Customer'));
create policy "seller order update" on public.orders for update to authenticated using (seller_id = (select auth.uid()) or farmer_id = (select auth.uid())) with check (seller_id = (select auth.uid()) or farmer_id = (select auth.uid()));
create policy "order items participants" on public.order_items for select to authenticated using (seller_id = (select auth.uid()) or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy "payer and payee read payments" on public.payments for select to authenticated using (payer_id = (select auth.uid()) or payee_id = (select auth.uid()));
create policy "delivery participant read" on public.delivery_jobs for select to authenticated using (partner_id = (select auth.uid()) or customer_id = (select auth.uid()) or (status = 'available' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Delivery Partner')));
create policy "customer creates delivery job" on public.delivery_jobs for insert to authenticated with check (customer_id = (select auth.uid()));
create policy "partner accepts and updates delivery" on public.delivery_jobs for update to authenticated using (partner_id = (select auth.uid()) or (partner_id is null and status = 'available' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Delivery Partner'))) with check (partner_id = (select auth.uid()));
create policy "delivery tracking participants" on public.delivery_tracking for select to authenticated using (partner_id = (select auth.uid()) or exists (select 1 from public.delivery_jobs j where j.id = job_id and j.customer_id = auth.uid()));
create policy "partner records tracking" on public.delivery_tracking for insert to authenticated with check (partner_id = (select auth.uid()) and exists (select 1 from public.delivery_jobs j where j.id = job_id and j.partner_id = auth.uid()));
create policy "ride participants read" on public.rides for select to authenticated using (rider_id = (select auth.uid()) or driver_id = (select auth.uid()) or (driver_id is null and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Ride Booking Partner')));
create policy "customer books ride" on public.rides for insert to authenticated with check (rider_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Customer'));
create policy "driver updates ride" on public.rides for update to authenticated using (driver_id = (select auth.uid()) or (driver_id is null and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Ride Booking Partner'))) with check (driver_id = (select auth.uid()));
create policy "notifications own all" on public.notifications for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reviews read signed in" on public.reviews for select to authenticated using (true);
create policy "reviews author insert" on public.reviews for insert to authenticated with check (author_id = (select auth.uid()));
create policy "reviews author update" on public.reviews for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "memberships own all" on public.memberships for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "kyc own all" on public.kyc_documents for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "support tickets own all" on public.support_tickets for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.enforce_profile_integrity()
returns trigger language plpgsql set search_path = '' as $$
declare saved_role text;
begin
  if new.role is not null then
    select r.role into saved_role from public.user_roles r where r.user_id = new.id;
    if saved_role is distinct from new.role then raise exception 'Choose a role through the role setup flow'; end if;
  end if;
  new.profile_complete := new.role is not null
    and length(trim(new.full_name)) >= 2
    and nullif(trim(new.state), '') is not null
    and nullif(trim(new.district), '') is not null
    and nullif(trim(new.village), '') is not null
    and new.pin_code ~ '^\d{6}$'
    and nullif(trim(new.address), '') is not null;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists profiles_enforce_integrity on public.profiles;
create trigger profiles_enforce_integrity before insert or update on public.profiles
for each row execute function public.enforce_profile_integrity();

create or replace function public.save_user_role(selected_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid();
declare current_name text := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', '');
declare enum_role text;
declare role_is_enum boolean;
declare user_id_only_unique boolean;
begin
  if current_user_id is null then raise exception 'Sign in is required'; end if;
  if selected_role not in ('Farmer','Equipment Owner','Customer','Delivery Partner','Ride Booking Partner','Market Seller','Event Manager','Food Seller') then raise exception 'Invalid role'; end if;

  enum_role := case selected_role
    when 'Farmer' then 'farmer'
    when 'Equipment Owner' then 'equipment_owner'
    when 'Customer' then 'customer'
    when 'Delivery Partner' then 'delivery_partner'
    when 'Ride Booking Partner' then 'ride_booking_partner'
    when 'Market Seller' then 'market_seller'
    when 'Event Manager' then 'event_manager'
    when 'Food Seller' then 'food_seller'
  end;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_roles'
      and column_name = 'role' and data_type = 'USER-DEFINED' and udt_name = 'app_role'
  ) into role_is_enum;
  select exists (
    select 1 from pg_index i
    where i.indrelid = 'public.user_roles'::regclass and i.indisunique
      and i.indnkeyatts = 1
      and i.indkey[0] = (
        select a.attnum from pg_attribute a
        where a.attrelid = 'public.user_roles'::regclass and a.attname = 'user_id' and not a.attisdropped
      )
  ) into user_id_only_unique;

  -- user_roles.user_id references profiles.id in production, so establish the
  -- authenticated user's profile before assigning the role.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_name'
  ) then
    insert into public.profiles (id, full_name, display_name, role)
    values (current_user_id, current_name, current_name, selected_role)
    on conflict (id) do update set
      role = excluded.role,
      full_name = case when btrim(public.profiles.full_name) = ''
        then coalesce(nullif(btrim(public.profiles.display_name), ''), excluded.full_name)
        else public.profiles.full_name end,
      updated_at = now();
  else
    insert into public.profiles (id, full_name, role)
    values (current_user_id, current_name, selected_role)
    on conflict (id) do update set role = excluded.role, updated_at = now();
  end if;

  if role_is_enum and user_id_only_unique then
    insert into public.user_roles (user_id, role) values (current_user_id, enum_role::public.app_role)
    on conflict (user_id) do update set role = excluded.role;
  elsif role_is_enum then
    insert into public.user_roles (user_id, role) values (current_user_id, enum_role::public.app_role)
    on conflict (user_id, role) do nothing;
  elsif user_id_only_unique then
    insert into public.user_roles (user_id, role) values (current_user_id, selected_role)
    on conflict (user_id) do update set role = excluded.role;
  else
    insert into public.user_roles (user_id, role) values (current_user_id, selected_role)
    on conflict (user_id, role) do nothing;
  end if;
end;
$$;
revoke all on function public.save_user_role(text) from public, anon, service_role;
grant execute on function public.save_user_role(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-media','catalog-media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
create policy "avatar owner read" on storage.objects for select to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar owner upload" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar owner update" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "catalog media public read" on storage.objects for select to public using (bucket_id = 'catalog-media');
create policy "catalog media owner upload" on storage.objects for insert to authenticated with check (bucket_id = 'catalog-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "catalog media owner update" on storage.objects for update to authenticated using (bucket_id = 'catalog-media' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'catalog-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "catalog media owner delete" on storage.objects for delete to authenticated using (bucket_id = 'catalog-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Realtime is used by active workspace views; RLS remains enabled for every table.
do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','products','orders','equipment_bookings','delivery_jobs','rides','notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
