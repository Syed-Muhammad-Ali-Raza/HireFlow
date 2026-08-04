import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Creates an audit log entry in the database.
 * Runs using the Supabase Service Role key to bypass RLS.
 */
export async function createAuditLog(
  companyId: string,
  profileId: string | null,
  action: string,
  details: Record<string, any> = {}
) {
  try {
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabaseAdmin.from('audit_logs').insert({
      company_id: companyId,
      profile_id: profileId,
      action,
      details,
    });

    if (error) {
      console.error('Failed to create audit log in database:', error.message);
    }
  } catch (err) {
    console.error('Error during audit log creation:', err);
  }
}
