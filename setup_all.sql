-- =========================================================================
-- HIREFLOW UNIFIED DATABASE SETUP SCRIPT
-- =========================================================================
-- Run this entire script in the Supabase SQL Editor (Dashboard -> SQL Editor)
-- to set up all tables, indexes, triggers, RLS policies, and storage bucket.
--
-- Step-by-step human guide: docs/SUPABASE_SETUP.md

-- =========================================================================
-- PHASE 1: CORE SCHEMA (schema.sql)
-- =========================================================================

-- 1. Enable UUID generation extension
create extension if not exists "uuid-ossp";

-- 2. Create Companies Table
create table if not exists public.companies (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    created_at timestamp with time zone default now() not null
);

-- 3. Create Profiles Table (extends Auth Users)
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    company_id uuid references public.companies(id) on delete set null,
    name text,
    email text not null,
    role text default 'recruiter' check (role in ('recruiter', 'interviewer', 'admin')),
    created_at timestamp with time zone default now() not null
);

-- 4. Create Job Postings Table
create table if not exists public.job_postings (
    id uuid primary key default uuid_generate_v4(),
    company_id uuid references public.companies(id) on delete cascade not null,
    title text not null,
    description text not null,
    required_skills text[] default '{}'::text[] not null,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamp with time zone default now() not null
);

-- 5. Create Candidates Table
create table if not exists public.candidates (
    id uuid primary key default uuid_generate_v4(),
    job_id uuid references public.job_postings(id) on delete cascade not null,
    name text not null,
    email text,
    resume_file_url text,
    resume_text text,
    match_score numeric check (match_score >= 0 and match_score <= 100),
    match_reasoning text,
    matched_skills text[] default '{}'::text[] not null,
    missing_skills text[] default '{}'::text[] not null,
    status text default 'new' check (status in ('new', 'shortlisted', 'interview_scheduled', 'rejected')),
    created_at timestamp with time zone default now() not null
);

-- 6. Create Indexes for Performance
create index if not exists idx_profiles_company_id on public.profiles(company_id);
create index if not exists idx_job_postings_company_id on public.job_postings(company_id);
create index if not exists idx_candidates_job_id on public.candidates(job_id);
create index if not exists idx_candidates_status on public.candidates(status);

-- 7. Configure Row Level Security (RLS)
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.job_postings enable row level security;
alter table public.candidates enable row level security;

-- 8. RLS Policies

-- Companies Policies
create policy "Allow company view for member profiles"
    on public.companies for select
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.company_id = companies.id
        )
    );

create policy "Allow company creation during setup"
    on public.companies for insert
    with check (true);

-- Profiles Policies
create policy "Allow profile view for company members"
    on public.profiles for select
    using (
        id = auth.uid() or 
        company_id = (select company_id from public.profiles where id = auth.uid())
    );

create policy "Allow profile updates for own profile"
    on public.profiles for update
    using (id = auth.uid())
    with check (id = auth.uid());

-- Job Postings Policies
create policy "Allow job postings view for company members"
    on public.job_postings for select
    using (
        company_id = (select company_id from public.profiles where id = auth.uid())
    );

create policy "Allow job postings creation for company members"
    on public.job_postings for insert
    with check (
        company_id = (select company_id from public.profiles where id = auth.uid())
    );

create policy "Allow job postings updates for company members"
    on public.job_postings for update
    using (
        company_id = (select company_id from public.profiles where id = auth.uid())
    );

create policy "Allow job postings deletion for company members"
    on public.job_postings for delete
    using (
        company_id = (select company_id from public.profiles where id = auth.uid())
    );

-- Candidates Policies
create policy "Allow candidates view for company members"
    on public.candidates for select
    using (
        exists (
            select 1 from public.job_postings
            join public.profiles on profiles.company_id = job_postings.company_id
            where job_postings.id = candidates.job_id and profiles.id = auth.uid()
        )
    );

