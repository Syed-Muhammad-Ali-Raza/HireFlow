import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { assertRole } from '@/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { createBookingToken, buildBookingUrl } from '@/lib/booking';
import { sendShortlistEmail } from '@/lib/email';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;
    const { profile, errorResponse } = await assertRole(['admin', 'recruiter']);
    if (errorResponse) return errorResponse;

    const supabase = await createClient();
    const body = await request.json();
    const { status, match_score, match_reasoning, assigned_interviewer_ids } = body;

    // 2. Build update object
    const updateData: any = {};
    if (status !== undefined) {
      const validStatuses = ['new', 'shortlisted', 'interview_scheduled', 'rejected', 'offer'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid candidate status' }, { status: 400 });
      }
      updateData.status = status;
    }

    if (match_score !== undefined) {
      const score = Number(match_score);
      if (isNaN(score) || score < 0 || score > 100) {
        return NextResponse.json({ error: 'Match score must be a number between 0 and 100' }, { status: 400 });
      }
      updateData.match_score = score;
    }

    if (match_reasoning !== undefined) {
      updateData.match_reasoning = match_reasoning;
    }

    if (assigned_interviewer_ids !== undefined) {
      if (assigned_interviewer_ids !== null && !Array.isArray(assigned_interviewer_ids)) {
        return NextResponse.json({ error: 'assigned_interviewer_ids must be an array' }, { status: 400 });
      }
      updateData.assigned_interviewer_ids = assigned_interviewer_ids;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields provided to update' }, { status: 400 });
    }

    // 3. Update candidate (RLS ensures user belongs to same company as candidate's job)
    const { data: candidate, error: updateError } = await supabase
      .from('candidates')
      .update(updateData)
      .eq('id', candidateId)
      .select('*, job_postings!inner(title, company_id, companies!inner(name))')
      .single();

    if (updateError || !candidate) {
      console.error('Update candidate error:', updateError);
      return NextResponse.json({ error: updateError?.message || 'Candidate not found' }, { status: 500 });
    }

    const cand = candidate as any;
    const companyId = cand.job_postings?.company_id;

    // 4. Send shortlist email if status was changed to 'shortlisted'
    if (status === 'shortlisted' && cand.email) {
      try {
        const token = createBookingToken(candidateId);
        const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const bookingUrl = buildBookingUrl(origin, candidateId, token);
        const jobTitle = cand.job_postings?.title || 'Position';
        const companyName = cand.job_postings?.companies?.name || 'Your Company';

        sendShortlistEmail(
          cand.email,
          cand.name,
          jobTitle,
          companyName,
          bookingUrl
        ).catch(emailErr => {
          console.error('Failed to send shortlist email:', emailErr);
        });
      } catch (err) {
        console.error('Failed to generate booking token/link for shortlist email:', err);
      }
    }

    // 5. Create Audit Logs
    if (status !== undefined) {
      await createAuditLog(
        companyId,
        profile.id,
        'candidate_status_changed',
        { candidate_id: candidateId, candidate_name: candidate.name, status }
      );
    }
    if (match_score !== undefined) {
      await createAuditLog(
        companyId,
        profile.id,
        'candidate_score_override',
        { candidate_id: candidateId, candidate_name: candidate.name, match_score: Number(match_score), reasoning: match_reasoning }
      );
    }
    if (assigned_interviewer_ids !== undefined) {
      await createAuditLog(
        companyId,
        profile.id,
        'candidate_interviewers_assigned',
        { candidate_id: candidateId, candidate_name: candidate.name, assigned_interviewer_ids }
      );
    }

    // Clean up join query output before returning
    const responseCandidate = { ...candidate };
    delete (responseCandidate as any).job_postings;

    return NextResponse.json(responseCandidate);
  } catch (error: any) {
    console.error('Candidate PATCH route error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

