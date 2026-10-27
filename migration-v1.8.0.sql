
-- v1.8.0: additive only; old progress and concept values remain untouched.
alter table public.progress add column if not exists adaptive jsonb not null default '{"version":1,"questions":{},"concepts":{}}'::jsonb;
