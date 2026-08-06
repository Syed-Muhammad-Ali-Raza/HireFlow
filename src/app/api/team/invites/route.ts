import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { assertRole } from '@/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import crypto from 'crypto';

/**
 * GET /api/team/invites
 * List pending invitations for the company. Admin-only.
 */
export async function GET() {
  try {
    const { profile, errorResponse } = await assertRole(['admin']);
    if (errorResponse) return errorResponse;

    const supabase = await createClient();

    const { data: invites, error } = await supabase
      .from('company_invites')
      .select('*, invited_by_profile:profiles!company_invites_invited_by_fkey(name, email)')
      .eq('company_id', profile.company_id)
      .eq('accepted', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch invites error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(invites);
  } catch (error: any) {
    console.error('Team invites GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/team/invites
 * Create a new team invitation. Admin-only.
 */
export async function POST(request: Request) {
  try {
    const { profile: adminProfile, errorResponse } = await assertRole(['admin']);
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { email, role } = body;

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Invalid email format.' }, { status: 400 });
    }

    const validRoles = ['admin', 'recruiter', 'interviewer'];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role specified.' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Check if email is already in the company profiles
    const { data: existingMember } = await supabase
      .from('profiles')
      .select('id, company_id')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (existingMember && existingMember.company_id === adminProfile.company_id) {
      return NextResponse.json({ error: 'This user is already a member of your company.' }, { status: 400 });
    }

    // 2. Remove any existing pending invites for this email and company
    await supabase
      .from('company_invites')
      .delete()
      .eq('company_id', adminProfile.company_id)
      .eq('email', email.trim().toLowerCase());

    // 3. Generate token and invite metadata
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expiry 7 days from now

    // 4. Insert invite into Database
    const { data: invite, error: inviteError } = await supabase
      .from('company_invites')
      .insert({
        company_id: adminProfile.company_id,
        email: email.trim().toLowerCase(),
        role,
        token,
        invited_by: adminProfile.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (inviteError || !invite) {
      console.error('Insert invite error:', inviteError?.message);
      return NextResponse.json({ error: inviteError?.message || 'Failed to generate invitation.' }, { status: 500 });
    }

    // 5. Construct invite URL
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const inviteUrl = `${origin.replace(/\/$/, '')}/invite/${token}`;

    // 6. Log audit event
    await createAuditLog(
      adminProfile.company_id!,
      adminProfile.id,
      'member_invited',
      {
        invite_id: invite.id,
        invite_email: invite.email,
        invite_role: invite.role,
      }
    );

    return NextResponse.json({
      invite,
      inviteUrl,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Team invites POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