create policy "Allow candidates insertion for company members"
    on public.candidates for insert
    with check (
        exists (
            select 1 from public.job_postings
            join public.profiles on profiles.company_id = job_postings.company_id
            where job_postings.id = candidates.job_id and profiles.id = auth.uid()
        )
    );

create policy "Allow candidates updates for company members"
    on public.candidates for update
    using (
        exists (
            select 1 from public.job_postings
            join public.profiles on profiles.company_id = job_postings.company_id
            where job_postings.id = candidates.job_id and profiles.id = auth.uid()
        )
    );

create policy "Allow candidates deletion for company members"
    on public.candidates for delete
    using (
        exists (
            select 1 from public.job_postings
            join public.profiles on profiles.company_id = job_postings.company_id
            where job_postings.id = candidates.job_id and profiles.id = auth.uid()
        )
    );

-- 9. Automatic Profile Creation Trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, email, name, role)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        'recruiter'
    );
    return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();


-- =========================================================================
-- PHASE 2: CALENDAR & INTERVIEWS (migration_phase2.sql)
-- =========================================================================

-- 1. Add Calendar Columns to Profiles table
alter table public.profiles 
add column if not exists calendar_connected boolean default false not null,
add column if not exists calendar_provider text check (calendar_provider in ('google', 'outlook', null)),
add column if not exists calendar_refresh_token text;

-- 2. Create Interviews Table
create table if not exists public.interviews (
    id uuid primary key default uuid_generate_v4(),
    candidate_id uuid references public.candidates(id) on delete cascade not null,
    scheduled_time timestamp with time zone not null,
    interviewer_ids uuid[] not null, -- Array of interviewer profile IDs
    calendar_event_id text,
    status text default 'pending' check (status in ('pending', 'confirmed', 'cancelled')) not null,
    meeting_link text,
    created_at timestamp with time zone default now() not null
);

-- 3. Create Indexes for Performance
create index if not exists idx_interviews_candidate_id on public.interviews(candidate_id);
create index if not exists idx_interviews_scheduled_time on public.interviews(scheduled_time);

-- 4. Enable Row Level Security (RLS)
alter table public.interviews enable row level security;

-- 5. RLS Policies for Interviews Table
create policy "Allow interviews view for company members"
    on public.interviews for select
    using (
        exists (
            select 1 from public.candidates
            join public.job_postings on job_postings.id = candidates.job_id
            join public.profiles on profiles.company_id = job_postings.company_id
            where candidates.id = interviews.candidate_id and profiles.id = auth.uid()
        )
    );

create policy "Allow interviews insertion for company members"
    on public.interviews for insert
    with check (
        exists (
            select 1 from public.candidates
            join public.job_postings on job_postings.id = candidates.job_id
            join public.profiles on profiles.company_id = job_postings.company_id
            where candidates.id = interviews.candidate_id and profiles.id = auth.uid()
        )
    );

create policy "Allow interviews updates for company members"
    on public.interviews for update
    using (
        exists (
            select 1 from public.candidates
            join public.job_postings on job_postings.id = candidates.job_id
            join public.profiles on profiles.company_id = job_postings.company_id
            where candidates.id = interviews.candidate_id and profiles.id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from public.candidates
            join public.job_postings on job_postings.id = candidates.job_id
            join public.profiles on profiles.company_id = job_postings.company_id
            where candidates.id = interviews.candidate_id and profiles.id = auth.uid()
        )
    );

create policy "Allow interviews deletion for company members"
    on public.interviews for delete
    using (
        exists (
            select 1 from public.candidates
            join public.job_postings on job_postings.id = candidates.job_id
            join public.profiles on profiles.company_id = job_postings.company_id
            where candidates.id = interviews.candidate_id and profiles.id = auth.uid()
        )
    );


-- =========================================================================
-- PHASE 2 MULTIUSER: INVITES, ROLES & AUDITS (migration_phase2_multiuser.sql)
-- =========================================================================

