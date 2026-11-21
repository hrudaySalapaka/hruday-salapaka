alter table public.equipment_bookings
  add column if not exists delivery_type text check (delivery_type is null or delivery_type in ('partner_delivery','owner_delivery','farmer_pickup')),
  add column if not exists owner_payment_status text not null default 'not_paid' check (owner_payment_status in ('paid','not_paid'));
update public.equipment_bookings set owner_payment_status=case when payment_status in ('paid','admin_verified') then 'paid' else 'not_paid' end;
alter table public.delivery_jobs
  add column if not exists rental_booking_id uuid references public.equipment_bookings(id) on delete cascade;
create unique index if not exists delivery_jobs_rental_booking_uidx on public.delivery_jobs(rental_booking_id) where rental_booking_id is not null;

drop policy if exists "equipment visible" on public.equipment;
create policy "equipment visible" on public.equipment for select to authenticated using (
  (is_available and listing_status='active') or owner_id=auth.uid()
  or exists(select 1 from public.equipment_bookings b where b.equipment_id=equipment.id and b.status in ('confirmed','delivered'))
);
drop policy if exists "equipment photos farmer read active listings" on public.equipment_photos;
create policy "equipment photos farmer read active listings" on public.equipment_photos for select to authenticated using (
  exists(select 1 from public.equipment e where e.id=equipment_id and
    ((e.is_available and e.listing_status='active') or exists(select 1 from public.equipment_bookings b where b.equipment_id=e.id and b.status in ('confirmed','delivered'))))
  or owner_id=auth.uid()
);

-- COD rentals also wait for the owner to accept or reject the request.
create or replace function public.create_cod_equipment_rental_order(
  p_equipment_id uuid,p_booking_start timestamptz,p_booking_end timestamptz,p_rate_period text,
  p_delivery_requested boolean,p_delivery_address jsonb
) returns table(booking_id uuid,booking_reference text,total_amount numeric)
language plpgsql security definer set search_path=public,auth as $$
declare created record; payment_id uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Farmer') then raise exception 'Only farmers can create COD rentals.'; end if;
  select * into created from public.create_equipment_rental_order(p_equipment_id,p_booking_start,p_booking_end,p_rate_period,p_delivery_requested,p_delivery_address);
  update public.equipment_bookings set status='waiting_owner_approval',payment_method='cod',payment_status='pending' where id=created.booking_id;
  insert into public.equipment_booking_payments(booking_id,renter_id,method,amount,status)
    values(created.booking_id,auth.uid(),'cod',created.total_amount,'pending') returning id into payment_id;
  insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action,details)
    values(created.booking_id,payment_id,auth.uid(),'cod_booking_submitted',jsonb_build_object('amount',created.total_amount));
  insert into public.notifications(user_id,title,body) values
    ((select owner_id from public.equipment_bookings where id=created.booking_id),'New COD rental request',format('Review booking %s and accept or reject it.',created.booking_reference)),
    (auth.uid(),'COD request sent',format('Your COD rental request %s is waiting for the equipment owner.',created.booking_reference));
  return query select created.booking_id,created.booking_reference,created.total_amount;
end; $$;
revoke all on function public.create_cod_equipment_rental_order(uuid,timestamptz,timestamptz,text,boolean,jsonb) from public,anon;
grant execute on function public.create_cod_equipment_rental_order(uuid,timestamptz,timestamptz,text,boolean,jsonb) to authenticated;

