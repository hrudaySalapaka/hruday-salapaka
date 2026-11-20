-- Designated Admin access is bound to a verified auth.users email and a
-- server-synchronized identity. Client-side role fields cannot grant Admin.
create table if not exists public.admin_access_settings (
  id boolean primary key default true check (id),
  admin_email text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.admin_access_settings enable row level security;
revoke all on public.admin_access_settings from anon, authenticated;
grant all on public.admin_access_settings to service_role;
insert into public.admin_access_settings(id,admin_email) values(true,'') on conflict(id) do nothing;

create or replace function public.sync_designated_admin_access()
returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
  update public.profiles p set role=null,updated_at=now()
  where p.role='Admin' and not exists (
    select 1 from auth.users u where u.id=p.id and u.email_confirmed_at is not null
      and lower(btrim(u.email))=lower(btrim(new.admin_email))
  );
  return new;
end; $$;
drop trigger if exists admin_access_settings_sync on public.admin_access_settings;
create trigger admin_access_settings_sync after insert or update of admin_email
  on public.admin_access_settings for each row execute function public.sync_designated_admin_access();

create or replace function public.is_rental_admin()
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists (
    select 1 from public.profiles p
    join auth.users u on u.id=p.id
    join public.admin_access_settings s on s.id=true
    where p.id=auth.uid() and p.role='Admin'
      and u.email_confirmed_at is not null
      and lower(btrim(u.email))=lower(btrim(s.admin_email))
      and s.admin_email<>''
  );
$$;
revoke all on function public.is_rental_admin() from public,anon;
grant execute on function public.is_rental_admin() to authenticated;

create or replace function public.admin_get_rental_upi_settings()
returns table(receiver_upi_id text,receiver_name text)
language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.is_rental_admin() then raise exception 'Verified Admin access is required.'; end if;
  return query select s.receiver_upi_id,s.receiver_name from public.rental_payment_settings s where s.id=true;
end; $$;
revoke all on function public.admin_get_rental_upi_settings() from public,anon;
grant execute on function public.admin_get_rental_upi_settings() to authenticated;

create or replace function public.admin_set_rental_upi_settings(p_receiver_upi_id text,p_receiver_name text)
returns void language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.is_rental_admin() then raise exception 'Verified Admin access is required.'; end if;
  if length(trim(coalesce(p_receiver_upi_id,'')))<4 or length(trim(coalesce(p_receiver_upi_id,'')))>120 or trim(coalesce(p_receiver_name,''))='' then
    raise exception 'Enter a valid receiver UPI ID and display name.';
  end if;
  update public.rental_payment_settings set receiver_upi_id=trim(p_receiver_upi_id),receiver_name=trim(p_receiver_name),updated_by=auth.uid(),updated_at=now() where id=true;
end; $$;
revoke all on function public.admin_set_rental_upi_settings(text,text) from public,anon;
grant execute on function public.admin_set_rental_upi_settings(text,text) to authenticated;

create or replace function public.admin_review_rental_upi_payment(p_payment_id uuid,p_accept boolean,p_reason text default null)
returns void language plpgsql security definer set search_path=public,auth as $$
declare payment public.equipment_booking_payments%rowtype; booking public.equipment_bookings%rowtype;
begin
  if not public.is_rental_admin() then raise exception 'Verified Admin access is required.'; end if;
  select * into payment from public.equipment_booking_payments where id=p_payment_id and method='upi' for update;
  if not found or payment.status<>'pending_verification' then raise exception 'This payment is not awaiting verification.'; end if;
  select * into booking from public.equipment_bookings where id=payment.booking_id for update;
  if p_accept then
    update public.equipment_booking_payments set status='admin_verified',verified_by=auth.uid(),verified_at=now(),rejection_reason=null where id=p_payment_id;
    update public.equipment_bookings set status='waiting_owner_approval',payment_status='admin_verified' where id=booking.id;
    insert into public.notifications(user_id,title,body) values
      (booking.owner_id,'Payment verified; booking needs your decision',format('Booking %s has a manually verified UPI payment.',coalesce(booking.booking_reference,booking.id::text))),
      (booking.renter_id,'UPI payment verified',format('Your payment for booking %s was verified. Waiting for equipment owner approval.',coalesce(booking.booking_reference,booking.id::text)));
  else
    if length(trim(coalesce(p_reason,'')))<4 then raise exception 'Provide a reason for rejecting this payment.'; end if;
    update public.equipment_booking_payments set status='rejected',verified_by=auth.uid(),verified_at=now(),rejection_reason=trim(p_reason) where id=p_payment_id;
    update public.equipment_bookings set status='rejected',payment_status='rejected' where id=booking.id;
    insert into public.notifications(user_id,title,body) values(booking.renter_id,'UPI payment not verified',format('Payment proof for booking %s was rejected: %s',coalesce(booking.booking_reference,booking.id::text),trim(p_reason)));
  end if;
  insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action,details) values(booking.id,p_payment_id,auth.uid(),case when p_accept then 'upi_payment_admin_verified' else 'upi_payment_rejected' end,jsonb_build_object('reason',p_reason));
