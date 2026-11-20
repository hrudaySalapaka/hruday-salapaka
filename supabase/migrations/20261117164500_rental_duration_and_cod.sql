-- Extend the existing rental booking/payment records without introducing tables.
alter table public.equipment_bookings
  add column if not exists rental_period text not null default 'day',
  add column if not exists rental_duration numeric not null default 1;

alter table public.equipment_bookings drop constraint if exists equipment_bookings_rental_period_check;
alter table public.equipment_bookings add constraint equipment_bookings_rental_period_check
  check (rental_period in ('hour','day','month','year'));
alter table public.equipment_bookings drop constraint if exists equipment_bookings_rental_duration_check;
alter table public.equipment_bookings add constraint equipment_bookings_rental_duration_check
  check (rental_duration > 0);

alter table public.equipment_booking_payments drop constraint if exists equipment_booking_payments_method_check;
alter table public.equipment_booking_payments add constraint equipment_booking_payments_method_check
  check (method in ('upi','credit_card','debit_card','net_banking','cod'));

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
  period_seconds numeric;
  original_total numeric;
  discounted_total numeric;
  discount_total numeric;
  delivery_total numeric;
  deposit_total numeric;
  reference text;
  created_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Farmer') then
    raise exception 'Only signed-in farmers can place an equipment rental order.';
  end if;
  if p_booking_start <= now() or p_booking_end <= p_booking_start then
    raise exception 'Choose a future rental start and an end time after it.';
  end if;
  if p_rate_period not in ('hour','day','month','year') then raise exception 'Choose a supported rental period.'; end if;

  select e.* into listing from public.equipment e
  where e.id = p_equipment_id and e.is_available = true and e.listing_status = 'active'
  for update;
  if not found then raise exception 'This equipment listing is no longer available.'; end if;
  if listing.available_from is not null and p_booking_start::date < listing.available_from then raise exception 'The rental starts before the owner availability window.'; end if;
  if listing.available_until is not null and p_booking_end::date > listing.available_until then raise exception 'The rental ends after the owner availability window.'; end if;
  if p_delivery_requested and not listing.delivery_available then raise exception 'Delivery is not available for this equipment.'; end if;
  if exists (
    select 1 from public.equipment_bookings b where b.equipment_id = p_equipment_id
      and b.status in ('pending','accepted') and b.booking_start < p_booking_end and b.booking_end > p_booking_start
  ) then raise exception 'Those rental dates overlap another booking.'; end if;

  base_rate := case p_rate_period
    when 'hour' then coalesce(listing.price_per_hour, case when listing.pricing_model ilike '%hour%' then listing.price_per_unit end, 0)
    when 'day' then coalesce(listing.price_per_day, case when listing.pricing_model ilike '%day%' then listing.price_per_unit end, 0)
    when 'month' then 30 * coalesce(listing.price_per_day, case when listing.pricing_model ilike '%day%' then listing.price_per_unit end, 0)
    when 'year' then 365 * coalesce(listing.price_per_day, case when listing.pricing_model ilike '%day%' then listing.price_per_unit end, 0)
  end;
  if base_rate <= 0 then raise exception 'This listing does not have a rate for that rental period.'; end if;
  period_seconds := case p_rate_period when 'hour' then 3600 when 'day' then 86400 when 'month' then 2592000 else 31536000 end;
  units := greatest(1, ceil(extract(epoch from (p_booking_end - p_booking_start)) / period_seconds));
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
    security_deposit, delivery_address, status, payment_status, rental_period, rental_duration
  ) values (
    listing.id, auth.uid(), listing.owner_id, p_booking_start, p_booking_end,
    discounted_total + delivery_total + deposit_total,
    reference, original_total, discount_total, delivery_total, 0,
    deposit_total, p_delivery_address, 'pending', 'pending', p_rate_period, units
  ) returning id into created_id;

  return query select created_id, reference, discounted_total + delivery_total + deposit_total;
end;
$$;
revoke all on function public.create_equipment_rental_order(uuid,timestamptz,timestamptz,text,boolean,jsonb) from public;
grant execute on function public.create_equipment_rental_order(uuid,timestamptz,timestamptz,text,boolean,jsonb) to authenticated;
