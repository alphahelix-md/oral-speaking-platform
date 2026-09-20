-- Future authenticated sync. MVP stores private history in browser; do not expose these tables through public policies.
create extension if not exists pgcrypto;
create table if not exists public.languages (id text primary key, name text not null);
insert into public.languages (id, name) values ('en','English'),('ja','Japanese') on conflict do nothing;
create table if not exists public.training_modes (id text primary key, name text not null);
insert into public.training_modes (id,name) values ('ielts','IELTS Speaking'),('daily','Daily Conversation'),('scenario','Scenario Practice'),('topic','Topic Practice'),('free-talk','Free Talk'),('toefl','TOEFL Speaking'),('interview','Interview Practice'),('weakness','Weakness Practice') on conflict do nothing;
create table if not exists public.users (id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
create table if not exists public.user_language_profiles (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade, language text not null references public.languages(id), level text, exam_goal text, level_reference text, unique(user_id,language));
create table if not exists public.practice_sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade, language text not null references public.languages(id), training_type text not null references public.training_modes(id), exam_type text, level text, topic text, status text not null default 'idle', created_at timestamptz not null default now(), ended_at timestamptz);
create table if not exists public.questions (id uuid primary key default gen_random_uuid(), session_id uuid not null references public.practice_sessions(id) on delete cascade, content text not null, position integer not null, created_at timestamptz not null default now());
create table if not exists public.answers (id uuid primary key default gen_random_uuid(), session_id uuid not null references public.practice_sessions(id) on delete cascade, question_id uuid references public.questions(id), attempt_number integer not null default 1, duration_seconds integer not null default 0, created_at timestamptz not null default now());
create table if not exists public.audio_records (id uuid primary key default gen_random_uuid(), answer_id uuid not null references public.answers(id) on delete cascade, storage_path text not null, mime_type text, duration_seconds numeric(8,2), speech_provider text, created_at timestamptz not null default now());
create table if not exists public.audio_metrics (id uuid primary key default gen_random_uuid(), audio_record_id uuid not null unique references public.audio_records(id) on delete cascade, duration_seconds numeric(8,2), speaking_duration_seconds numeric(8,2), silence_duration_seconds numeric(8,2), silence_ratio numeric(5,4), pause_count integer, long_pause_count integer, average_pause_duration_seconds numeric(8,2), audio_energy numeric(8,6), volume_variation numeric(8,6), analysis_available boolean not null default false, created_at timestamptz not null default now());
create table if not exists public.transcripts (id uuid primary key default gen_random_uuid(), answer_id uuid not null references public.answers(id) on delete cascade, language text not null references public.languages(id), content text not null, provider text, confidence numeric(5,4), segments jsonb, created_at timestamptz not null default now());
create table if not exists public.evaluations (id uuid primary key default gen_random_uuid(), session_id uuid not null references public.practice_sessions(id) on delete cascade, model text not null, text_provider text, speech_provider text, pronunciation_status text not null default 'not_available', summary text, created_at timestamptz not null default now());
create table if not exists public.scores (id uuid primary key default gen_random_uuid(), evaluation_id uuid not null references public.evaluations(id) on delete cascade, rubric_key text not null, value numeric(4,1) not null, note text);
create table if not exists public.feedback (id uuid primary key default gen_random_uuid(), evaluation_id uuid not null references public.evaluations(id) on delete cascade, kind text not null, content text not null);
create table if not exists public.attempts (id uuid primary key default gen_random_uuid(), answer_id uuid not null references public.answers(id) on delete cascade, prior_answer_id uuid references public.answers(id), comparison jsonb default '{}'::jsonb);
create table if not exists public.weaknesses (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade, language text not null references public.languages(id), category text not null, evidence text, observed_at timestamptz not null default now());
do $$ declare table_name text; begin foreach table_name in array array['users','user_language_profiles','practice_sessions','questions','answers','audio_records','audio_metrics','transcripts','evaluations','scores','feedback','attempts','weaknesses'] loop execute format('alter table public.%I enable row level security',table_name); end loop; end $$;
-- Add explicit owner policies only when authenticated sync endpoints are implemented.

-- Explicit opt-in training-audio contribution store. Run this section in the
-- Supabase SQL editor before enabling account-synced uploads in production.
create table if not exists public.training_audio_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allowed boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.training_audio_consents enable row level security;
drop policy if exists "owners manage training consent" on public.training_audio_consents;
create policy "owners manage training consent" on public.training_audio_consents
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.current_user_has_training_audio_consent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.training_audio_consents
    where user_id = (select auth.uid()) and allowed
  );
$$;
revoke all on function public.current_user_has_training_audio_consent() from public;
grant execute on function public.current_user_has_training_audio_consent() to authenticated;

create table if not exists public.training_audio_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_audio_id text not null,
  object_path text not null unique,
  mime_type text,
  language text not null check (language in ('en', 'ja')),
  training_mode text not null,
  question text,
  transcript text,
  duration_seconds numeric(8,2),
  consent_version text not null,
  created_at timestamptz not null default now(),
  unique(user_id, local_audio_id)
);
create index if not exists training_audio_contributions_user_created_idx
  on public.training_audio_contributions(user_id, created_at desc);
alter table public.training_audio_contributions enable row level security;
drop policy if exists "owners insert training contributions" on public.training_audio_contributions;
create policy "owners insert training contributions" on public.training_audio_contributions for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.current_user_has_training_audio_consent()
  );
drop policy if exists "owners read training contributions" on public.training_audio_contributions;
create policy "owners read training contributions" on public.training_audio_contributions for select to authenticated using (auth.uid() = user_id);
drop policy if exists "owners delete training contributions" on public.training_audio_contributions;
create policy "owners delete training contributions" on public.training_audio_contributions for delete to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('training-audio', 'training-audio', false, 20000000, array['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/x-m4a'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owners upload training audio" on storage.objects;
create policy "owners upload training audio" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'training-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_has_training_audio_consent()
  );
drop policy if exists "owners read training audio" on storage.objects;
create policy "owners read training audio" on storage.objects for select to authenticated using (bucket_id = 'training-audio' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "owners delete training audio" on storage.objects;
create policy "owners delete training audio" on storage.objects for delete to authenticated using (bucket_id = 'training-audio' and (storage.foldername(name))[1] = auth.uid()::text);
