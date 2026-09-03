-- StudyHelper v0.6/v0.7 account workflow
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Student',
  email text not null default '',
  role text not null default 'student' check (role in ('student','admin')),
  status text not null default 'active' check (status in ('active','disabled')),
  major text not null default '',
  school text not null default '',
  bio text not null default '',
  avatar text not null default 'S',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  major text not null default '',
  message text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  approved_user_id uuid references auth.users(id) on delete set null
);

create unique index if not exists access_requests_pending_email_idx
  on public.access_requests (lower(email)) where status = 'pending';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, avatar)
  values (new.id, coalesce(new.raw_user_meta_data->>'name','Student'), coalesce(new.email,''), upper(left(coalesce(new.raw_user_meta_data->>'name','S'), 1)))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active');
$$;

alter table public.profiles enable row level security;
alter table public.access_requests enable row level security;

-- Client-side users may edit profile details, but never role/status. Those fields
-- are writable only through the protected administrator/server path.
revoke update on public.profiles from anon, authenticated;
grant update (name, major, school, bio, avatar, updated_at) on public.profiles to authenticated;
grant insert on public.access_requests to anon;

drop policy if exists "profiles own select" on public.profiles;
create policy "profiles own select" on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
drop policy if exists "profiles admin insert" on public.profiles;
create policy "profiles admin insert" on public.profiles for insert with check (public.is_admin());
drop policy if exists "profiles admin delete" on public.profiles;
create policy "profiles admin delete" on public.profiles for delete using (public.is_admin());

-- Anonymous visitors may submit an access request, but may not read or change requests.
drop policy if exists "access request public insert" on public.access_requests;
create policy "access request public insert" on public.access_requests for insert to anon with check (status = 'pending');
drop policy if exists "access request admin read" on public.access_requests;
create policy "access request admin read" on public.access_requests for select using (public.is_admin());
drop policy if exists "access request admin update" on public.access_requests;
create policy "access request admin update" on public.access_requests for update using (public.is_admin()) with check (public.is_admin());

-- First-admin bootstrap: create one account through an external/controlled method,
-- then run: update public.profiles set role='admin' where email='you@example.com';

-- v0.8 hardening: authenticated users may update only profile fields they own.
revoke update (role, status) on public.profiles from authenticated;
