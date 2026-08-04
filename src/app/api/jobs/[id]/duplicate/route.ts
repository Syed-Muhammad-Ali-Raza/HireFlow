import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { assertRole } from '@/lib/auth-helpers';

/**
 * POST /api/jobs/[id]/duplicate
 * Clones an existing job posting.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const { profile, errorResponse } = await assertRole(['admin', 'recruiter']);
    if (errorResponse) return errorResponse;

    const supabase = await createClient();

    // 1. Fetch original job details
    const { data: job, error: fetchError } = await supabase
      .from('job_postings')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ error: 'Job posting not found.' }, { status: 404 });
    }

    // Double check tenant boundary just in case
    if (job.company_id !== profile.company_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Insert duplicated job
    const { data: duplicateJob, error: duplicateError } = await supabase
      .from('job_postings')
      .insert({
        company_id: profile.company_id,
        title: `${job.title} (Copy)`,
        description: job.description,
        required_skills: job.required_skills,
        created_by: profile.id,
      })
      .select()
      .single();

    if (duplicateError || !duplicateJob) {
      console.error('Job duplication error:', duplicateError?.message);
      return NextResponse.json({ error: duplicateError?.message || 'Failed to duplicate job' }, { status: 500 });
    }

    return NextResponse.json(duplicateJob, { status: 201 });
  } catch (error: any) {
    console.error('Job duplicate POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
