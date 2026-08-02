-- HireFlow Database Schema
-- Run this in the Supabase SQL Editor

-- 1. Enable UUID generation extension
create extension if not exists "uuid-ossp";

-- 2. Create Companies Table
create table public.companies (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    created_at timestamp with time zone default now() not null
);

-- 3. Create Profiles Table (extends Auth Users)
create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    company_id uuid references public.companies(id) on delete set null,
    name text,
    email text not null,
    role text default 'recruiter' check (role in ('recruiter', 'interviewer', 'admin')),
    created_at timestamp with time zone default now() not null
);

-- 4. Create Job Postings Table
create table public.job_postings (
    id uuid primary key default uuid_generate_v4(),
    company_id uuid references public.companies(id) on delete cascade not null,
    title text not null,
    description text not null,
    required_skills text[] default '{}'::text[] not null,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamp with time zone default now() not null
);

-- 5. Create Candidates Table
create table public.candidates (
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
create index idx_profiles_company_id on public.profiles(company_id);
create index idx_job_postings_company_id on public.job_postings(company_id);
create index idx_candidates_job_id on public.candidates(job_id);
create index idx_candidates_status on public.candidates(status);

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

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();
