-- Private, explicit-opt-in training audio storage.
-- Run once in the Supabase SQL editor before testing consented uploads.

create table if not exists public.training_audio_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allowed boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.training_audio_consents enable row level security;

drop policy if exists "owners manage training consent" on public.training_audio_consents;
create policy "owners manage training consent"
  on public.training_audio_consents for all to authenticated
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
create policy "owners insert training contributions"
  on public.training_audio_contributions for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.current_user_has_training_audio_consent()
  );

drop policy if exists "owners read training contributions" on public.training_audio_contributions;
create policy "owners read training contributions"
  on public.training_audio_contributions for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "owners delete training contributions" on public.training_audio_contributions;
create policy "owners delete training contributions"
  on public.training_audio_contributions for delete to authenticated
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'training-audio',
  'training-audio',
  false,
  20000000,
  array['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/x-m4a']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owners upload training audio" on storage.objects;
create policy "owners upload training audio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'training-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_has_training_audio_consent()
  );

drop policy if exists "owners read training audio" on storage.objects;
create policy "owners read training audio"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'training-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "owners delete training audio" on storage.objects;
create policy "owners delete training audio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'training-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
