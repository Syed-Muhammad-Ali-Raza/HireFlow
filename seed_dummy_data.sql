-- Seed Dummy Data for HireFlow
-- Run this in the Supabase SQL Editor. 
-- It will automatically detect the first company/profile in your database and populate the dashboard.

do $$
declare
    v_company_id uuid;
    v_profile_id uuid;
    v_job_id uuid;
    v_candidate_1 uuid;
    v_candidate_2 uuid;
    v_candidate_3 uuid;
begin
    -- 1. Get the first company and profile in the database
    select id into v_company_id from public.companies limit 1;
    select id into v_profile_id from public.profiles limit 1;
    
    if v_company_id is null or v_profile_id is null then
        raise exception 'Please sign up / log in on the app first so a company and profile are created!';
    end if;

    -- Ensure the profile is linked to the company and role is admin
    update public.profiles 
    set company_id = v_company_id, role = 'admin' 
    where id = v_profile_id;

    -- 2. Insert a dummy Job Posting
    insert into public.job_postings (company_id, title, description, required_skills, created_by)
    values (
        v_company_id,
        'Senior React Engineer',
        'We are looking for a Senior React Developer experienced with Next.js, Tailwind CSS, TypeScript, and state management libraries. You will lead the development of our core web applications.',
        array['React', 'Next.js', 'TypeScript', 'Tailwind CSS', 'State Management'],
        v_profile_id
    )
    returning id into v_job_id;

    -- 3. Insert Dummy Candidates
    -- Candidate 1: High Match
    insert into public.candidates (job_id, name, email, match_score, match_reasoning, matched_skills, missing_skills, status)
    values (
        v_job_id,
        'Sarah Jenkins',
        'sarah.jenkins@example.com',
        92,
        'Sarah has over 6 years of React experience. She has built multiple Next.js apps and shows strong competency in TypeScript and Tailwind. She is missing state management libraries, but has worked with Redux in the past.',
        array['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
        array['State Management'],
        'shortlisted'
    )
    returning id into v_candidate_1;

    -- Candidate 2: Mid Match
    insert into public.candidates (job_id, name, email, match_score, match_reasoning, matched_skills, missing_skills, status)
    values (
        v_job_id,
        'Alex Rodriguez',
        'alex.r@example.com',
        65,
        'Alex has 3 years of frontend developer experience. Strong CSS skills, React familiarity, and basic TypeScript knowledge. Lacks Next.js experience.',
        array['React', 'TypeScript'],
        array['Next.js', 'Tailwind CSS', 'State Management'],
        'new'
    )
    returning id into v_candidate_2;

    -- Candidate 3: Rejected Match
    insert into public.candidates (job_id, name, email, match_score, match_reasoning, matched_skills, missing_skills, status)
    values (
        v_job_id,
        'David Chen',
        'david.chen@example.com',
        25,
        'David is a backend engineer focused on Python/Django. Very little frontend experience. Not a fit for this React position.',
        array[]::text[],
        array['React', 'Next.js', 'TypeScript', 'Tailwind CSS', 'State Management'],
        'rejected'
    )
    returning id into v_candidate_3;

    -- 4. Insert a Dummy Interview for Sarah Jenkins
    insert into public.interviews (candidate_id, scheduled_time, interviewer_ids, status, meeting_link)
    values (
        v_candidate_1,
        now() + interval '1 day',
        array[v_profile_id],
        'confirmed',
        'https://meet.google.com/abc-defg-hij'
    );

    raise notice 'Seed completed successfully! Refresh your HireFlow dashboard.';
end $$;