end; $$;
revoke all on function public.admin_review_rental_upi_payment(uuid,boolean,text) from public,anon;
grant execute on function public.admin_review_rental_upi_payment(uuid,boolean,text) to authenticated;

create or replace function public.admin_complete_rental_payout(p_payment_id uuid,p_reference text,p_completed_at timestamptz)
returns void language plpgsql security definer set search_path=public,auth as $$
declare payment public.equipment_booking_payments%rowtype; booking public.equipment_bookings%rowtype;
begin
  if not public.is_rental_admin() then raise exception 'Verified Admin access is required.'; end if;
  select * into payment from public.equipment_booking_payments where id=p_payment_id for update;
  if not found or payment.status<>'admin_verified' or payment.payout_status<>'pending' then raise exception 'This payout is not pending.'; end if;
  if length(trim(coalesce(p_reference,'')))<4 or p_completed_at is null or p_completed_at>now() then raise exception 'Enter the actual transfer reference and completion time.'; end if;
  select * into booking from public.equipment_bookings where id=payment.booking_id for update;
  if booking.status<>'confirmed' then raise exception 'The owner has not confirmed this booking.'; end if;
  update public.equipment_booking_payments set status='paid',payout_status='completed',payout_reference=trim(p_reference),payout_completed_at=p_completed_at where id=payment.id;
  update public.equipment_bookings set payment_status='paid' where id=booking.id;
  insert into public.notifications(user_id,title,body) values
    (booking.owner_id,'Rental payout completed',format('Admin recorded the payout for booking %s.',coalesce(booking.booking_reference,booking.id::text))),
    (booking.renter_id,'Rental payment settled',format('Your confirmed booking %s has been settled with the equipment owner.',coalesce(booking.booking_reference,booking.id::text)));
  insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action,details) values(booking.id,payment.id,auth.uid(),'owner_payout_completed',jsonb_build_object('reference',trim(p_reference),'completed_at',p_completed_at));
end; $$;
revoke all on function public.admin_complete_rental_payout(uuid,text,timestamptz) from public,anon;
grant execute on function public.admin_complete_rental_payout(uuid,text,timestamptz) to authenticated;

