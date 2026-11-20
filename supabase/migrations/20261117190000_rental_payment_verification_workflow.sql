-- Manual UPI verification, owner approval, COD collection and auditable settlement.
-- Admin is provisioned by trusted tooling; save_user_role() does not expose it.
do $$
begin
  if to_regtype('public.app_role') is not null then
    execute 'alter type public.app_role add value if not exists ''admin''';
  end if;
  alter table public.profiles drop constraint if exists profiles_role_check;
  alter table public.profiles drop constraint if exists profiles_role_allowed_check;
  alter table public.profiles add constraint profiles_role_allowed_check
    check (role is null or role in ('Farmer','Equipment Owner','Customer','Delivery Partner','Ride Booking Partner','Market Seller','Event Manager','Food Seller','Admin'));
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_roles' and column_name='role' and data_type <> 'USER-DEFINED') then
    alter table public.user_roles drop constraint if exists user_roles_role_check;
    alter table public.user_roles add constraint user_roles_role_check
      check (role in ('Farmer','Equipment Owner','Customer','Delivery Partner','Ride Booking Partner','Market Seller','Event Manager','Food Seller','Admin'));
  end if;
end;
$$;

create or replace function public.prevent_self_provisioned_rental_admin()
returns trigger language plpgsql set search_path=public,auth as $$
begin
  if new.role='Admin' then
    if tg_op='INSERT' and coalesce(auth.role(),'') not in ('service_role','supabase_admin') and current_user not in ('postgres','supabase_admin') then
      raise exception 'Admin access must be provisioned by a trusted administrator.';
    elsif tg_op='UPDATE' and old.role is distinct from 'Admin'
       and coalesce(auth.role(),'') not in ('service_role','supabase_admin') and current_user not in ('postgres','supabase_admin') then
      raise exception 'Admin access must be provisioned by a trusted administrator.';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists prevent_self_provisioned_rental_admin on public.profiles;
create trigger prevent_self_provisioned_rental_admin before insert or update of role on public.profiles
  for each row execute function public.prevent_self_provisioned_rental_admin();

create or replace function public.is_rental_admin()
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Admin');
$$;
revoke all on function public.is_rental_admin() from public,anon;
grant execute on function public.is_rental_admin() to authenticated;

alter table public.equipment_bookings
  add column if not exists refund_status text not null default 'not_requested',
  add column if not exists refund_reference text,
  add column if not exists refund_completed_at timestamptz;
alter table public.equipment_bookings drop constraint if exists equipment_bookings_status_check;
alter table public.equipment_bookings add constraint equipment_bookings_status_check check (status in (
  'pending','accepted','rejected','cancelled','completed','payment_verification_pending',
  'waiting_owner_approval','confirmed','refund_pending','refunded'
));
alter table public.equipment_bookings drop constraint if exists equipment_bookings_payment_status_check;
alter table public.equipment_bookings add constraint equipment_bookings_payment_status_check
  check (payment_status in ('pending','processing','paid','failed','refunded','pending_verification','admin_verified','rejected','refund_pending'));
alter table public.equipment_bookings drop constraint if exists equipment_bookings_refund_status_check;
alter table public.equipment_bookings add constraint equipment_bookings_refund_status_check
  check (refund_status in ('not_requested','pending','completed'));

-- Confirmed COD and admin-verified bookings must reserve their date range as well.
create or replace function public.guard_equipment_rental_overlap()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('pending','accepted','payment_verification_pending','waiting_owner_approval','confirmed') then
    perform 1 from public.equipment where id=new.equipment_id for update;
    if exists(select 1 from public.equipment_bookings b where b.equipment_id=new.equipment_id and b.id<>new.id
      and b.status in ('pending','accepted','payment_verification_pending','waiting_owner_approval','confirmed')
      and b.booking_start<new.booking_end and b.booking_end>new.booking_start) then
      raise exception 'These rental dates overlap another active booking.';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists equipment_booking_overlap_guard on public.equipment_bookings;
create trigger equipment_booking_overlap_guard before insert or update of equipment_id,booking_start,booking_end,status
  on public.equipment_bookings for each row execute function public.guard_equipment_rental_overlap();

alter table public.equipment_booking_payments
  add column if not exists utr_number text,
  add column if not exists transaction_amount numeric,
  add column if not exists transaction_at timestamptz,
  add column if not exists screenshot_path text,
  add column if not exists verified_by uuid references auth.users(id),
  add column if not exists verified_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists payout_status text not null default 'not_requested',
  add column if not exists payout_reference text,
  add column if not exists payout_completed_at timestamptz,
  add column if not exists refund_status text not null default 'not_requested',
  add column if not exists refund_reference text,
  add column if not exists refund_completed_at timestamptz;
