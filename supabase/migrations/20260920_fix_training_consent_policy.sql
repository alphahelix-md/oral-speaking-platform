-- Repair for projects that already ran 20260920_training_audio_consent.sql.
-- JWT user metadata can be stale; use a current, owner-managed consent row.

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

insert into public.training_audio_consents (user_id, allowed, updated_at)
select
  id,
  coalesce(raw_user_meta_data ->> 'oral_training_consent' = 'training', false),
  now()
from auth.users
on conflict (user_id) do update
  set allowed = excluded.allowed,
      updated_at = excluded.updated_at;

drop policy if exists "owners insert training contributions" on public.training_audio_contributions;
create policy "owners insert training contributions"
  on public.training_audio_contributions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.training_audio_consents consent
      where consent.user_id = (select auth.uid()) and consent.allowed
    )
  );

drop policy if exists "owners upload training audio" on storage.objects;
create policy "owners upload training audio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'training-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.training_audio_consents consent
      where consent.user_id = (select auth.uid()) and consent.allowed
    )
  );
