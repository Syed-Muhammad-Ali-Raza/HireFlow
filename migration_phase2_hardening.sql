-- =============================================================================
-- HireFlow — Phase 2 hardening
-- Run in Supabase SQL Editor AFTER migration_phase2_multiuser.sql
--
-- Prevents users from escalating themselves to admin or switching companies
-- via the browser client. Role / company_id changes must go through:
--   • /api/companies          (service role — first admin)
--   • /api/team/invites/accept (service role)
--   • /api/team/members/[id]   (service role — admin changes another member)
-- =============================================================================

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bypass when called as the Postgres role used by the service_role key
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  -- JWT role claim (PostgREST service_role)
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      raise exception 'Changing role is not allowed from the client. Use Team settings.';
    end if;
    if new.company_id is distinct from old.company_id then
      raise exception 'Changing company is not allowed from the client. Use an invite link.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_fields on public.profiles;

create trigger protect_profile_privileged_fields
  before update on public.profiles
  for each row
  execute procedure public.protect_profile_privileged_fields();