alter table public.equipment_booking_payments drop constraint if exists equipment_booking_payments_status_check;
alter table public.equipment_booking_payments add constraint equipment_booking_payments_status_check
  check (status in ('pending','processing','paid','failed','refunded','pending_verification','admin_verified','rejected','refund_pending'));
alter table public.equipment_booking_payments drop constraint if exists equipment_booking_payments_method_check;
alter table public.equipment_booking_payments add constraint equipment_booking_payments_method_check
  check (method in ('upi','cod','credit_card','debit_card','net_banking'));
alter table public.equipment_booking_payments drop constraint if exists equipment_booking_payments_payout_status_check;
alter table public.equipment_booking_payments add constraint equipment_booking_payments_payout_status_check
  check (payout_status in ('not_requested','pending','completed'));
alter table public.equipment_booking_payments drop constraint if exists equipment_booking_payments_refund_status_check;
alter table public.equipment_booking_payments add constraint equipment_booking_payments_refund_status_check
  check (refund_status in ('not_requested','pending','completed'));
create unique index if not exists equipment_booking_payments_utr_unique
  on public.equipment_booking_payments (upper(utr_number)) where utr_number is not null;
create index if not exists equipment_booking_payments_review_idx on public.equipment_booking_payments(status,created_at desc);
create index if not exists equipment_booking_payments_payout_idx on public.equipment_booking_payments(payout_status,created_at desc);
create index if not exists equipment_booking_payments_refund_idx on public.equipment_booking_payments(refund_status,created_at desc);

