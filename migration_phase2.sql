-- HireFlow Database Migration — Phase 2 (Calendar & Interviews)
-- Run this in the Supabase SQL Editor AFTER schema.sql
-- Guide: docs/SUPABASE_SETUP.md

-- 1. Add Calendar Columns to Profiles table
alter table public.profiles 
add column if not exists calendar_connected boolean default false not null,
add column if not exists calendar_provider text check (calendar_provider in ('google', 'outlook', null)),
add column if not exists calendar_access_token text,
add column if not exists calendar_refresh_token text,
add column if not exists calendar_email text;

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
