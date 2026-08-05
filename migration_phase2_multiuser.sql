-- HireFlow Database Migration — Phase 2 Multiuser (Invites, Roles & Audits)
-- Run this in the Supabase SQL Editor AFTER migration_phase2.sql
-- Creates: company_invites, audit_logs, assigned_interviewer_ids + role-aware RLS
-- Guide: docs/SUPABASE_SETUP.md

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
