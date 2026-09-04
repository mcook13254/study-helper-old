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


-- StudyHelper cloud data (v0.9 cloud persistence)
create table if not exists public.courses (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  code text not null default '',
  mastery numeric not null default 0,
  items integer not null default 0,
  weak text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_sets (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  set_id text not null references public.study_sets(id) on delete cascade,
  question text not null,
  answers jsonb not null default '[]'::jsonb,
  correct jsonb not null default '0'::jsonb,
  type text not null default 'single' check (type in ('single','multiple')),
  explanation text not null default '',
  concept text not null default '',
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  streak integer not null default 0,
  xp integer not null default 0,
  mastery numeric not null default 0,
  questions_answered integer not null default 0,
  best_streak integer not null default 0,
  concepts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.courses enable row level security;
alter table public.study_sets enable row level security;
alter table public.questions enable row level security;
alter table public.progress enable row level security;

drop policy if exists "courses own select" on public.courses;
create policy "courses own select" on public.courses for select using (owner_id = auth.uid());
drop policy if exists "study sets own select" on public.study_sets;
create policy "study sets own select" on public.study_sets for select using (owner_id = auth.uid());
drop policy if exists "questions own select" on public.questions;
create policy "questions own select" on public.questions for select using (owner_id = auth.uid());
drop policy if exists "progress own select" on public.progress;
create policy "progress own select" on public.progress for select using (user_id = auth.uid());

-- Writes/deletes for these tables are performed by the protected /api/data-sync endpoint.
revoke insert, update, delete on public.courses from anon, authenticated;
revoke insert, update, delete on public.study_sets from anon, authenticated;
revoke insert, update, delete on public.questions from anon, authenticated;
revoke insert, update, delete on public.progress from anon, authenticated;


-- StudyHelper v1.4 private cloud textbook storage.
create table if not exists public.textbooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  size_bytes bigint not null default 0,
  mime_type text not null default 'application/pdf',
  course_id text,
  created_at timestamptz not null default now()
);

alter table public.textbooks enable row level security;
revoke all on public.textbooks from anon;
grant select, insert, delete on public.textbooks to authenticated;

drop policy if exists "textbooks own select" on public.textbooks;
create policy "textbooks own select" on public.textbooks for select using (owner_id = auth.uid());
drop policy if exists "textbooks own insert" on public.textbooks;
create policy "textbooks own insert" on public.textbooks for insert with check (owner_id = auth.uid());
drop policy if exists "textbooks own delete" on public.textbooks;
create policy "textbooks own delete" on public.textbooks for delete using (owner_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('textbooks', 'textbooks', false, 104857600, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 104857600, allowed_mime_types = array['application/pdf'];

drop policy if exists "textbooks storage read own" on storage.objects;
create policy "textbooks storage read own" on storage.objects for select to authenticated
using (bucket_id = 'textbooks' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "textbooks storage insert own" on storage.objects;
create policy "textbooks storage insert own" on storage.objects for insert to authenticated
with check (bucket_id = 'textbooks' and (storage.foldername(name))[1] = (select auth.uid()::text) and storage.extension(name) = 'pdf');

drop policy if exists "textbooks storage delete own" on storage.objects;
create policy "textbooks storage delete own" on storage.objects for delete to authenticated
using (bucket_id = 'textbooks' and (storage.foldername(name))[1] = (select auth.uid()::text));