create or replace function public.owner_decide_equipment_booking(p_booking_id uuid,p_accept boolean,p_reason text default null)
returns void language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype; payment public.equipment_booking_payments%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Equipment Owner') then raise exception 'Equipment owner access is required.'; end if;
  select * into booking from public.equipment_bookings where id=p_booking_id and owner_id=auth.uid() for update;
  if not found or booking.status<>'waiting_owner_approval' then raise exception 'This booking is no longer awaiting an owner decision.'; end if;
  select * into payment from public.equipment_booking_payments where booking_id=booking.id order by created_at desc limit 1 for update;
  if booking.payment_method<>'cod' and (booking.payment_status<>'admin_verified' or payment.status<>'admin_verified') then raise exception 'Only admin-verified bookings can be approved.'; end if;
  if p_accept then
    perform 1 from public.equipment e where e.id=booking.equipment_id and e.is_available=true for update;
    if not found then raise exception 'This equipment is already Out of Stock or unavailable.'; end if;
    update public.equipment_bookings set status='confirmed' where id=booking.id;
    if payment.id is not null and booking.payment_method<>'cod' then update public.equipment_booking_payments set payout_status='pending' where id=payment.id; end if;
    update public.equipment set is_available=false where id=booking.equipment_id;
    insert into public.notifications(user_id,title,body) values(booking.renter_id,'Rental booking confirmed',format('The owner accepted booking %s. Choose the agreed delivery or pickup details in your booking.',coalesce(booking.booking_reference,booking.id::text)));
    insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action) values(booking.id,payment.id,auth.uid(),'owner_accepted_equipment_booking');
  else
    if length(trim(coalesce(p_reason,'')))<4 then raise exception 'Provide a reason for rejecting this booking.'; end if;
    if booking.payment_method='cod' then
      update public.equipment_bookings set status='cancelled',payment_status='failed' where id=booking.id;
      if payment.id is not null then update public.equipment_booking_payments set status='failed',rejection_reason=trim(p_reason) where id=payment.id; end if;
    else
      update public.equipment_bookings set status='cancelled',payment_status='refund_pending',refund_status='pending' where id=booking.id;
      update public.equipment_booking_payments set status='refund_pending',refund_status='pending',rejection_reason=trim(p_reason) where id=payment.id;
    end if;
    insert into public.notifications(user_id,title,body) values(booking.renter_id,'Rental order cancelled',case when booking.payment_method='cod' then format('The owner rejected and cancelled booking %s: %s.',coalesce(booking.booking_reference,booking.id::text),trim(p_reason)) else format('The owner rejected and cancelled booking %s: %s. Your verified payment is pending refund.',coalesce(booking.booking_reference,booking.id::text),trim(p_reason)) end);
    update public.delivery_jobs set status='cancelled',updated_at=now() where rental_booking_id=booking.id and status in ('available','accepted');
    insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action,details) values(booking.id,payment.id,auth.uid(),'owner_rejected_equipment_booking',jsonb_build_object('reason',trim(p_reason)));
  end if;
end; $$;
revoke all on function public.owner_decide_equipment_booking(uuid,boolean,text) from public,anon;
grant execute on function public.owner_decide_equipment_booking(uuid,boolean,text) to authenticated;

create or replace function public.owner_set_rental_delivery_type(p_booking_id uuid,p_delivery_type text)
returns void language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype; listing public.equipment%rowtype; pickup text; dropoff text;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Equipment Owner') then raise exception 'Equipment Owner access is required.'; end if;
  if p_delivery_type not in ('partner_delivery','owner_delivery','farmer_pickup') then raise exception 'Choose a valid delivery or pickup type.'; end if;
  select * into booking from public.equipment_bookings where id=p_booking_id and owner_id=auth.uid() for update;
  if not found or booking.status not in ('confirmed','delivered') then raise exception 'Delivery options are available after the owner accepts the booking.'; end if;
  select * into listing from public.equipment where id=booking.equipment_id;
  if p_delivery_type in ('partner_delivery','owner_delivery') and not listing.delivery_available then raise exception 'Delivery is not available for this listing.'; end if;
  if p_delivery_type='farmer_pickup' and not listing.pickup_available then raise exception 'Farmer pickup is not available for this listing.'; end if;
  if booking.status='delivered' and booking.delivery_type is distinct from p_delivery_type then raise exception 'The handoff method cannot be changed after delivery.'; end if;
  update public.equipment_bookings set delivery_type=p_delivery_type where id=booking.id;
  if p_delivery_type='partner_delivery' then
    pickup:=coalesce(nullif(trim(listing.pickup_location),''),nullif(trim(listing.location),''),concat_ws(', ',listing.village,listing.district,listing.state));
    dropoff:=concat_ws(', ',nullif(booking.delivery_address->>'address',''),nullif(booking.delivery_address->>'village',''),nullif(booking.delivery_address->>'district',''),nullif(booking.delivery_address->>'state',''),nullif(booking.delivery_address->>'pin_code',''));
    if nullif(trim(coalesce(pickup,'')),'') is null or nullif(trim(coalesce(dropoff,'')),'') is null then raise exception 'Pickup and delivery addresses are required to publish a delivery partner job.'; end if;
    insert into public.delivery_jobs(customer_id,pickup_address,dropoff_address,status,rental_booking_id)
      values(booking.renter_id,pickup,dropoff,'available',booking.id)
      on conflict(rental_booking_id) where rental_booking_id is not null do update
        set pickup_address=excluded.pickup_address,dropoff_address=excluded.dropoff_address,status='available',partner_id=null
        where delivery_jobs.status='cancelled';
    insert into public.notifications(user_id,title,body)
      select p.id,'New equipment rental delivery job',format('A delivery partner is requested for rental %s.',coalesce(booking.booking_reference,booking.id::text))
      from public.profiles p where p.role='Delivery Partner';
  else
    update public.delivery_jobs set status='cancelled',updated_at=now() where rental_booking_id=booking.id and status in ('available','accepted');
  end if;
  insert into public.notifications(user_id,title,body) values(booking.renter_id,'Rental handoff details updated',format('The owner selected %s for booking %s.',replace(p_delivery_type,'_',' '),coalesce(booking.booking_reference,booking.id::text)));
