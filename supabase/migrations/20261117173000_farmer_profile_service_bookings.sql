-- Farmer service marketplace: new catalog/registration data only where the
-- existing schema has no service-listing equivalent; product orders reuse the
-- existing products, orders, order_items and payments tables.

create table if not exists public.farmer_ride_services (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references auth.users(id) on delete cascade,
  vehicle_type text not null check (vehicle_type in ('Bike','Auto','Car')),
  vehicle_name text not null,
  image_url text,
  price_per_km numeric not null check (price_per_km >= 0),
  seats integer not null default 1 check (seats > 0),
  service_area text,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.farmer_ride_services enable row level security;
drop policy if exists "farmer reads available ride services" on public.farmer_ride_services;
create policy "farmer reads available ride services" on public.farmer_ride_services
  for select to authenticated using (is_available or partner_id = (select auth.uid()));
drop policy if exists "ride partner manages own services" on public.farmer_ride_services;
create policy "ride partner manages own services" on public.farmer_ride_services
  for all to authenticated using (partner_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Ride Booking Partner'
  )) with check (partner_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Ride Booking Partner'
  ));

alter table public.rides add column if not exists pickup_at timestamptz;
alter table public.rides add column if not exists booking_reference text;
alter table public.rides add column if not exists payment_status text not null default 'pending'
  check (payment_status in ('pending','paid','failed','refunded'));
create unique index if not exists rides_booking_reference_uidx on public.rides(booking_reference) where booking_reference is not null;

