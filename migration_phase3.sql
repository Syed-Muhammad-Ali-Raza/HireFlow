-- HireFlow Database Migration — Phase 3 (Notes, Scorecards & Offer Status)
-- Run this in the Supabase SQL Editor

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