end; $$;
revoke all on function public.owner_set_rental_delivery_type(uuid,text) from public,anon;
grant execute on function public.owner_set_rental_delivery_type(uuid,text) to authenticated;

create or replace function public.owner_set_rental_payment_status(p_booking_id uuid,p_payment_status text)
returns void language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype; payment public.equipment_booking_payments%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Equipment Owner') then raise exception 'Equipment Owner access is required.'; end if;
  if p_payment_status not in ('paid','not_paid') then raise exception 'Choose Paid or Not Paid.'; end if;
  select * into booking from public.equipment_bookings where id=p_booking_id and owner_id=auth.uid() for update;
  if not found or booking.status not in ('confirmed','delivered') then raise exception 'Payment status can only be changed during an active rental.'; end if;
  update public.equipment_bookings set owner_payment_status=p_payment_status where id=booking.id;
  if booking.payment_method='cod' then
    select * into payment from public.equipment_booking_payments where booking_id=booking.id and method='cod' order by created_at desc limit 1 for update;
    if found then
      update public.equipment_booking_payments set status=case when p_payment_status='paid' then 'paid' else 'pending' end,
        verified_by=case when p_payment_status='paid' then auth.uid() else null end,
        verified_at=case when p_payment_status='paid' then now() else null end where id=payment.id;
    end if;
  end if;
  insert into public.notifications(user_id,title,body) values(booking.renter_id,'Rental payment status updated',format('The owner marked booking %s as %s.',coalesce(booking.booking_reference,booking.id::text),replace(p_payment_status,'_',' ')));
  insert into public.rental_payment_audit_logs(booking_id,actor_id,action,details)
    values(booking.id,auth.uid(),'owner_rental_payment_status_updated',jsonb_build_object('status',p_payment_status));
end; $$;
revoke all on function public.owner_set_rental_payment_status(uuid,text) from public,anon;
grant execute on function public.owner_set_rental_payment_status(uuid,text) to authenticated;

create or replace function public.owner_mark_cod_rental_paid(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype; payment public.equipment_booking_payments%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Equipment Owner') then raise exception 'Equipment Owner access is required.'; end if;
  select * into booking from public.equipment_bookings where id=p_booking_id and owner_id=auth.uid() for update;
  if not found or booking.status not in ('confirmed','delivered') or booking.payment_method<>'cod' then raise exception 'Only active COD rentals can be marked paid.'; end if;
  select * into payment from public.equipment_booking_payments where booking_id=booking.id and method='cod' order by created_at desc limit 1 for update;
  if not found then raise exception 'COD payment record was not found.'; end if;
  update public.equipment_booking_payments set status='paid',verified_by=auth.uid(),verified_at=now() where id=payment.id;
  update public.equipment_bookings set payment_status='paid' where id=booking.id;
  insert into public.notifications(user_id,title,body) values(booking.renter_id,'COD payment received',format('The owner marked cash as collected for booking %s.',coalesce(booking.booking_reference,booking.id::text)));
  insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action) values(booking.id,payment.id,auth.uid(),'cod_cash_collected');
end; $$;
revoke all on function public.owner_mark_cod_rental_paid(uuid) from public,anon;
grant execute on function public.owner_mark_cod_rental_paid(uuid) to authenticated;

