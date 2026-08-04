import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { assertRole } from '@/lib/auth-helpers';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: job, error: jobError } = await supabase
      .from('job_postings')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job posting not found' }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const { profile, errorResponse } = await assertRole(['admin', 'recruiter']);
    if (errorResponse) return errorResponse;

    const supabase = await createClient();

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.title === 'string' && body.title.trim()) {
      updates.title = body.title.trim();
    }
    if (typeof body.description === 'string' && body.description.trim()) {
      updates.description = body.description.trim();
    }
    if (Array.isArray(body.required_skills)) {
      updates.required_skills = body.required_skills
        .map((s: unknown) => String(s).trim())
        .filter(Boolean);
    } else if (typeof body.required_skills === 'string') {
      updates.required_skills = body.required_skills
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: job, error: updateError } = await supabase
      .from('job_postings')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single();

    if (updateError || !job) {
      return NextResponse.json(
        { error: updateError?.message || 'Job posting not found' },
        { status: updateError ? 500 : 404 }
      );
    }

    return NextResponse.json(job);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const { profile, errorResponse } = await assertRole(['admin', 'recruiter']);
    if (errorResponse) return errorResponse;

    const supabase = await createClient();

    const { error: deleteError } = await supabase.from('job_postings').delete().eq('id', jobId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