-- 1. Add assigned_interviewer_ids to Candidates Table
alter table public.candidates 
add column if not exists assigned_interviewer_ids uuid[];

-- 2. Create Company Invites Table
create table if not exists public.company_invites (
    id uuid primary key default uuid_generate_v4(),
    company_id uuid references public.companies(id) on delete cascade not null,
    email text not null,
    role text not null check (role in ('recruiter', 'interviewer', 'admin')),
    token text unique not null,
    invited_by uuid references public.profiles(id) on delete set null,
    created_at timestamp with time zone default now() not null,
    expires_at timestamp with time zone not null,
    accepted boolean default false not null
);

-- 3. Create Audit Logs Table
create table if not exists public.audit_logs (
    id uuid primary key default uuid_generate_v4(),
    company_id uuid references public.companies(id) on delete cascade not null,
    profile_id uuid references public.profiles(id) on delete set null,
    action text not null,
    details jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null
);

-- 4. Create Indexes for Performance
create index if not exists idx_company_invites_token on public.company_invites(token);
create index if not exists idx_company_invites_email on public.company_invites(email);
create index if not exists idx_audit_logs_company_id on public.audit_logs(company_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at);

-- 5. Enable Row Level Security (RLS)
alter table public.company_invites enable row level security;
alter table public.audit_logs enable row level security;

-- 6. RLS Policies for Company Invites Table
create policy "Allow company members to view invites"
    on public.company_invites for select
    using (
        company_id = (select company_id from public.profiles where id = auth.uid())
    );

create policy "Allow company admins to insert invites"
    on public.company_invites for insert
    with check (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() 
              and profiles.company_id = company_invites.company_id 
              and profiles.role = 'admin'
        )
    );

create policy "Allow company admins to update invites"
    on public.company_invites for update
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() 
              and profiles.company_id = company_invites.company_id 
              and profiles.role = 'admin'
        )
    )
    with check (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() 
              and profiles.company_id = company_invites.company_id 
              and profiles.role = 'admin'
        )
    );

create policy "Allow company admins to delete invites"
    on public.company_invites for delete
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() 
              and profiles.company_id = company_invites.company_id 
              and profiles.role = 'admin'
        )
    );

-- 7. RLS Policies for Audit Logs Table
create policy "Allow company members to view audit logs"
    on public.audit_logs for select
    using (
        company_id = (select company_id from public.profiles where id = auth.uid())
    );

create policy "Allow system to insert audit logs"
    on public.audit_logs for insert
    with check (true);

-- 8. Update Job Postings Policies to restrict insert/update/delete to admin & recruiter
drop policy if exists "Allow job postings creation for company members" on public.job_postings;
create policy "Allow job postings creation for company admins and recruiters"
    on public.job_postings for insert
    with check (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid()
              and profiles.company_id = job_postings.company_id
              and profiles.role in ('admin', 'recruiter')
        )
    );

drop policy if exists "Allow job postings updates for company members" on public.job_postings;
create policy "Allow job postings updates for company admins and recruiters"
    on public.job_postings for update
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid()
              and profiles.company_id = job_postings.company_id
              and profiles.role in ('admin', 'recruiter')
        )
    )
    with check (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid()
              and profiles.company_id = job_postings.company_id
              and profiles.role in ('admin', 'recruiter')
        )
    );

drop policy if exists "Allow job postings deletion for company members" on public.job_postings;
create policy "Allow job postings deletion for company admins and recruiters"
    on public.job_postings for delete
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid()
              and profiles.company_id = job_postings.company_id
              and profiles.role in ('admin', 'recruiter')
        )
    );

-- 9. Update Candidates Policies to restrict insert/update/delete to admin & recruiter
drop policy if exists "Allow candidates insertion for company members" on public.candidates;
create policy "Allow candidates insertion for company admins and recruiters"
    on public.candidates for insert
    with check (
        exists (
            select 1 from public.job_postings
            join public.profiles on profiles.company_id = job_postings.company_id
            where job_postings.id = candidates.job_id
              and profiles.id = auth.uid()
              and profiles.role in ('admin', 'recruiter')
        )
    );

