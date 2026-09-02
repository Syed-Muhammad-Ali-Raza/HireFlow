import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { exchangeOutlookCode, encryptToken } from '@/lib/calendar';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectTarget = `${appUrl}/settings/integrations`;

  if (error) {
    console.error('Outlook OAuth Callback Error:', error);
    return NextResponse.redirect(`${redirectTarget}?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${redirectTarget}?error=Missing_auth_code_or_state`);
  }

  try {
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', state)
      .single();

    if (profileError || !profile) {
      console.error('Invalid state profile matching:', profileError);
      return NextResponse.redirect(`${redirectTarget}?error=Invalid_state_user`);
    }

    const tokenData = await exchangeOutlookCode(code);
    const refreshToken = tokenData.refresh_token;

    if (!refreshToken) {
      return NextResponse.redirect(`${redirectTarget}?error=Consent_refresh_missing_please_revoke_app_permissions`);
    }

    const encryptedToken = encryptToken(refreshToken);

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        calendar_connected: true,
        calendar_provider: 'outlook',
        calendar_access_token: tokenData.access_token || null,
        calendar_refresh_token: encryptedToken,
        calendar_email: profile.email,
      })
      .eq('id', state);

    if (updateError) {
      console.error('Failed to save Outlook tokens in database:', updateError.message);
      return NextResponse.redirect(`${redirectTarget}?error=Database_save_failed`);
    }

    return NextResponse.redirect(`${redirectTarget}?success=true`);
  } catch (err: any) {
    console.error('Outlook token exchange failed:', err);
    return NextResponse.redirect(`${redirectTarget}?error=${encodeURIComponent(err.message || 'Token_exchange_failed')}`);
  }
}