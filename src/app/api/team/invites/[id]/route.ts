import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { assertRole } from '@/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';

/**
 * DELETE /api/team/invites/[id]
 * Revoke/delete a pending invitation. Admin-only.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: inviteId } = await params;
    const { profile: adminProfile, errorResponse } = await assertRole(['admin']);
    if (errorResponse) return errorResponse;

    const supabase = await createClient();

    // 1. Fetch details of invite to log properly
    const { data: invite, error: fetchError } = await supabase
      .from('company_invites')
      .select('*')
      .eq('id', inviteId)
      .eq('company_id', adminProfile.company_id)
      .single();

    if (fetchError || !invite) {
      return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
    }

    // 2. Perform deletion
    const { error: deleteError } = await supabase
      .from('company_invites')
      .delete()
      .eq('id', inviteId);

    if (deleteError) {
      console.error('Revoke invite error:', deleteError.message);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // 3. Log event
    await createAuditLog(
      adminProfile.company_id!,
      adminProfile.id,
      'invite_revoked',
      {
        invite_id: invite.id,
        invite_email: invite.email,
        invite_role: invite.role,
      }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Team invite DELETE error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