create or replace function public.admin_complete_rental_refund(p_payment_id uuid,p_reference text,p_completed_at timestamptz)
returns void language plpgsql security definer set search_path=public,auth as $$
declare payment public.equipment_booking_payments%rowtype; booking public.equipment_bookings%rowtype;
begin
  if not public.is_rental_admin() then raise exception 'Verified Admin access is required.'; end if;
  select * into payment from public.equipment_booking_payments where id=p_payment_id for update;
  if not found or payment.status<>'refund_pending' or payment.refund_status<>'pending' then raise exception 'This refund is not pending.'; end if;
  if length(trim(coalesce(p_reference,'')))<4 or p_completed_at is null or p_completed_at>now() then raise exception 'Enter the actual refund reference and completion time.'; end if;
  select * into booking from public.equipment_bookings where id=payment.booking_id for update;
  update public.equipment_booking_payments set status='refunded',refund_status='completed',refund_reference=trim(p_reference),refund_completed_at=p_completed_at where id=payment.id;
  update public.equipment_bookings set status='refunded',payment_status='refunded',refund_status='completed',refund_reference=trim(p_reference),refund_completed_at=p_completed_at where id=booking.id;
  insert into public.notifications(user_id,title,body) values
    (booking.renter_id,'Rental refund completed',format('Admin recorded a refund for booking %s.',coalesce(booking.booking_reference,booking.id::text))),
    (booking.owner_id,'Rental booking refunded',format('Booking %s was refunded to the farmer.',coalesce(booking.booking_reference,booking.id::text)));
  insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action,details) values(booking.id,payment.id,auth.uid(),'farmer_refund_completed',jsonb_build_object('reference',trim(p_reference),'completed_at',p_completed_at));
end; $$;
revoke all on function public.admin_complete_rental_refund(uuid,text,timestamptz) from public,anon;
grant execute on function public.admin_complete_rental_refund(uuid,text,timestamptz) to authenticated;

-- Allow only the trusted Edge Function to override the public role setup RPC.
-- Existing Admins may continue editing profile details only while the DB
-- identity check still recognizes their verified designated email.
create or replace function public.enforce_profile_integrity()
returns trigger language plpgsql set search_path='' as $$
declare saved_role text;
declare can_keep_admin boolean := false;
begin
  if tg_op='UPDATE' and old.role='Admin' and new.role='Admin' then
    can_keep_admin := public.is_rental_admin();
  end if;
  if new.role is not null then
    select r.role into saved_role from public.user_roles r where r.user_id=new.id;
    if saved_role is distinct from new.role
       and not (new.role='Admin' and coalesce(auth.role(),'')='service_role')
       and not can_keep_admin then
      raise exception 'Choose a role through the authorized role setup flow';
    end if;
  end if;
  new.profile_complete := new.role is not null
    and length(trim(new.full_name))>=2
    and nullif(trim(new.state),'') is not null
    and nullif(trim(new.district),'') is not null
    and nullif(trim(new.village),'') is not null
    and new.pin_code ~ '^\d{6}$'
    and nullif(trim(new.address),'') is not null;
  new.updated_at := now();
  return new;
end; $$;

