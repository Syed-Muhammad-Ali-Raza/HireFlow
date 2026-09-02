import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { exchangeGoogleCode, encryptToken } from '@/lib/calendar';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // Contains target user ID
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectTarget = `${appUrl}/settings/integrations`;

  if (error) {
    console.error('OAuth Callback Error:', error);
    return NextResponse.redirect(`${redirectTarget}?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${redirectTarget}?error=Missing_auth_code_or_state`);
  }

  try {
    // 1. Initialize Supabase Admin client using Service Role Key
    // This allows writing token info even if cookies are temporarily dropped during cross-domain redirect
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Fetch User Profile to confirm state user ID is valid
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', state)
      .single();

    if (profileError || !profile) {
      console.error('Invalid state profile matching:', profileError);
      return NextResponse.redirect(`${redirectTarget}?error=Invalid_state_user`);
    }

    // 3. Exchange auth code for tokens
    const tokenData = await exchangeGoogleCode(code);
    const refreshToken = tokenData.refresh_token;

    if (!refreshToken) {
      // If refresh token is missing, it might mean the user is re-connecting without having revoked permissions
      // We can warn the user or prompt them to revoke and retry
      console.warn('OAuth succeeded but did not return a refresh token.');
      return NextResponse.redirect(`${redirectTarget}?error=Consent_refresh_missing_please_revoke_app_permissions`);
    }

    // 4. Encrypt refresh token
    const encryptedToken = encryptToken(refreshToken);

    // 5. Update user profile
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        calendar_connected: true,
        calendar_provider: 'google',
        calendar_access_token: tokenData.access_token || null,
        calendar_refresh_token: encryptedToken,
        calendar_email: profile.email,
      })
      .eq('id', state);

    if (updateError) {
      console.error('Failed to save refresh token in database:', updateError.message);
      return NextResponse.redirect(`${redirectTarget}?error=Database_save_failed`);
    }

    return NextResponse.redirect(`${redirectTarget}?success=true`);
  } catch (err: any) {
    console.error('Tokens callback exchange failed:', err);
    return NextResponse.redirect(`${redirectTarget}?error=${encodeURIComponent(err.message || 'Token_exchange_failed')}`);
  }
}
