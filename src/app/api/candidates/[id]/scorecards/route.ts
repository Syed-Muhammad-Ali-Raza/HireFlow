import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { assertRole } from '@/lib/auth-helpers';

/**
 * GET /api/candidates/[id]/scorecards
 * Fetch all scorecard reviews/ratings for a candidate.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;
    const { profile, errorResponse } = await assertRole(['admin', 'recruiter', 'interviewer']);
    if (errorResponse) return errorResponse;

    const supabase = await createClient();

    const { data: scorecards, error } = await supabase
      .from('candidate_scorecards')
      .select('*, profiles(name, email)')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Fetch scorecards error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(scorecards);
  } catch (error: any) {
    console.error('Candidate scorecards GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/candidates/[id]/scorecards
 * Submit a scorecard evaluation (rating 1-5 + feedback).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;
    const { profile, errorResponse } = await assertRole(['admin', 'recruiter', 'interviewer']);
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { overall_rating, feedback } = body;

    const rating = Number(overall_rating);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be an integer between 1 and 5.' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Remove any existing scorecard by the same profile for this candidate to prevent duplicates
    await supabase
      .from('candidate_scorecards')
      .delete()
      .eq('candidate_id', candidateId)
      .eq('profile_id', profile.id);

    // 2. Insert new scorecard
    const { data: newScorecard, error: insertError } = await supabase
      .from('candidate_scorecards')
      .insert({
        candidate_id: candidateId,
        profile_id: profile.id,
        overall_rating: rating,
        feedback: feedback ? feedback.trim() : null,
      })
      .select('*, profiles(name, email)')
      .single();

    if (insertError || !newScorecard) {
      console.error('Insert scorecard error:', insertError?.message);
      return NextResponse.json({ error: insertError?.message || 'Failed to submit scorecard.' }, { status: 500 });
    }

    return NextResponse.json(newScorecard, { status: 201 });
  } catch (error: any) {
    console.error('Candidate scorecards POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