-- Store configurable pricing policy without exposing it to client writes.
create table if not exists public.rental_charge_settings (
  id boolean primary key default true check (id),
  farmer_base_charge numeric not null default 0 check (farmer_base_charge>=0),
  owner_base_charge numeric not null default 0 check (owner_base_charge>=0),
  free_trip_count integer not null default 2 check (free_trip_count>=0),
  per_km_charge numeric not null default 0 check (per_km_charge>=0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.rental_charge_settings enable row level security;
revoke all on public.rental_charge_settings from anon,authenticated;
grant all on public.rental_charge_settings to service_role;
insert into public.rental_charge_settings(id) values(true) on conflict(id) do nothing;
create or replace function public.admin_get_rental_charge_settings()
returns table(farmer_base_charge numeric,owner_base_charge numeric,free_trip_count integer,per_km_charge numeric)
language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.is_rental_admin() then raise exception 'Verified Admin access is required.'; end if;
  return query select s.farmer_base_charge,s.owner_base_charge,s.free_trip_count,s.per_km_charge from public.rental_charge_settings s where s.id=true;
end; $$;
revoke all on function public.admin_get_rental_charge_settings() from public,anon;
grant execute on function public.admin_get_rental_charge_settings() to authenticated;

create table if not exists public.rental_trip_counters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_trip_count integer not null default 0 check (completed_trip_count>=0),
  updated_at timestamptz not null default now()
);
alter table public.rental_trip_counters enable row level security;
revoke all on public.rental_trip_counters from anon,authenticated;
grant all on public.rental_trip_counters to service_role;

alter table public.equipment_bookings
  add column if not exists farmer_service_charge numeric not null default 0 check(farmer_service_charge>=0),
  add column if not exists owner_service_charge numeric not null default 0 check(owner_service_charge>=0),
  add column if not exists service_distance_km numeric check(service_distance_km is null or service_distance_km>=0);
alter table public.equipment_booking_payments
  add column if not exists payout_amount numeric not null default 0 check(payout_amount>=0);

create or replace function public.get_rental_delivery_quote(p_equipment_id uuid,p_farmer_lat numeric,p_farmer_lng numeric)
returns table(distance_km numeric,farmer_charge numeric,owner_charge numeric,completed_trips integer,free_trips_remaining integer)
language plpgsql security definer set search_path=public,auth as $$
declare equipment_owner uuid; farmer_trips integer; settings public.rental_charge_settings%rowtype; owner_lat numeric; owner_lng numeric; a numeric; distance numeric;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Farmer') then raise exception 'Only farmers can request a delivery charge quote.'; end if;
  if p_farmer_lat is null or p_farmer_lat not between -90 and 90 or p_farmer_lng is null or p_farmer_lng not between -180 and 180 then raise exception 'Allow browser GPS and provide valid coordinates.'; end if;
  select e.owner_id into equipment_owner from public.equipment e where e.id=p_equipment_id and e.is_available and e.listing_status='active';
  if not found then raise exception 'This equipment listing is no longer available.'; end if;
  -- `profiles.location` is a legacy text column in this project, not JSONB.
  -- Read through a row JSON representation so this function remains valid on
  -- existing schemas and safely returns no coordinates for plain-text addresses.
  select nullif(to_jsonb(p)->'location'->>'lat','')::numeric,nullif(to_jsonb(p)->'location'->>'lng','')::numeric into owner_lat,owner_lng from public.profiles p where p.id=equipment_owner;
  if owner_lat is null or owner_lng is null then raise exception 'The equipment owner has not enabled a location for delivery estimates. Choose pickup or contact the owner.'; end if;
  select * into settings from public.rental_charge_settings where id=true;
  select coalesce(c.completed_trip_count,0) into farmer_trips from public.rental_trip_counters c where c.user_id=auth.uid();
  farmer_trips:=coalesce(farmer_trips,0);
  a:=power(sin(radians(owner_lat-p_farmer_lat)/2),2)+cos(radians(p_farmer_lat))*cos(radians(owner_lat))*power(sin(radians(owner_lng-p_farmer_lng)/2),2);
  distance:=6371*2*asin(sqrt(least(1,greatest(0,a))));
  distance_km:=round(distance::numeric,2); completed_trips:=farmer_trips;
  free_trips_remaining:=greatest(0,settings.free_trip_count-farmer_trips);
  farmer_charge:=case when farmer_trips<settings.free_trip_count then 0 else settings.farmer_base_charge+settings.per_km_charge*distance end;
  owner_charge:=settings.owner_base_charge+settings.per_km_charge*distance;
  return next;
end; $$;
revoke all on function public.get_rental_delivery_quote(uuid,numeric,numeric) from public,anon;
grant execute on function public.get_rental_delivery_quote(uuid,numeric,numeric) to authenticated;

create or replace function public.create_equipment_rental_order_with_service_charges(
  p_equipment_id uuid,p_booking_start timestamptz,p_booking_end timestamptz,p_rate_period text,
  p_delivery_requested boolean,p_delivery_address jsonb,p_farmer_lat numeric default null,p_farmer_lng numeric default null
) returns table(booking_id uuid,booking_reference text,total_amount numeric,farmer_service_charge numeric,owner_service_charge numeric,service_distance_km numeric)
language plpgsql security definer set search_path=public,auth as $$
declare created record; quote record; farmer_fee numeric:=0; owner_fee numeric:=0; km numeric:=null;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  if p_delivery_requested then
    select * into quote from public.get_rental_delivery_quote(p_equipment_id,p_farmer_lat,p_farmer_lng);
    farmer_fee:=quote.farmer_charge; owner_fee:=quote.owner_charge; km:=quote.distance_km;
  end if;
  select * into created from public.create_equipment_rental_order(p_equipment_id,p_booking_start,p_booking_end,p_rate_period,p_delivery_requested,p_delivery_address);
  update public.equipment_bookings b set total_amount=b.total_amount+farmer_fee,farmer_service_charge=farmer_fee,owner_service_charge=owner_fee,service_distance_km=km where b.id=created.booking_id;
  return query select created.booking_id,created.booking_reference,created.total_amount+farmer_fee,farmer_fee,owner_fee,km;
end; $$;
revoke all on function public.create_equipment_rental_order_with_service_charges(uuid,timestamptz,timestamptz,text,boolean,jsonb,numeric,numeric) from public,anon;
grant execute on function public.create_equipment_rental_order_with_service_charges(uuid,timestamptz,timestamptz,text,boolean,jsonb,numeric,numeric) to authenticated;

create or replace function public.create_cod_equipment_rental_order_with_service_charges(
  p_equipment_id uuid,p_booking_start timestamptz,p_booking_end timestamptz,p_rate_period text,
  p_delivery_requested boolean,p_delivery_address jsonb,p_farmer_lat numeric default null,p_farmer_lng numeric default null
) returns table(booking_id uuid,booking_reference text,total_amount numeric)
language plpgsql security definer set search_path=public,auth as $$
declare created record; payment_id uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Farmer') then raise exception 'Only farmers can create COD rentals.'; end if;
  select * into created from public.create_equipment_rental_order_with_service_charges(p_equipment_id,p_booking_start,p_booking_end,p_rate_period,p_delivery_requested,p_delivery_address,p_farmer_lat,p_farmer_lng);
  update public.equipment_bookings set status='confirmed',payment_method='cod',payment_status='pending' where id=created.booking_id;
  insert into public.equipment_booking_payments(booking_id,renter_id,method,amount,status) values(created.booking_id,auth.uid(),'cod',created.total_amount,'pending') returning id into payment_id;
  insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action,details) values(created.booking_id,payment_id,auth.uid(),'cod_booking_confirmed',jsonb_build_object('amount',created.total_amount,'farmer_service_charge',created.farmer_service_charge,'owner_service_charge',created.owner_service_charge,'distance_km',created.service_distance_km));
  insert into public.notifications(user_id,title,body) values
    ((select owner_id from public.equipment_bookings where id=created.booking_id),'New COD rental booking',format('A cash-on-delivery rental %s is confirmed. Collect cash at handover.',created.booking_reference)),
    (auth.uid(),'COD booking confirmed',format('Your cash-on-delivery rental %s is confirmed.',created.booking_reference));
  return query select created.booking_id,created.booking_reference,created.total_amount;