create table if not exists public.rental_payment_settings (
  id boolean primary key default true check (id),
  receiver_upi_id text not null default '',
  receiver_name text not null default 'KHETIGO',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.rental_payment_settings enable row level security;
drop policy if exists "admin manages rental payment settings" on public.rental_payment_settings;
create policy "admin manages rental payment settings" on public.rental_payment_settings
  for all to authenticated using (public.is_rental_admin())
  with check (public.is_rental_admin());
insert into public.rental_payment_settings(id) values(true) on conflict(id) do nothing;

create table if not exists public.rental_payment_audit_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.equipment_bookings(id) on delete cascade,
  payment_id uuid references public.equipment_booking_payments(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.rental_payment_audit_logs enable row level security;
drop policy if exists "rental payment audit participants read" on public.rental_payment_audit_logs;
create policy "rental payment audit participants read" on public.rental_payment_audit_logs
  for select to authenticated using (
    exists(select 1 from public.equipment_bookings b where b.id=booking_id and (b.renter_id=auth.uid() or b.owner_id=auth.uid()))
    or public.is_rental_admin()
  );

drop policy if exists "booking payments renter create pending" on public.equipment_booking_payments;
drop policy if exists "booking payments renter read" on public.equipment_booking_payments;
create policy "booking participants read rental payments" on public.equipment_booking_payments
  for select to authenticated using (
    renter_id=auth.uid()
    or exists(select 1 from public.equipment_bookings b where b.id=booking_id and b.owner_id=auth.uid())
    or public.is_rental_admin()
  );
drop policy if exists "booking participants read" on public.equipment_bookings;
create policy "booking participants read" on public.equipment_bookings
  for select to authenticated using (renter_id=auth.uid() or owner_id=auth.uid()
    or public.is_rental_admin());
drop policy if exists "equipment owner responds" on public.equipment_bookings;
drop policy if exists "rental admin reads equipment details" on public.equipment;
create policy "rental admin reads equipment details" on public.equipment
  for select to authenticated using (public.is_rental_admin());
drop policy if exists "admin reads rental counterpart profiles" on public.profiles;
create policy "admin reads rental counterpart profiles" on public.profiles
  for select to authenticated using (public.is_rental_admin());
drop policy if exists "rental participants read counterpart profiles" on public.profiles;
create policy "rental participants read counterpart profiles" on public.profiles
  for select to authenticated using (
    exists(select 1 from public.equipment_bookings b where
      (b.renter_id=auth.uid() and b.owner_id=profiles.id) or (b.owner_id=auth.uid() and b.renter_id=profiles.id))
  );

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('rental-payment-proofs','rental-payment-proofs',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "rental proof owner upload" on storage.objects;
create policy "rental proof owner upload" on storage.objects for insert to authenticated
  with check(bucket_id='rental-payment-proofs' and (storage.foldername(name))[1]=auth.uid()::text
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Farmer'));
drop policy if exists "rental proof participants read" on storage.objects;
create policy "rental proof participants read" on storage.objects for select to authenticated
  using(bucket_id='rental-payment-proofs' and exists(
    select 1 from public.equipment_booking_payments p join public.equipment_bookings b on b.id=p.booking_id
    where p.screenshot_path=name and (b.renter_id=auth.uid() or b.owner_id=auth.uid()
      or exists(select 1 from public.profiles a where a.id=auth.uid() and a.role='Admin'))
  ));

create or replace function public.get_rental_upi_settings()
returns table(receiver_upi_id text,receiver_name text)
language plpgsql security definer set search_path=public,auth as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Farmer') then
    raise exception 'Only signed-in farmers can read rental payment instructions.';
  end if;
  return query select s.receiver_upi_id,s.receiver_name from public.rental_payment_settings s where s.id=true;
end; $$;
revoke all on function public.get_rental_upi_settings() from public,anon;
grant execute on function public.get_rental_upi_settings() to authenticated;

create or replace function public.admin_get_rental_upi_settings()
returns table(receiver_upi_id text,receiver_name text)
language plpgsql security definer set search_path=public,auth as $$
begin
  if auth.uid() is null or not public.is_rental_admin() then raise exception 'Admin access is required.'; end if;
  return query select s.receiver_upi_id,s.receiver_name from public.rental_payment_settings s where s.id=true;
end; $$;
revoke all on function public.admin_get_rental_upi_settings() from public,anon;
grant execute on function public.admin_get_rental_upi_settings() to authenticated;

create or replace function public.admin_set_rental_upi_settings(p_receiver_upi_id text,p_receiver_name text)
returns void language plpgsql security definer set search_path=public,auth as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Admin') then
    raise exception 'Admin access is required.';
  end if;
  if length(trim(coalesce(p_receiver_upi_id,''))) < 4 or length(trim(coalesce(p_receiver_upi_id,''))) > 120
     or trim(coalesce(p_receiver_name,''))='' then raise exception 'Enter a valid receiver UPI ID and display name.'; end if;
  update public.rental_payment_settings set receiver_upi_id=trim(p_receiver_upi_id),receiver_name=trim(p_receiver_name),updated_by=auth.uid(),updated_at=now() where id=true;
end; $$;
revoke all on function public.admin_set_rental_upi_settings(text,text) from public,anon;
grant execute on function public.admin_set_rental_upi_settings(text,text) to authenticated;

create or replace function public.create_cod_equipment_rental_order(
  p_equipment_id uuid,p_booking_start timestamptz,p_booking_end timestamptz,p_rate_period text,
  p_delivery_requested boolean,p_delivery_address jsonb
) returns table(booking_id uuid,booking_reference text,total_amount numeric)
language plpgsql security definer set search_path=public,auth as $$
declare created record; payment_id uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Farmer') then raise exception 'Only farmers can create COD rentals.'; end if;
  select * into created from public.create_equipment_rental_order(p_equipment_id,p_booking_start,p_booking_end,p_rate_period,p_delivery_requested,p_delivery_address);
  update public.equipment_bookings set status='confirmed',payment_method='cod',payment_status='pending' where id=created.booking_id;
  insert into public.equipment_booking_payments(booking_id,renter_id,method,amount,status)
    values(created.booking_id,auth.uid(),'cod',created.total_amount,'pending') returning id into payment_id;
  insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action,details)
    values(created.booking_id,payment_id,auth.uid(),'cod_booking_confirmed',jsonb_build_object('amount',created.total_amount));
  insert into public.notifications(user_id,title,body) values
    ((select owner_id from public.equipment_bookings where id=created.booking_id),'New COD rental booking',format('A cash-on-delivery rental %s is confirmed. Collect cash when the equipment is handed over.',created.booking_reference)),
    (auth.uid(),'COD booking confirmed',format('Your cash-on-delivery rental %s is confirmed. Payment is due to the equipment owner.',created.booking_reference));
  return query select created.booking_id,created.booking_reference,created.total_amount;
end; $$;
revoke all on function public.create_cod_equipment_rental_order(uuid,timestamptz,timestamptz,text,boolean,jsonb) from public,anon;
grant execute on function public.create_cod_equipment_rental_order(uuid,timestamptz,timestamptz,text,boolean,jsonb) to authenticated;

create or replace function public.submit_upi_rental_payment(
  p_booking_id uuid,p_utr_number text,p_transaction_amount numeric,p_transaction_at timestamptz,p_screenshot_path text
) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype; payment_id uuid; admins uuid[];
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Farmer') then raise exception 'Only farmers can submit UPI payment proof.'; end if;
  select * into booking from public.equipment_bookings where id=p_booking_id and renter_id=auth.uid() for update;
  if not found then raise exception 'Rental booking was not found.'; end if;
  if booking.status not in ('pending','payment_verification_pending') or not (
    booking.payment_method is null or booking.payment_method in ('upi','upi_intent')
    or booking.payment_status='pending' and booking.payment_method in ('credit_card','debit_card','net_banking')
  ) then raise exception 'This booking is not awaiting UPI payment proof.'; end if;
  if length(trim(coalesce(p_utr_number,''))) not between 6 and 40 or trim(p_utr_number) !~ '^[A-Za-z0-9-]+$' then raise exception 'Enter a valid UTR or transaction reference.'; end if;
  if p_transaction_amount is null or p_transaction_amount<=0 or abs(p_transaction_amount-booking.total_amount)>0.01 then raise exception 'Transaction amount must match the rental total.'; end if;
  if p_transaction_at is null or p_transaction_at>now() or p_transaction_at<now()-interval '14 days' then raise exception 'Enter a recent transaction date and time.'; end if;
  if p_screenshot_path is null or p_screenshot_path !~ ('^'||auth.uid()::text||'/'||p_booking_id::text||'/[A-Za-z0-9._-]+$') then raise exception 'Upload a payment screenshot first.'; end if;
  if exists(select 1 from public.equipment_booking_payments where booking_id=p_booking_id and status in ('pending_verification','admin_verified','refund_pending','paid')) then raise exception 'Payment proof has already been submitted for this booking.'; end if;
  insert into public.equipment_booking_payments(booking_id,renter_id,method,amount,status,utr_number,transaction_amount,transaction_at,screenshot_path)
  values(p_booking_id,auth.uid(),'upi',booking.total_amount,'pending_verification',upper(trim(p_utr_number)),p_transaction_amount,p_transaction_at,p_screenshot_path)
  returning id into payment_id;
  update public.equipment_bookings set status='payment_verification_pending',payment_method='upi',payment_status='pending_verification' where id=p_booking_id;
  insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action,details)
    values(p_booking_id,payment_id,auth.uid(),'upi_proof_submitted',jsonb_build_object('utr',upper(trim(p_utr_number)),'amount',p_transaction_amount));
  select array_agg(id) into admins from public.profiles where role='Admin';
  if coalesce(array_length(admins,1),0)>0 then
    insert into public.notifications(user_id,title,body) select unnest(admins),'UPI payment submitted',format('Booking %s has UPI proof waiting for manual verification.',coalesce(booking.booking_reference,p_booking_id::text));
  end if;
  insert into public.notifications(user_id,title,body) values(auth.uid(),'Payment submitted for verification',format('Your UPI payment for booking %s is pending admin verification.',coalesce(booking.booking_reference,p_booking_id::text)));
  return payment_id;
end; $$;
revoke all on function public.submit_upi_rental_payment(uuid,text,numeric,timestamptz,text) from public,anon;
grant execute on function public.submit_upi_rental_payment(uuid,text,numeric,timestamptz,text) to authenticated;

create or replace function public.admin_review_rental_upi_payment(p_payment_id uuid,p_accept boolean,p_reason text default null)
returns void language plpgsql security definer set search_path=public,auth as $$
declare payment public.equipment_booking_payments%rowtype; booking public.equipment_bookings%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Admin') then raise exception 'Admin access is required.'; end if;
  select * into payment from public.equipment_booking_payments where id=p_payment_id and method='upi' for update;
  if not found or payment.status<>'pending_verification' then raise exception 'This payment is not awaiting verification.'; end if;
  select * into booking from public.equipment_bookings where id=payment.booking_id for update;
  if p_accept then
    update public.equipment_booking_payments set status='admin_verified',verified_by=auth.uid(),verified_at=now(),rejection_reason=null where id=p_payment_id;
    update public.equipment_bookings set status='waiting_owner_approval',payment_status='admin_verified' where id=booking.id;
    insert into public.notifications(user_id,title,body) values(booking.owner_id,'Payment verified; booking needs your decision',format('Booking %s has a manually verified UPI payment.',coalesce(booking.booking_reference,booking.id::text))),
      (booking.renter_id,'UPI payment verified',format('Your payment for booking %s was verified. Waiting for equipment owner approval.',coalesce(booking.booking_reference,booking.id::text)));
  else
    if length(trim(coalesce(p_reason,'')))<4 then raise exception 'Provide a reason for rejecting this payment.'; end if;
    update public.equipment_booking_payments set status='rejected',verified_by=auth.uid(),verified_at=now(),rejection_reason=trim(p_reason) where id=p_payment_id;
    update public.equipment_bookings set status='rejected',payment_status='rejected' where id=booking.id;
    insert into public.notifications(user_id,title,body) values(booking.renter_id,'UPI payment not verified',format('Payment proof for booking %s was rejected: %s',coalesce(booking.booking_reference,booking.id::text),trim(p_reason)));
  end if;
  insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action,details)
    values(booking.id,p_payment_id,auth.uid(),case when p_accept then 'upi_payment_admin_verified' else 'upi_payment_rejected' end,jsonb_build_object('reason',p_reason));
end; $$;
revoke all on function public.admin_review_rental_upi_payment(uuid,boolean,text) from public,anon;
grant execute on function public.admin_review_rental_upi_payment(uuid,boolean,text) to authenticated;

create or replace function public.owner_decide_equipment_booking(p_booking_id uuid,p_accept boolean,p_reason text default null)
returns void language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype; payment public.equipment_booking_payments%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Equipment Owner') then raise exception 'Equipment owner access is required.'; end if;
  select * into booking from public.equipment_bookings where id=p_booking_id and owner_id=auth.uid() for update;
  if not found or booking.status<>'waiting_owner_approval' or booking.payment_status<>'admin_verified' then raise exception 'Only admin-verified bookings can be approved.'; end if;
  select * into payment from public.equipment_booking_payments where booking_id=booking.id and status='admin_verified' order by created_at desc limit 1 for update;
  if not found then raise exception 'Verified payment record is missing.'; end if;
  if p_accept then
    update public.equipment_bookings set status='confirmed' where id=booking.id;
    update public.equipment_booking_payments set payout_status='pending' where id=payment.id;
    insert into public.notifications(user_id,title,body) values(booking.renter_id,'Rental booking confirmed',format('The owner accepted booking %s.',coalesce(booking.booking_reference,booking.id::text)));
    insert into public.notifications(user_id,title,body) select id,'Owner accepted a verified rental',format('Booking %s needs an owner payout.',coalesce(booking.booking_reference,booking.id::text)) from public.profiles where role='Admin';
    insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action) values(booking.id,payment.id,auth.uid(),'owner_accepted_verified_booking');
  else
    if length(trim(coalesce(p_reason,'')))<4 then raise exception 'Provide a reason for rejecting this booking.'; end if;
    update public.equipment_bookings set status='refund_pending',payment_status='refund_pending',refund_status='pending' where id=booking.id;
    update public.equipment_booking_payments set status='refund_pending',refund_status='pending',rejection_reason=trim(p_reason) where id=payment.id;
    insert into public.notifications(user_id,title,body) values(booking.renter_id,'Rental rejected; refund pending',format('The owner rejected booking %s: %s. An admin refund is pending.',coalesce(booking.booking_reference,booking.id::text),trim(p_reason)));
    insert into public.notifications(user_id,title,body) select id,'Refund request created',format('Owner rejected booking %s; refund the verified payment.',coalesce(booking.booking_reference,booking.id::text)) from public.profiles where role='Admin';
    insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action,details) values(booking.id,payment.id,auth.uid(),'owner_rejected_verified_booking',jsonb_build_object('reason',trim(p_reason)));
  end if;
