import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { assertRole } from '@/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { sendInviteEmail } from '@/lib/email';
import crypto from 'crypto';

/**
 * POST /api/team/invites/[id]/resend
 * Rotate token + extend expiry 7 days. Admin-only.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: inviteId } = await params;
    const { profile: adminProfile, errorResponse } = await assertRole(['admin']);
    if (errorResponse) return errorResponse;

    const supabase = await createClient();

    const { data: invite, error: fetchError } = await supabase
      .from('company_invites')
      .select('*')
      .eq('id', inviteId)
      .eq('company_id', adminProfile.company_id)
      .eq('accepted', false)
      .single();

    if (fetchError || !invite) {
      return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data: updated, error: updateError } = await supabase
      .from('company_invites')
      .update({ token, expires_at: expiresAt.toISOString() })
      .eq('id', inviteId)
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message || 'Failed to refresh invitation.' },
        { status: 500 }
      );
    }

    // Fetch company name
    const { data: companyData } = await supabase
      .from('companies')
      .select('name')
      .eq('id', adminProfile.company_id)
      .single();
    const companyName = companyData?.name || 'Your Company';

    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const inviteUrl = `${origin.replace(/\/$/, '')}/invite/${token}`;

    // Resend invite email asynchronously
    sendInviteEmail(
      invite.email,
      inviteUrl,
      adminProfile.name || adminProfile.email,
      companyName,
      invite.role
    ).catch(emailErr => {
      console.error('Failed to resend invite email:', emailErr);
    });

    await createAuditLog(adminProfile.company_id!, adminProfile.id, 'invite_resent', {
      invite_id: invite.id,
      invite_email: invite.email,
    });

    return NextResponse.json({ invite: updated, inviteUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