end; $$;
revoke all on function public.create_cod_equipment_rental_order_with_service_charges(uuid,timestamptz,timestamptz,text,boolean,jsonb,numeric,numeric) from public,anon;
grant execute on function public.create_cod_equipment_rental_order_with_service_charges(uuid,timestamptz,timestamptz,text,boolean,jsonb,numeric,numeric) to authenticated;

create or replace function public.set_owner_rental_payout_amount()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.payout_status='pending' and old.payout_status is distinct from 'pending' then
    select greatest(0,b.total_amount-coalesce(b.owner_service_charge,0)) into new.payout_amount from public.equipment_bookings b where b.id=new.booking_id;
  end if;
  return new;
end; $$;
drop trigger if exists owner_rental_payout_amount on public.equipment_booking_payments;
create trigger owner_rental_payout_amount before update of payout_status on public.equipment_booking_payments for each row execute function public.set_owner_rental_payout_amount();

create table if not exists public.rental_tracking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.equipment_bookings(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  actor_role text not null check(actor_role in ('Farmer','Equipment Owner','Delivery Partner')),
  latitude numeric not null check(latitude between -90 and 90),
  longitude numeric not null check(longitude between -180 and 180),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists rental_tracking_events_booking_time_idx on public.rental_tracking_events(booking_id,recorded_at desc);
alter table public.rental_tracking_events enable row level security;
drop policy if exists "rental participants read tracking" on public.rental_tracking_events;
create policy "rental participants read tracking" on public.rental_tracking_events for select to authenticated using (
  exists(select 1 from public.equipment_bookings b where b.id=booking_id and (b.renter_id=auth.uid() or b.owner_id=auth.uid()))
  or public.is_rental_admin()
);
revoke insert,update,delete on public.rental_tracking_events from anon,authenticated;
grant insert on public.rental_tracking_events to service_role;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_logs enable row level security;
drop policy if exists "verified admins read admin audit" on public.admin_audit_logs;
create policy "verified admins read admin audit" on public.admin_audit_logs for select to authenticated using(public.is_rental_admin());
revoke insert,update,delete on public.admin_audit_logs from anon,authenticated;
grant select on public.admin_audit_logs to authenticated;

create or replace function public.audit_rental_admin_settings()
returns trigger language plpgsql security definer set search_path=public,auth as $$
declare actor uuid;
begin
  actor:=coalesce(new.updated_by,auth.uid());
  insert into public.admin_audit_logs(actor_id,action,target,details)
    values(actor,case when tg_table_name='rental_payment_settings' then 'rental_payment_settings_updated' else 'rental_charge_settings_updated' end,tg_table_name,
      jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)));
  return new;
