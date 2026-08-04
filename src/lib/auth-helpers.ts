import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export interface UserProfile {
  id: string;
  company_id: string | null;
  name: string | null;
  email: string;
  role: 'admin' | 'recruiter' | 'interviewer';
  created_at: string;
}

/**
 * Fetch the profile of the currently logged-in user.
 * Returns null if the user is unauthenticated or the profile doesn't exist.
 */
export async function getProfileOrNull(): Promise<UserProfile | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return null;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) return null;
    return profile as UserProfile;
  } catch (err) {
    console.error('Error fetching profile in auth helpers:', err);
    return null;
  }
}

/**
 * Enforces authentication and role-based access control.
 * If unauthorized or if the user's role is not in allowedRoles, returns an error response.
 * Otherwise, returns the user's profile and a null response.
 */
export async function assertRole(allowedRoles: ('admin' | 'recruiter' | 'interviewer')[]): Promise<{
  profile: UserProfile;
  errorResponse: NextResponse | null;
}> {
  const profile = await getProfileOrNull();
  if (!profile) {
    return {
      profile: null as any,
      errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (!profile.company_id) {
    return {
      profile,
      errorResponse: NextResponse.json({ error: 'Company profile not configured for user' }, { status: 400 }),
    };
  }

  if (!allowedRoles.includes(profile.role)) {
    return {
      profile,
      errorResponse: NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 }),
    };
  }

  return { profile, errorResponse: null };
}