drop policy if exists "Allow candidates updates for company members" on public.candidates;
create policy "Allow candidates updates for company admins and recruiters"
    on public.candidates for update
    using (
        exists (
            select 1 from public.job_postings
            join public.profiles on profiles.company_id = job_postings.company_id
            where job_postings.id = candidates.job_id
              and profiles.id = auth.uid()
              and profiles.role in ('admin', 'recruiter')
        )
    )
    with check (
        exists (
            select 1 from public.job_postings
            join public.profiles on profiles.company_id = job_postings.company_id
            where job_postings.id = candidates.job_id
              and profiles.id = auth.uid()
              and profiles.role in ('admin', 'recruiter')
        )
    );

drop policy if exists "Allow candidates deletion for company members" on public.candidates;
create policy "Allow candidates deletion for company admins and recruiters"
    on public.candidates for delete
    using (
        exists (
            select 1 from public.job_postings
            join public.profiles on profiles.company_id = job_postings.company_id
            where job_postings.id = candidates.job_id
              and profiles.id = auth.uid()
              and profiles.role in ('admin', 'recruiter')
        )
    );


-- =========================================================================
-- PHASE 3: NOTES, SCORECARDS & OFFER STATUS (migration_phase3.sql)
-- =========================================================================

-- 1. Update Candidate Status Check Constraint to include 'offer'
alter table public.candidates drop constraint if exists candidates_status_check;
alter table public.candidates add constraint candidates_status_check check (status in ('new', 'shortlisted', 'interview_scheduled', 'rejected', 'offer'));

-- 2. Create Candidate Notes Table
create table if not exists public.candidate_notes (
    id uuid primary key default uuid_generate_v4(),
    candidate_id uuid references public.candidates(id) on delete cascade not null,
    profile_id uuid references public.profiles(id) on delete cascade not null,
    content text not null,
    created_at timestamp with time zone default now() not null
);

-- 3. Create Candidate Scorecards Table
create table if not exists public.candidate_scorecards (
    id uuid primary key default uuid_generate_v4(),
    candidate_id uuid references public.candidates(id) on delete cascade not null,
    profile_id uuid references public.profiles(id) on delete cascade not null,
    overall_rating integer check (overall_rating >= 1 and overall_rating <= 5) not null,
    feedback text,
    created_at timestamp with time zone default now() not null
);

-- 4. Enable Row Level Security (RLS)
alter table public.candidate_notes enable row level security;
alter table public.candidate_scorecards enable row level security;

-- 5. RLS Policies for Candidate Notes
create policy "Allow candidate notes view for company members"
    on public.candidate_notes for select
    using (
        exists (
            select 1 from public.candidates
            join public.job_postings on job_postings.id = candidates.job_id
            join public.profiles on profiles.company_id = job_postings.company_id
            where candidates.id = candidate_notes.candidate_id and profiles.id = auth.uid()
        )
    );

create policy "Allow candidate notes insertion for own profile"
    on public.candidate_notes for insert
    with check (
        profile_id = auth.uid() and
        exists (
            select 1 from public.candidates
            join public.job_postings on job_postings.id = candidates.job_id
            join public.profiles on profiles.company_id = job_postings.company_id
            where candidates.id = candidate_notes.candidate_id and profiles.id = auth.uid()
        )
    );

-- 6. RLS Policies for Candidate Scorecards
create policy "Allow candidate scorecards view for company members"
    on public.candidate_scorecards for select
    using (
        exists (
            select 1 from public.candidates
            join public.job_postings on job_postings.id = candidates.job_id
            join public.profiles on profiles.company_id = job_postings.company_id
            where candidates.id = candidate_scorecards.candidate_id and profiles.id = auth.uid()
        )
    );