end; $$;
revoke all on function public.owner_decide_equipment_booking(uuid,boolean,text) from public,anon;
grant execute on function public.owner_decide_equipment_booking(uuid,boolean,text) to authenticated;

create or replace function public.owner_mark_cod_rental_paid(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype; payment public.equipment_booking_payments%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Equipment Owner') then raise exception 'Equipment owner access is required.'; end if;
  select * into booking from public.equipment_bookings where id=p_booking_id and owner_id=auth.uid() for update;
  if not found or booking.status<>'confirmed' or booking.payment_method<>'cod' or booking.payment_status<>'pending' then raise exception 'This is not an unpaid confirmed COD booking.'; end if;
  select * into payment from public.equipment_booking_payments where booking_id=booking.id and method='cod' and status='pending' order by created_at desc limit 1 for update;
  if not found then raise exception 'COD payment record was not found.'; end if;
  update public.equipment_booking_payments set status='paid',verified_by=auth.uid(),verified_at=now() where id=payment.id;
  update public.equipment_bookings set payment_status='paid' where id=booking.id;
  insert into public.notifications(user_id,title,body) values(booking.renter_id,'COD payment received',format('The owner marked cash as collected for booking %s.',coalesce(booking.booking_reference,booking.id::text)));
  insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action) values(booking.id,payment.id,auth.uid(),'cod_cash_collected');
