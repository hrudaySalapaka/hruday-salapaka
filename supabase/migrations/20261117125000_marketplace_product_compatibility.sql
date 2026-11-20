-- Provide the marketplace fields on projects that started with the legacy
-- price_paise/quantity product schema.
alter table public.products
  add column if not exists price numeric,
  add column if not exists currency text,
  add column if not exists stock numeric,
  add column if not exists image_url text;

update public.products p
set price = coalesce(p.price, nullif(to_jsonb(p)->>'price_paise', '')::numeric / 100, 0),
    currency = coalesce(p.currency, 'INR'),
    stock = coalesce(p.stock, nullif(to_jsonb(p)->>'quantity', '')::numeric, 0);

alter table public.products
  alter column price set default 0,
  alter column price set not null,
  alter column currency set default 'INR',
  alter column currency set not null,
  alter column stock set default 0,
  alter column stock set not null;