create policy "Allow candidate scorecards insertion for own profile"
    on public.candidate_scorecards for insert
    with check (
        profile_id = auth.uid() and
        exists (
            select 1 from public.candidates
            join public.job_postings on job_postings.id = candidates.job_id
            join public.profiles on profiles.company_id = job_postings.company_id
            where candidates.id = candidate_scorecards.candidate_id and profiles.id = auth.uid()
        )
    );


-- =========================================================================
-- STORAGE BUCKETS SETUP (storage_resumes.sql)
-- =========================================================================

-- Create resumes storage bucket
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload into resumes/
create policy "Company members can upload resumes"
on storage.objects for insert
to authenticated
with check (bucket_id = 'resumes');

create policy "Company members can update resumes"
on storage.objects for update
to authenticated
using (bucket_id = 'resumes');

create policy "Public read resumes"
on storage.objects for select
to public
using (bucket_id = 'resumes');

-- =========================================================================
-- PHASE 2 HARDENING: lock role / company_id on profiles
-- =========================================================================

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

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


-- =========================================================================
-- PHASE 4: CHATBOT ASSISTANT (migration_phase4_chatbot.sql)
-- =========================================================================

-- 1. Create Chat Threads Table
create table if not exists public.chat_threads (
    id uuid primary key default uuid_generate_v4(),
    company_id uuid references public.companies(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    context_type text check (context_type in ('general', 'job', 'candidate')),
    context_id uuid,
    created_at timestamp with time zone default now() not null
);

-- 2. Create Chat Messages Table
create table if not exists public.chat_messages (
    id uuid primary key default uuid_generate_v4(),
    thread_id uuid references public.chat_threads(id) on delete cascade not null,
    role text check (role in ('user', 'assistant', 'system')) not null,
    content text not null,
    created_at timestamp with time zone default now() not null
);

-- 3. Create Indexes for Performance
create index if not exists idx_chat_threads_company_id on public.chat_threads(company_id);
create index if not exists idx_chat_threads_user_id on public.chat_threads(user_id);
create index if not exists idx_chat_messages_thread_id on public.chat_messages(thread_id);

-- 4. Enable Row Level Security (RLS)
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

-- 5. RLS Policies for Chat Threads
create policy "Allow company members to view their company's chat threads"
    on public.chat_threads for select
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.company_id = chat_threads.company_id
        )
    );

create policy "Allow company members to insert chat threads for their company"
    on public.chat_threads for insert
    with check (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.company_id = chat_threads.company_id
        )
    );

create policy "Allow company members to delete their own chat threads"
    on public.chat_threads for delete
    using (
        user_id = auth.uid()
    );

-- 6. RLS Policies for Chat Messages
create policy "Allow company members to view messages in their company's threads"
    on public.chat_messages for select
    using (
        exists (
            select 1 from public.chat_threads
            join public.profiles on profiles.company_id = chat_threads.company_id
            where chat_threads.id = chat_messages.thread_id and profiles.id = auth.uid()
        )
    );

create policy "Allow company members to insert messages in their company's threads"
    on public.chat_messages for insert
    with check (
        exists (
            select 1 from public.chat_threads
            join public.profiles on profiles.company_id = chat_threads.company_id
            where chat_threads.id = chat_messages.thread_id and profiles.id = auth.uid()
        )
    );


-- =========================================================================
-- PHASE 3 EXTENSION: BACKGROUND QUEUE SUPPORT (migration_phase3_background_queue.sql)
-- =========================================================================

-- 1. Add processing columns to Candidates table
ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'completed' CHECK (processing_status IN ('queued', 'processing', 'completed', 'failed')) NOT NULL,
ADD COLUMN IF NOT EXISTS processing_error text;

-- 2. Create index for performance on processing_status
CREATE INDEX IF NOT EXISTS idx_candidates_processing_status ON public.candidates(processing_status);


