import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { assertRole } from '@/lib/auth-helpers';

/**
 * GET /api/team/audit-logs
 * Recent company audit events. Admin-only.
 */
export async function GET() {
  try {
    const { profile, errorResponse } = await assertRole(['admin']);
    if (errorResponse) return errorResponse;

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, action, details, created_at, profile_id, profiles(name, email)')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
