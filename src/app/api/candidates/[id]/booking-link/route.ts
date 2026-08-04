import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { buildBookingUrl, createBookingToken } from '@/lib/booking';
import { assertRole } from '@/lib/auth-helpers';

/**
 * POST /api/candidates/[id]/booking-link
 * Auth required. Returns a signed, time-limited booking URL for the candidate.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;
    const { profile, errorResponse } = await assertRole(['admin', 'recruiter']);
    if (errorResponse) return errorResponse;

    const supabase = await createClient();

    // RLS ensures the candidate belongs to the user's company
    const { data: candidate, error: candError } = await supabase
      .from('candidates')
      .select('id, name')
      .eq('id', candidateId)
      .single();

    if (candError || !candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    const token = createBookingToken(candidateId);
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get('origin') ||
      'http://localhost:3000';

    const url = buildBookingUrl(origin, candidateId, token);

    return NextResponse.json({
      url,
      expiresInDays: 7,
      candidateId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