create or replace function public.owner_mark_cod_rental_unpaid(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype; payment public.equipment_booking_payments%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Equipment Owner') then raise exception 'Equipment Owner access is required.'; end if;
  select * into booking from public.equipment_bookings where id=p_booking_id and owner_id=auth.uid() for update;
  if not found or booking.status not in ('confirmed','delivered') or booking.payment_method<>'cod' or booking.payment_status<>'paid' then raise exception 'Only paid, active COD rentals can be returned to Not Paid.'; end if;
  select * into payment from public.equipment_booking_payments where booking_id=booking.id and method='cod' order by created_at desc limit 1 for update;
  if not found then raise exception 'COD payment record was not found.'; end if;
  update public.equipment_booking_payments set status='pending',verified_by=null,verified_at=null where id=payment.id;
  update public.equipment_bookings set payment_status='pending' where id=booking.id;
  insert into public.rental_payment_audit_logs(booking_id,payment_id,actor_id,action) values(booking.id,payment.id,auth.uid(),'cod_cash_collection_reversed');
end; $$;
revoke all on function public.owner_mark_cod_rental_unpaid(uuid) from public,anon;
grant execute on function public.owner_mark_cod_rental_unpaid(uuid) to authenticated;

create or replace function public.owner_mark_equipment_delivered(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Equipment Owner') then raise exception 'Equipment Owner access is required.'; end if;
  select * into booking from public.equipment_bookings where id=p_booking_id and owner_id=auth.uid() for update;
  if not found or booking.status<>'confirmed' then raise exception 'Only a confirmed rental can be marked as delivered.'; end if;
  if booking.delivery_type is null then raise exception 'Select the delivery or pickup type before confirming handoff.'; end if;
  update public.equipment_bookings set status='delivered' where id=booking.id;
  insert into public.notifications(user_id,title,body) values(booking.renter_id,'Equipment delivered',format('The owner confirmed delivery for booking %s. Your browser will ask permission to share your live location with the owner during this rental.',coalesce(booking.booking_reference,booking.id::text)));
  insert into public.rental_payment_audit_logs(booking_id,actor_id,action) values(booking.id,auth.uid(),'equipment_rental_delivered');
end; $$;
revoke all on function public.owner_mark_equipment_delivered(uuid) from public,anon;
grant execute on function public.owner_mark_equipment_delivered(uuid) to authenticated;

create or replace function public.owner_complete_equipment_rental(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Equipment Owner') then raise exception 'Equipment Owner access is required.'; end if;
  select * into booking from public.equipment_bookings where id=p_booking_id and owner_id=auth.uid() for update;
  if not found or booking.status<>'delivered' then raise exception 'Only a delivered rental can be completed.'; end if;
  update public.equipment_bookings set status='completed' where id=booking.id;
  update public.delivery_jobs set status='cancelled',updated_at=now() where rental_booking_id=booking.id and status in ('available','accepted','picked_up','in_transit');
  if not exists(select 1 from public.equipment_bookings b where b.equipment_id=booking.equipment_id and b.id<>booking.id and b.status in ('confirmed','delivered')) then
    update public.equipment set is_available=true where id=booking.equipment_id and listing_status='active';
  end if;
  insert into public.rental_trip_counters(user_id,completed_trip_count,updated_at) values(booking.renter_id,1,now())
    on conflict(user_id) do update set completed_trip_count=public.rental_trip_counters.completed_trip_count+1,updated_at=now();
  insert into public.notifications(user_id,title,body) values(booking.renter_id,'Rental order completed',format('The owner completed order %s. Equipment availability has been restored.',coalesce(booking.booking_reference,booking.id::text)));
  insert into public.rental_payment_audit_logs(booking_id,actor_id,action) values(booking.id,auth.uid(),'equipment_rental_completed');
end; $$;
revoke all on function public.owner_complete_equipment_rental(uuid) from public,anon;
grant execute on function public.owner_complete_equipment_rental(uuid) to authenticated;

create or replace function public.keep_active_rental_equipment_out_of_stock()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.is_available and exists(select 1 from public.equipment_bookings b where b.equipment_id=new.id and b.status in ('confirmed','delivered')) then
    new.is_available:=false;
  end if;
  return new;
end; $$;
drop trigger if exists equipment_active_rental_out_of_stock on public.equipment;
create trigger equipment_active_rental_out_of_stock before update of is_available on public.equipment
for each row execute function public.keep_active_rental_equipment_out_of_stock();

update public.equipment e set is_available=false
where e.is_available=true and exists(select 1 from public.equipment_bookings b where b.equipment_id=e.id and b.status in ('confirmed','delivered'));
