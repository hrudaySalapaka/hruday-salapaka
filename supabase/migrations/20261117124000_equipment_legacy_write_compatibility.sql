-- Keep the original equipment columns available for older app builds while
-- making them compatible with the owner listing's canonical fields.
alter table public.equipment
  add column if not exists category text not null default 'Other',
  add column if not exists rate_paise integer not null default 0 check (rate_paise >= 0),
  add column if not exists rate_unit text not null default 'day' check (rate_unit in ('hour', 'day'));

alter table public.equipment
  alter column category set default 'Other',
  alter column rate_paise set default 0,
  alter column rate_unit set default 'day';

update public.equipment
set category = coalesce(nullif(category, ''), equipment_type, 'Other'),
    rate_paise = round(coalesce(price_per_unit, 0) * 100)::integer,
    rate_unit = case when pricing_model = 'hour' then 'hour' else 'day' end;
