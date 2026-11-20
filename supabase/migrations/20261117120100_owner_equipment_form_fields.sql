alter table public.equipment
  add column if not exists equipment_capacity text,
  add column if not exists fuel_type text,
  add column if not exists equipment_condition text,
  add column if not exists security_deposit numeric not null default 0 check (security_deposit >= 0),
  add column if not exists additional_charges numeric not null default 0 check (additional_charges >= 0),
  add column if not exists operator_available boolean not null default false,
  add column if not exists terms_and_conditions text,
  add column if not exists listing_status text not null default 'active' check (listing_status in ('draft','active'));
