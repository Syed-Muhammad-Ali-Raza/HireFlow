import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;
    const supabase = await createClient();
    const body = await request.json();
    const { status, match_score, match_reasoning } = body;

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Build update object
    const updateData: any = {};
    if (status !== undefined) {
      const validStatuses = ['new', 'shortlisted', 'interview_scheduled', 'rejected'];
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

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields provided to update' }, { status: 400 });
    }

    // 3. Update candidate (RLS ensures user belongs to same company as candidate's job)
    const { data: candidate, error: updateError } = await supabase
      .from('candidates')
      .update(updateData)
      .eq('id', candidateId)
      .select()
      .single();

    if (updateError) {
      console.error('Update candidate error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json(candidate);
  } catch (error: any) {
    console.error('Candidate PATCH route error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
