import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { assertBookingAccess } from '@/lib/booking';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params;

    const limited = checkRateLimit(`book:${clientIp(request)}:${candidateId}`, 40);
    if (!limited.ok) {
      return NextResponse.json(
        { error: 'Too many requests. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    const tokenError = assertBookingAccess(candidateId, token);
    if (tokenError) {
      return NextResponse.json({ error: tokenError }, { status: 403 });
    }

    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: candidate, error: candidateError } = await supabaseAdmin
      .from('candidates')
      .select('id, name, email, job_id')
      .eq('id', candidateId)
      .single();

    if (candidateError || !candidate) {
      return NextResponse.json({ error: 'Candidate not found or link has expired' }, { status: 404 });
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_postings')
      .select('title, company_id')
      .eq('id', candidate.job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Associated job posting not found' }, { status: 404 });
    }

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('name')
      .eq('id', job.company_id)
      .single();

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
  } catch (error: unknown) {
    console.error('Public Book Detail Error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
