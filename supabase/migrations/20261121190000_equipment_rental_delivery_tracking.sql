alter table public.equipment_bookings drop constraint if exists equipment_bookings_status_check;
alter table public.equipment_bookings add constraint equipment_bookings_status_check check (status in (
  'pending','accepted','rejected','cancelled','completed','payment_verification_pending',
  'waiting_owner_approval','confirmed','delivered','refund_pending','refunded'
));

create or replace function public.guard_equipment_rental_overlap()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('pending','accepted','payment_verification_pending','waiting_owner_approval','confirmed','delivered') then
    perform 1 from public.equipment where id=new.equipment_id for update;
    if exists(select 1 from public.equipment_bookings b where b.equipment_id=new.equipment_id and b.id<>new.id
      and b.status in ('pending','accepted','payment_verification_pending','waiting_owner_approval','confirmed','delivered')
      and b.booking_start<new.booking_end and b.booking_end>new.booking_start) then
      raise exception 'These rental dates overlap another active booking.';
    end if;
  end if;
  return new;
end; $$;

create or replace function public.owner_mark_equipment_delivered(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Equipment Owner') then
    raise exception 'Equipment Owner access is required.';
  end if;
  select * into booking from public.equipment_bookings where id=p_booking_id and owner_id=auth.uid() for update;
  if not found or booking.status<>'confirmed' then
    raise exception 'Only a confirmed rental can be marked as delivered.';
  end if;
  update public.equipment_bookings set status='delivered' where id=booking.id;
  insert into public.notifications(user_id,title,body)
    values(booking.renter_id,'Equipment delivered',format('The owner confirmed delivery for booking %s. Your location can now be shared with the owner while the rental is active.',coalesce(booking.booking_reference,booking.id::text)));
  insert into public.rental_payment_audit_logs(booking_id,actor_id,action)
    values(booking.id,auth.uid(),'equipment_rental_delivered');
end; $$;
revoke all on function public.owner_mark_equipment_delivered(uuid) from public,anon;
grant execute on function public.owner_mark_equipment_delivered(uuid) to authenticated;

create or replace function public.record_rental_tracking_point(p_booking_id uuid,p_latitude numeric,p_longitude numeric)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype; actor_role text; point_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  select * into booking from public.equipment_bookings where id=p_booking_id for update;
  if not found or booking.status not in ('confirmed','accepted','delivered') then raise exception 'Tracking is available only during an active rental.'; end if;
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

create or replace function public.rental_tracking_is_active(p_booking_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.equipment_bookings b where b.id=p_booking_id and b.status in ('confirmed','accepted','delivered'));
$$;
revoke all on function public.rental_tracking_is_active(uuid) from public,anon;
grant execute on function public.rental_tracking_is_active(uuid) to authenticated;

create or replace function public.owner_complete_equipment_rental(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
declare booking public.equipment_bookings%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Equipment Owner') then raise exception 'Equipment Owner access is required.'; end if;
  select * into booking from public.equipment_bookings where id=p_booking_id and owner_id=auth.uid() for update;
  if not found or booking.status not in ('confirmed','delivered') then raise exception 'Only an active rental can be completed.'; end if;
  if booking.payment_status<>'paid' then raise exception 'Confirm payment collection before completing this rental.'; end if;
  update public.equipment_bookings set status='completed' where id=booking.id;
  insert into public.rental_trip_counters(user_id,completed_trip_count,updated_at) values(booking.renter_id,1,now())
    on conflict(user_id) do update set completed_trip_count=public.rental_trip_counters.completed_trip_count+1,updated_at=now();
  insert into public.notifications(user_id,title,body) values(booking.renter_id,'Rental completed',format('Booking %s is complete. GPS sharing has ended and trip progress was saved.',coalesce(booking.booking_reference,booking.id::text)));
  insert into public.rental_payment_audit_logs(booking_id,actor_id,action) values(booking.id,auth.uid(),'equipment_rental_completed');
end; $$;
revoke all on function public.owner_complete_equipment_rental(uuid) from public,anon;
grant execute on function public.owner_complete_equipment_rental(uuid) to authenticated;
