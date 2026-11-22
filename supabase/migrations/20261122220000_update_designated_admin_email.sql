-- Keep the verified Admin identity in sync with the current account email.
-- The setting trigger revokes Admin roles from accounts outside this identity.
insert into public.admin_access_settings(id, admin_email, updated_at)
values (true, 'hruday.salapaka10@gmail.com', now())
on conflict (id) do update
set admin_email = excluded.admin_email,
    updated_at = excluded.updated_at;
