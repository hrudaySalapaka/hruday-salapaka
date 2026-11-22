-- Set the single verified Admin identity to the current account email.
-- The setting trigger revokes Admin access from other accounts.
insert into public.admin_access_settings(id, admin_email, updated_at)
values (true, 'hruday.salapaka10@gmail.com', now())
on conflict (id) do update
set admin_email = excluded.admin_email,
    updated_at = excluded.updated_at;
