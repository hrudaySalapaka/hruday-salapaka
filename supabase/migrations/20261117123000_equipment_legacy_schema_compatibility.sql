-- Add the app's equipment fields to projects that started with the legacy
-- category/rate_paise/city/status equipment table.
alter table public.equipment
  add column if not exists equipment_type text,
  add column if not exists pricing_model text,
  add column if not exists price_per_unit numeric,
  add column if not exists location text,
  add column if not exists image_url text,
  add column if not exists is_available boolean,
  add column if not exists is_used boolean;

update public.equipment e
set equipment_type = coalesce(e.equipment_type, to_jsonb(e)->>'category', 'Other'),
    pricing_model = coalesce(e.pricing_model, to_jsonb(e)->>'rate_unit', 'day'),
    price_per_unit = coalesce(e.price_per_unit, nullif(to_jsonb(e)->>'rate_paise', '')::numeric / 100, 0),
    location = coalesce(e.location, to_jsonb(e)->>'city'),
    is_available = coalesce(e.is_available, lower(coalesce(to_jsonb(e)->>'status', 'available')) not in ('unavailable', 'inactive', 'rejected', 'deleted')),
    is_used = coalesce(e.is_used, false);

alter table public.equipment
  alter column equipment_type set not null,
  alter column price_per_unit set default 0,
  alter column price_per_unit set not null,
  alter column is_available set default true,
  alter column is_available set not null,
  alter column is_used set default false,
  alter column is_used set not null;
