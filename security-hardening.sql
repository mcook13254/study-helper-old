-- StudyHelper security hardening migration.
-- Non-destructive: does not drop/recreate existing StudyHelper data.

-- Ensure shared-set pairs are unique so duplicate grants cannot be created.
create unique index if not exists study_set_shares_set_recipient_uidx
  on public.study_set_shares(set_id, recipient_id);

-- Re-assert private textbook storage policies.
drop policy if exists "textbooks storage read own" on storage.objects;
create policy "textbooks storage read own" on storage.objects
for select to authenticated
using (bucket_id = 'textbooks' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "textbooks storage insert own" on storage.objects;
create policy "textbooks storage insert own" on storage.objects
for insert to authenticated
with check (bucket_id = 'textbooks' and (storage.foldername(name))[1] = (select auth.uid()::text) and storage.extension(name) = 'pdf');

drop policy if exists "textbooks storage delete own" on storage.objects;
create policy "textbooks storage delete own" on storage.objects
for delete to authenticated
using (bucket_id = 'textbooks' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- Keep shared-set rows private; the server-side sharing endpoint performs privileged reads/writes
-- only after authenticating the caller and checking ownership.
alter table public.study_set_shares enable row level security;
