import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { assertRole } from '@/lib/auth-helpers';

// GET: List all job postings for the current user's company
export async function GET() {
  try {
    const supabase = await createClient();

    // 1. Get current logged-in user profile to fetch company_id
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || !profile.company_id) {
      return NextResponse.json({ error: 'Company not configured for profile' }, { status: 400 });
    }

    // 2. Fetch all job postings for that company
    const { data: jobs, error: jobsError } = await supabase
      .from('job_postings')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false });

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    return NextResponse.json(jobs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new job posting
export async function POST(request: Request) {
  try {
    const { profile, errorResponse } = await assertRole(['admin', 'recruiter']);
    if (errorResponse) return errorResponse;

    const supabase = await createClient();
    const body = await request.json();
    const { title, description, required_skills } = body;

    if (!title || !description) {
      return NextResponse.json({ error: 'Title and Description are required' }, { status: 400 });
    }

    // 2. Insert the job posting
    const { data: job, error: jobError } = await supabase
      .from('job_postings')
      .insert({
        company_id: profile.company_id,
        title,
        description,
        required_skills: required_skills || [],
        created_by: profile.id,
      })
      .select()
      .single();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 });
    }

    return NextResponse.json(job, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