end; $$;
drop trigger if exists rental_payment_settings_audit on public.rental_payment_settings;
create trigger rental_payment_settings_audit after update on public.rental_payment_settings for each row execute function public.audit_rental_admin_settings();
drop trigger if exists rental_charge_settings_audit on public.rental_charge_settings;
create trigger rental_charge_settings_audit after update on public.rental_charge_settings for each row execute function public.audit_rental_admin_settings();

create or replace function public.record_rental_tracking_point(p_booking_id uuid,p_latitude numeric,p_longitude numeric)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype; actor_role text; point_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  select * into booking from public.equipment_bookings where id=p_booking_id for update;
  if not found or booking.status not in ('confirmed','accepted') then raise exception 'Tracking is available only during an active rental.'; end if;
  if auth.uid()=booking.renter_id then actor_role:='Farmer';
  elsif auth.uid()=booking.owner_id then actor_role:='Equipment Owner';
  elsif exists(select 1 from public.delivery_jobs j where j.customer_id=booking.renter_id and j.partner_id=auth.uid() and j.status not in ('completed','cancelled')) then actor_role:='Delivery Partner';
  else raise exception 'You are not a tracking participant for this rental.'; end if;
  if p_latitude is null or p_latitude not between -90 and 90 or p_longitude is null or p_longitude not between -180 and 180 then raise exception 'Invalid GPS coordinates.'; end if;
  insert into public.rental_tracking_events(booking_id,actor_id,actor_role,latitude,longitude) values(p_booking_id,auth.uid(),actor_role,p_latitude,p_longitude) returning id into point_id;
  return point_id;
end; $$;
revoke all on function public.record_rental_tracking_point(uuid,numeric,numeric) from public,anon;
grant execute on function public.record_rental_tracking_point(uuid,numeric,numeric) to authenticated;

