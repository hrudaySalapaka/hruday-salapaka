-- Fields used by the Farmer My Farm cards and edit form.
alter table public.farms
  add column if not exists crop_details text,
  add column if not exists image_url text;

-- Keep the farmer's decision distinct from the order's delivery lifecycle.
alter table public.orders
  add column if not exists farmer_decision text not null default 'pending';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_farmer_decision_check'
  ) then
    alter table public.orders add constraint orders_farmer_decision_check
      check (farmer_decision in ('pending','accepted','rejected'));
  end if;
end;
$$;

create or replace function public.notify_farmer_of_new_product_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.farmer_id is not null then
    insert into public.notifications(user_id,title,body)
    values (new.farmer_id,'New customer order',format('Order %s is waiting for your review.',new.order_number));
  end if;
  return new;
end;
$$;
drop trigger if exists orders_notify_farmer_new_product_order on public.orders;
create trigger orders_notify_farmer_new_product_order
  after insert on public.orders
  for each row when (new.farmer_id is not null)
  execute function public.notify_farmer_of_new_product_order();

create or replace function public.notify_on_farmer_order_decision()
returns trigger language plpgsql security definer set search_path = public as $$
declare delivery record;
begin
  if new.farmer_decision is distinct from old.farmer_decision
     and new.farmer_decision in ('accepted','rejected') then
    insert into public.notifications(user_id,title,body)
    values (new.customer_id,
      case when new.farmer_decision = 'accepted' then 'Order accepted' else 'Order request declined' end,
      format('Farmer %s the request for order %s.',new.farmer_decision,new.order_number));

    if new.farmer_decision = 'accepted' then
      for delivery in
        select id,partner_id,status from public.delivery_jobs where order_id = new.id
      loop
        if delivery.partner_id is not null then
          insert into public.notifications(user_id,title,body)
          values (delivery.partner_id,'Farm order ready for delivery',format('Order %s was accepted by the farmer.',new.order_number));
        elsif delivery.status = 'available' then
          insert into public.notifications(user_id,title,body)
          select p.id,'Farm order ready for delivery',format('Order %s is ready for delivery assignment.',new.order_number)
          from public.profiles p where p.role = 'Delivery Partner';
        end if;
      end loop;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists orders_notify_on_farmer_decision on public.orders;
create trigger orders_notify_on_farmer_decision
  after update of farmer_decision on public.orders
  for each row
  execute function public.notify_on_farmer_order_decision();
