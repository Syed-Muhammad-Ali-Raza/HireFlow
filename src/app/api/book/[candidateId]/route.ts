import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params;

    // Initialize Supabase Admin to query candidate details anonymously
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Fetch Candidate
    const { data: candidate, error: candidateError } = await supabaseAdmin
      .from('candidates')
      .select('id, name, email, job_id')
      .eq('id', candidateId)
      .single();

    if (candidateError || !candidate) {
      return NextResponse.json({ error: 'Candidate not found or link has expired' }, { status: 404 });
    }

    // 2. Fetch Job Details & Company ID
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_postings')
      .select('title, company_id')
      .eq('id', candidate.job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Associated job posting not found' }, { status: 404 });
    }

    // 3. Fetch Company Details
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('name')
      .eq('id', job.company_id)
      .single();

    // 4. Fetch Connected Interviewers in the company to check availability against
    const { data: interviewers } = await supabaseAdmin
      .from('profiles')
      .select('id, name, email')
      .eq('company_id', job.company_id)
      .eq('calendar_connected', true);

    return NextResponse.json({
      candidate: {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
      },
      job: {
        title: job.title,
      },
      company: {
        name: company?.name || 'Company',
      },
      interviewers: interviewers || [],
    });
  } catch (error: any) {
    console.error('Public Book Detail Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
