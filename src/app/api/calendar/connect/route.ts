import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getGoogleOAuthUrl } from '@/lib/calendar';

export async function GET() {
  try {
    const supabase = await createClient();

    // 1. Authenticate user from cookie session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Generate Google OAuth URL containing the user ID as state
    const authUrl = getGoogleOAuthUrl(user.id);
    
    // Redirect to Google Consent Page
    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error('Calendar Connect error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
