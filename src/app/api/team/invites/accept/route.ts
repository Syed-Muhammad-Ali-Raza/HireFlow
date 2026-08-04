import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { createAuditLog } from '@/lib/audit';

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/team/invites/accept?token=...
 * Public check. Validates that an invitation is still valid, and returns company details.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();

    // 1. Fetch pending, non-expired invite
    const { data: invite, error } = await supabaseAdmin
      .from('company_invites')
      .select('*, companies(name)')
      .eq('token', token)
      .eq('accepted', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !invite) {
      return NextResponse.json({ error: 'Invitation link is invalid or has expired.' }, { status: 400 });
    }

    return NextResponse.json({
      email: invite.email,
      role: invite.role,
      company_name: (invite as any).companies?.name || 'Company',
    });
  } catch (error: any) {
    console.error('Accept invite GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/team/invites/accept
 * Consume the token and link the authenticated user's profile to the company and role.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
    }

    // 1. Authenticate currently logged-in user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'You must be signed in to accept an invitation.' }, { status: 401 });
    }

    const supabaseAdmin = getAdminClient();

    // 2. Fetch invite details
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('company_invites')
      .select('*')
      .eq('token', token)
      .eq('accepted', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invitation is invalid or has expired.' }, { status: 400 });
    }

    // 3. Verify user email matches invite email
    if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
      return NextResponse.json({
        error: `This invitation was sent to ${invite.email}, but you are currently signed in as ${user.email}. Please switch accounts.`,
      }, { status: 400 });
    }

    // 4. Update user's profile with company_id and role
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        company_id: invite.company_id,
        role: invite.role,
      })
      .eq('id', user.id);

    if (profileError) {
      console.error('Failed to link profile to company:', profileError.message);
      return NextResponse.json({ error: 'Failed to update profile details.' }, { status: 500 });
    }

    // 5. Mark invitation as accepted
    await supabaseAdmin
      .from('company_invites')
      .update({ accepted: true })
      .eq('id', invite.id);

    // 6. Log audit event
    await createAuditLog(
      invite.company_id,
      user.id,
      'member_joined',
      {
        invite_id: invite.id,
        user_email: user.email,
        role: invite.role,
      }
    );

    return NextResponse.json({ success: true, company_id: invite.company_id, role: invite.role });
  } catch (error: any) {
    console.error('Accept invite POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
