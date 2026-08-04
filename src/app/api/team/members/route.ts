import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { assertRole } from '@/lib/auth-helpers';

/**
 * GET /api/team/members
 * Fetch all profiles associated with the current user's company.
 */
export async function GET() {
  try {
    const { profile, errorResponse } = await assertRole(['admin', 'recruiter', 'interviewer']);
    if (errorResponse) return errorResponse;

    const supabase = await createClient();

    const { data: members, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, calendar_connected, created_at')
      .eq('company_id', profile.company_id)
      .order('role', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Fetch team members error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(members);
  } catch (error: any) {
    console.error('Team members GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
