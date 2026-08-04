import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { assertRole } from '@/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';

// Helper to initialize Supabase Admin client
function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * PATCH /api/team/members/[id]
 * Update a company member's role. Admin-only.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params;
    const { profile: adminProfile, errorResponse } = await assertRole(['admin']);
    if (errorResponse) return errorResponse;

    if (adminProfile.id === targetUserId) {
      return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 400 });
    }

    const body = await request.json();
    const { role } = body;

    const validRoles = ['admin', 'recruiter', 'interviewer'];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role specified.' }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();

    // 1. Verify target user belongs to the same company
    const { data: targetProfile, error: getProfileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single();

    if (getProfileError || !targetProfile) {
      return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
    }

    if (targetProfile.company_id !== adminProfile.company_id) {
      return NextResponse.json({ error: 'Forbidden: Member belongs to a different company.' }, { status: 403 });
    }

    // 2. Perform update
    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ role })
      .eq('id', targetUserId)
      .select()
      .single();

    if (updateError) {
      console.error('Update member role error:', updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 3. Log event
    await createAuditLog(
      adminProfile.company_id!,
      adminProfile.id,
      'member_role_changed',
      {
        target_user_id: targetUserId,
        target_user_email: targetProfile.email,
        old_role: targetProfile.role,
        new_role: role,
      }
    );

    return NextResponse.json(updatedProfile);
  } catch (error: any) {
    console.error('Team member PATCH error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/team/members/[id]
 * Remove a member from the company (sets company_id to null). Admin-only.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params;
    const { profile: adminProfile, errorResponse } = await assertRole(['admin']);
    if (errorResponse) return errorResponse;

    if (adminProfile.id === targetUserId) {
      return NextResponse.json({ error: 'You cannot remove yourself from the company.' }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();

    // 1. Verify target user belongs to the same company
    const { data: targetProfile, error: getProfileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single();

    if (getProfileError || !targetProfile) {
      return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
    }

    if (targetProfile.company_id !== adminProfile.company_id) {
      return NextResponse.json({ error: 'Forbidden: Member belongs to a different company.' }, { status: 403 });
    }

    // 2. Perform removal: disconnect company_id and reset role to default recruiter
    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ company_id: null, role: 'recruiter', calendar_connected: false, calendar_provider: null, calendar_refresh_token: null })
      .eq('id', targetUserId)
      .select()
      .single();

    if (updateError) {
      console.error('Remove member error:', updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 3. Log event
    await createAuditLog(
      adminProfile.company_id!,
      adminProfile.id,
      'member_removed',
      {
        target_user_id: targetUserId,
        target_user_email: targetProfile.email,
      }
    );

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (error: any) {
    console.error('Team member DELETE error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
