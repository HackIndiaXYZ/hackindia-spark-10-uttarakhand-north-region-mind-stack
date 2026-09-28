-- Run this in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  mobile text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  url_hash text not null,
  title text,
  duration_seconds integer,
  status text not null default 'queued' check (status in ('queued','processing','ready','error')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_study_sources_user on public.study_sources(user_id, created_at desc);
create index if not exists idx_study_sources_hash on public.study_sources(user_id, url_hash);

create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.study_sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  video_id text,
  channel text,
  duration_seconds integer,
  detected_language text,
  raw_text text not null,
  cleaned_text text not null,
  segments jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_transcripts_source on public.transcripts(source_id, user_id);

create table if not exists public.generated_content (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.study_sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text,
  content_text text,
  content_json jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_generated_content on public.generated_content(source_id, user_id, type, created_at desc);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.study_sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  questions jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  source_id uuid not null references public.study_sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null,
  total integer not null,
  percentage integer not null,
  answers jsonb not null,
  created_at timestamptz not null default now()
);

-- RLS: the backend uses the service role after verifying the user's bearer token.
alter table public.profiles enable row level security;
alter table public.study_sources enable row level security;
alter table public.transcripts enable row level security;
alter table public.generated_content enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_attempts enable row level security;

-- Optional direct-client policies. They let authenticated users read only their own rows.
do $$ begin
  create policy "profiles self read" on public.profiles for select to authenticated using (auth.uid() = id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "sources self read" on public.study_sources for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "transcripts self read" on public.transcripts for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "generated self read" on public.generated_content for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
drop policy if exists "quizzes self read" on public.quizzes;
revoke all on public.quizzes from anon, authenticated;
grant all on public.quizzes to service_role;
do $$ begin
  create policy "attempts self read" on public.quiz_attempts for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- Explicit backend privileges; authorization still occurs in API handlers.
grant usage on schema public to service_role;
grant all on public.profiles, public.study_sources, public.transcripts, public.generated_content, public.quizzes, public.quiz_attempts to service_role;