end; $$;
revoke all on function public.owner_mark_cod_rental_paid(uuid) from public,anon;
grant execute on function public.owner_mark_cod_rental_paid(uuid) to authenticated;

create or replace function public.admin_complete_rental_payout(p_payment_id uuid,p_reference text,p_completed_at timestamptz)
returns void language plpgsql security definer set search_path=public,auth as $$
declare payment public.equipment_booking_payments%rowtype; booking public.equipment_bookings%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Admin') then raise exception 'Admin access is required.'; end if;
  select * into payment from public.equipment_booking_payments where id=p_payment_id for update;
  if not found or payment.status<>'admin_verified' or payment.payout_status<>'pending' then raise exception 'This payout is not pending.'; end if;
  if length(trim(coalesce(p_reference,'')))<4 or p_completed_at is null or p_completed_at>now() then raise exception 'Enter the actual transfer reference and completion time.'; end if;
  select * into booking from public.equipment_bookings where id=payment.booking_id for update;
  if booking.status<>'confirmed' then raise exception 'The owner has not confirmed this booking.'; end if;
  update public.equipment_booking_payments set status='paid',payout_status='completed',payout_reference=trim(p_reference),payout_completed_at=p_completed_at where id=payment.id;
  update public.equipment_bookings set payment_status='paid' where id=booking.id;
  insert into public.notifications(user_id,title,body) values(booking.owner_id,'Rental payout completed',format('Admin recorded the payout for booking %s.',coalesce(booking.booking_reference,booking.id::text))),
    (booking.renter_id,'Rental payment settled',format('Your confirmed booking %s has been settled with the equipment owner.',coalesce(booking.booking_reference,booking.id::text)));
  insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action,details) values(booking.id,payment.id,auth.uid(),'owner_payout_completed',jsonb_build_object('reference',trim(p_reference),'completed_at',p_completed_at));