-- Stop GPS collection when rental is completed or cancelled. Historical points remain readable.
create or replace function public.rental_tracking_is_active(p_booking_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.equipment_bookings b where b.id=p_booking_id and b.status in ('confirmed','accepted'));
$$;
revoke all on function public.rental_tracking_is_active(uuid) from public,anon;
grant execute on function public.rental_tracking_is_active(uuid) to authenticated;

-- Admin pricing settings can only be changed through a server-verified admin identity.
create or replace function public.admin_set_rental_charge_settings(p_farmer_base numeric,p_owner_base numeric,p_free_trips integer,p_per_km numeric)
returns void language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.is_rental_admin() then raise exception 'Verified Admin access is required.'; end if;
  if p_farmer_base<0 or p_owner_base<0 or p_free_trips<0 or p_per_km<0 then raise exception 'Charges cannot be negative.'; end if;
  update public.rental_charge_settings set farmer_base_charge=p_farmer_base,owner_base_charge=p_owner_base,free_trip_count=p_free_trips,per_km_charge=p_per_km,updated_by=auth.uid(),updated_at=now() where id=true;
end; $$;
revoke all on function public.admin_set_rental_charge_settings(numeric,numeric,integer,numeric) from public,anon;
grant execute on function public.admin_set_rental_charge_settings(numeric,numeric,integer,numeric) to authenticated;

create or replace function public.get_rental_charge_quote(p_user_id uuid,p_distance_km numeric)
returns table(farmer_charge numeric,owner_charge numeric,farmer_trips_used integer,free_trips_remaining integer)
language plpgsql security definer set search_path=public,auth as $$
declare settings public.rental_charge_settings%rowtype; trips integer;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'You can only quote charges for your account.'; end if;
  if p_distance_km is null or p_distance_km<0 then raise exception 'Distance must be non-negative.'; end if;
  select * into settings from public.rental_charge_settings where id=true;
  select coalesce(c.completed_trip_count,0) into trips from public.rental_trip_counters c where c.user_id=p_user_id;
  trips:=coalesce(trips,0);
  farmer_trips_used:=trips;
  free_trips_remaining:=greatest(0,settings.free_trip_count-trips);
  farmer_charge:=case when trips<settings.free_trip_count then 0 else settings.farmer_base_charge+settings.per_km_charge*p_distance_km end;
  owner_charge:=settings.owner_base_charge+settings.per_km_charge*p_distance_km;
  return next;
end; $$;
revoke all on function public.get_rental_charge_quote(uuid,numeric) from public,anon;
grant execute on function public.get_rental_charge_quote(uuid,numeric) to authenticated;

create or replace function public.owner_complete_equipment_rental(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Equipment Owner') then raise exception 'Equipment Owner access is required.'; end if;
  select * into booking from public.equipment_bookings where id=p_booking_id and owner_id=auth.uid() for update;
  if not found or booking.status<>'confirmed' then raise exception 'Only a confirmed rental can be completed.'; end if;
  if booking.payment_status<>'paid' then raise exception 'Confirm payment collection before completing this rental.'; end if;
  update public.equipment_bookings set status='completed' where id=booking.id;
  insert into public.rental_trip_counters(user_id,completed_trip_count,updated_at) values(booking.renter_id,1,now())
    on conflict(user_id) do update set completed_trip_count=public.rental_trip_counters.completed_trip_count+1,updated_at=now();
  insert into public.notifications(user_id,title,body) values(booking.renter_id,'Rental completed',format('Booking %s is complete. GPS sharing has ended and trip progress was saved.',coalesce(booking.booking_reference,booking.id::text)));
  insert into public.rental_payment_audit_logs(booking_id,actor_id,action) values(booking.id,auth.uid(),'equipment_rental_completed');
end; $$;
revoke all on function public.owner_complete_equipment_rental(uuid) from public,anon;
grant execute on function public.owner_complete_equipment_rental(uuid) to authenticated;