create table if not exists public.agricultural_events (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  summary text,
  description text,
  image_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null,
  price numeric not null default 0 check (price >= 0),
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'draft' check (status in ('draft','published','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
alter table public.agricultural_events enable row level security;
drop policy if exists "farmers read published agricultural events" on public.agricultural_events;
create policy "farmers read published agricultural events" on public.agricultural_events
  for select to authenticated using (status = 'published' or manager_id = (select auth.uid()));
drop policy if exists "event managers manage own events" on public.agricultural_events;
create policy "event managers manage own events" on public.agricultural_events
  for all to authenticated using (manager_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Event Manager'
  )) with check (manager_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Event Manager'
  ));

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null unique default ('KH-EVT-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  event_id uuid not null references public.agricultural_events(id) on delete restrict,
  farmer_id uuid not null references auth.users(id) on delete cascade,
  attendee_count integer not null check (attendee_count > 0),
  total_amount numeric not null check (total_amount >= 0),
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  created_at timestamptz not null default now()
);
alter table public.event_registrations enable row level security;
drop policy if exists "farmer reads own event registrations" on public.event_registrations;
create policy "farmer reads own event registrations" on public.event_registrations
  for select to authenticated using (farmer_id = (select auth.uid()));

-- Narrow public seller projection; profiles' own-row policy remains unchanged.
create or replace view public.farmer_service_products with (security_barrier = true) as
  select pr.id, pr.owner_id, pr.name, pr.description, pr.price, pr.currency, pr.unit,
    pr.stock, pr.image_url, pr.status, pr.created_at, p.role as seller_role, p.full_name as seller_name, p.avatar_path as seller_avatar_path
  from public.products pr join public.profiles p on p.id = pr.owner_id
  where pr.status = 'active' and p.role in ('Market Seller','Food Seller') and pr.stock > 0;
grant select on public.farmer_service_products to authenticated;

create or replace view public.farmer_ride_partner_profiles with (security_barrier = true) as
  select p.id, p.full_name, p.avatar_path, p.village, p.district, p.state
  from public.profiles p where p.role = 'Ride Booking Partner';
grant select on public.farmer_ride_partner_profiles to authenticated;

create or replace function public.create_farmer_ride_booking(
  p_service_id uuid, p_pickup_address text, p_dropoff_address text, p_pickup_at timestamptz, p_distance_km numeric
) returns table (booking_id uuid, booking_reference text, estimated_fare numeric)
language plpgsql security definer set search_path = public, auth as $$
declare service public.farmer_ride_services%rowtype; created_id uuid; fare numeric; reference text;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Farmer') then
    raise exception 'Only signed-in farmers can book a ride.';
  end if;
  if nullif(trim(p_pickup_address),'') is null or nullif(trim(p_dropoff_address),'') is null or p_pickup_at <= now() or p_distance_km <= 0 then
    raise exception 'Enter pickup, destination, a future pickup time and a positive trip distance.';
  end if;
  select * into service from public.farmer_ride_services s where s.id=p_service_id and s.is_available=true for update;
  if not found then raise exception 'This ride partner is no longer available.'; end if;
  fare := round(service.price_per_km * p_distance_km, 2);
  reference := 'KH-RIDE-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.rides(rider_id,driver_id,vehicle_type,pickup_address,dropoff_address,estimated_fare,status,pickup_at,booking_reference,payment_status)
  values(auth.uid(),service.partner_id,service.vehicle_type,trim(p_pickup_address),trim(p_dropoff_address),fare,'requested',p_pickup_at,reference,'pending') returning id into created_id;
  insert into public.payments(payer_id,payee_id,amount,status,provider_reference)
  values(auth.uid(),service.partner_id,fare,'pending','ride-booking:'||created_id::text);
  return query select created_id,reference,fare;
end; $$;
revoke all on function public.create_farmer_ride_booking(uuid,text,text,timestamptz,numeric) from public;
grant execute on function public.create_farmer_ride_booking(uuid,text,text,timestamptz,numeric) to authenticated;

create or replace function public.create_farmer_service_order(
  p_product_id uuid, p_seller_role text, p_quantity numeric, p_delivery_address jsonb
) returns table (order_id uuid, order_number text, total_amount numeric)
language plpgsql security definer set search_path = public, auth as $$
declare product_row public.products%rowtype; created_id uuid; created_number text; total numeric;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Farmer') then
    raise exception 'Only signed-in farmers can place service orders.';
  end if;
  if p_seller_role not in ('Market Seller','Food Seller') or p_quantity <= 0 then raise exception 'Choose a valid seller and quantity.'; end if;
  select pr.* into product_row from public.products pr join public.profiles seller on seller.id=pr.owner_id
  where pr.id=p_product_id and pr.status='active' and pr.stock >= p_quantity and seller.role=p_seller_role for update of pr;
  if not found then raise exception 'This item is no longer available in the requested quantity.'; end if;
  total := product_row.price * p_quantity;
  insert into public.orders(customer_id,seller_id,farmer_id,status,total_amount,currency,delivery_address,payment_status)
  values(auth.uid(),product_row.owner_id,auth.uid(),'pending',total,coalesce(product_row.currency,'INR'),coalesce(p_delivery_address,'{}'::jsonb),'pending')
  returning id,order_number into created_id,created_number;
  insert into public.order_items(order_id,product_id,seller_id,name,quantity,unit_price)
  values(created_id,product_row.id,product_row.owner_id,product_row.name,p_quantity,product_row.price);
  update public.products set stock=stock-p_quantity,updated_at=now() where id=product_row.id;
  insert into public.payments(payer_id,payee_id,amount,status,provider_reference)
  values(auth.uid(),product_row.owner_id,total,'pending','service-order:'||created_id::text);
  return query select created_id,created_number,total;
end; $$;
revoke all on function public.create_farmer_service_order(uuid,text,numeric,jsonb) from public;
grant execute on function public.create_farmer_service_order(uuid,text,numeric,jsonb) to authenticated;

alter table public.orders add column if not exists payment_status text not null default 'pending'
  check (payment_status in ('pending','paid','failed','refunded'));

create or replace function public.register_farmer_event(p_event_id uuid,p_attendee_count integer)
returns table (registration_id uuid, booking_reference text, total_amount numeric)
language plpgsql security definer set search_path = public, auth as $$
declare event_row public.agricultural_events%rowtype; booked integer; created_id uuid; reference text; total numeric;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Farmer') then
    raise exception 'Only signed-in farmers can register for events.';
  end if;
  if p_attendee_count < 1 then raise exception 'Select at least one attendee.'; end if;
  select * into event_row from public.agricultural_events e where e.id=p_event_id and e.status='published' and e.starts_at>now() for update;
  if not found then raise exception 'This event is no longer available.'; end if;
  select coalesce(sum(er.attendee_count),0)::integer into booked from public.event_registrations er where er.event_id=p_event_id and er.status in ('pending','confirmed');
  if event_row.capacity is not null and booked+p_attendee_count>event_row.capacity then raise exception 'There are not enough places for this event.'; end if;
  total := event_row.price * p_attendee_count;
  reference := 'KH-EVT-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.event_registrations(booking_reference,event_id,farmer_id,attendee_count,total_amount,status,payment_status)
  values(reference,p_event_id,auth.uid(),p_attendee_count,total,'pending','pending') returning id into created_id;
  insert into public.payments(payer_id,payee_id,amount,status,provider_reference)
  values(auth.uid(),event_row.manager_id,total,'pending','event-registration:'||created_id::text);
  return query select created_id,reference,total;
end; $$;
revoke all on function public.register_farmer_event(uuid,integer) from public;
grant execute on function public.register_farmer_event(uuid,integer) to authenticated;
