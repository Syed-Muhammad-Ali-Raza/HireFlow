import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { assertRole } from '@/lib/auth-helpers';

/**
 * GET /api/candidates/[id]/notes
 * Fetch all notes for a specific candidate. Accessible to admin/recruiter/interviewer.
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

    // 1. Fetch notes
    const { data: notes, error } = await supabase
      .from('candidate_notes')
      .select('*, profiles(name, email)')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Fetch notes error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(notes);
  } catch (error: any) {
    console.error('Candidate notes GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/candidates/[id]/notes
 * Add a new comment/note for a candidate.
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
    const { content } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Content cannot be empty.' }, { status: 400 });
    }

    const supabase = await createClient();

    // 2. Insert note
    const { data: newNote, error: insertError } = await supabase
      .from('candidate_notes')
      .insert({
        candidate_id: candidateId,
        profile_id: profile.id,
        content: content.trim(),
      })
      .select('*, profiles(name, email)')
      .single();

    if (insertError || !newNote) {
      console.error('Insert note error:', insertError?.message);
      return NextResponse.json({ error: insertError?.message || 'Failed to post note.' }, { status: 500 });
    }

    return NextResponse.json(newNote, { status: 201 });
  } catch (error: any) {
    console.error('Candidate notes POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
