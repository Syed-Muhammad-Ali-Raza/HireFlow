import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getOutlookOAuthUrl } from '@/lib/calendar';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUrl = getOutlookOAuthUrl(user.id);

    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error('Outlook Calendar Connect error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}