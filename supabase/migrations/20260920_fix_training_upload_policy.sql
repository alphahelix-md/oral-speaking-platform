-- Repair consented uploads while preserving database-enforced opt-in.
-- The function has no user argument and can only inspect the caller's consent.

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.training_audio_consents to authenticated;
grant select, insert, delete on table public.training_audio_contributions to authenticated;

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

drop policy if exists "owners insert training contributions" on public.training_audio_contributions;
create policy "owners insert training contributions"
  on public.training_audio_contributions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.current_user_has_training_audio_consent()
  );

drop policy if exists "owners upload training audio" on storage.objects;
create policy "owners upload training audio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'training-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.current_user_has_training_audio_consent()
  );