end; $$;
revoke all on function public.admin_complete_rental_payout(uuid,text,timestamptz) from public,anon;
grant execute on function public.admin_complete_rental_payout(uuid,text,timestamptz) to authenticated;

create or replace function public.admin_complete_rental_refund(p_payment_id uuid,p_reference text,p_completed_at timestamptz)
returns void language plpgsql security definer set search_path=public,auth as $$
declare payment public.equipment_booking_payments%rowtype; booking public.equipment_bookings%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Admin') then raise exception 'Admin access is required.'; end if;
  select * into payment from public.equipment_booking_payments where id=p_payment_id for update;
  if not found or payment.status<>'refund_pending' or payment.refund_status<>'pending' then raise exception 'This refund is not pending.'; end if;
  if length(trim(coalesce(p_reference,'')))<4 or p_completed_at is null or p_completed_at>now() then raise exception 'Enter the actual refund reference and completion time.'; end if;
  select * into booking from public.equipment_bookings where id=payment.booking_id for update;
  update public.equipment_booking_payments set status='refunded',refund_status='completed',refund_reference=trim(p_reference),refund_completed_at=p_completed_at where id=payment.id;
  update public.equipment_bookings set status='refunded',payment_status='refunded',refund_status='completed',refund_reference=trim(p_reference),refund_completed_at=p_completed_at where id=booking.id;
  insert into public.notifications(user_id,title,body) values(booking.renter_id,'Rental refund completed',format('Admin recorded a refund for booking %s.',coalesce(booking.booking_reference,booking.id::text))),
    (booking.owner_id,'Rental booking refunded',format('Booking %s was refunded to the farmer.',coalesce(booking.booking_reference,booking.id::text)));
  insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action,details) values(booking.id,payment.id,auth.uid(),'farmer_refund_completed',jsonb_build_object('reference',trim(p_reference),'completed_at',p_completed_at));
end; $$;
revoke all on function public.admin_complete_rental_refund(uuid,text,timestamptz) from public,anon;
grant execute on function public.admin_complete_rental_refund(uuid,text,timestamptz) to authenticated;

