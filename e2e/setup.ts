import { adminClient, e2eCredentials } from './db';

/**
 * E2E global setup: provisions the dedicated E2E user + a fresh, empty company.
 *
 * Runs once per `playwright test` invocation (globalSetup). To stay robust to
 * live-schema differences, it mirrors exactly what the app's own
 * `/api/companies` flow does against the real backend:
 *
 *   1. (Re)create the auth user via the admin API — this re-fires the
 *      on_auth_user_created trigger, which auto-creates a correct profile row.
 *   2. Create a company with just `{ name }` (no owner_id column in live DB).
 *   3. Update the profile with `{ company_id, role: 'admin' }`.
 *
 * The user is deleted and recreated each run so the dashboard always starts
 * empty (no leftover jobs/company), while admin-API user creation avoids
 * Supabase's email *signup* rate limit (only the browser signup endpoint is
 * limited).
 */

export async function provisionE2eUser() {
  const { email, password, companyName } = e2eCredentials();
  const admin = adminClient();

  // 1. Remove any previous incarnation of the E2E user (cascades to profile).
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = (existing?.users || []).find((u) => u.email === email);
  if (user) {
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error(`[e2e] deleteUser failed: ${delErr.message}`);
      process.exit(1);
    }
    console.log(`[e2e] Removed previous E2E user ${email}`);
  }

  // 2. Create the auth user (the live trigger creates the profile).
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: 'E2E Runner' },
  });
  if (error) {
    console.error(`[e2e] createUser failed: ${error.message}`);
    process.exit(1);
  }
  const userId = created!.user.id;
  console.log(`[e2e] Created auth user ${email}`);

  // 3. Create a fresh company (exactly like /api/companies).
  const { data: company, error: companyErr } = await admin
    .from('companies')
    .insert({ name: companyName })
    .select()
    .single();
  if (companyErr || !company) {
    console.error(`[e2e] company insert failed: ${companyErr?.message}`);
    process.exit(1);
  }

  // 4. Link the profile to the company as admin.
  const { error: profileErr } = await admin
    .from('profiles')
    .update({ company_id: company.id, role: 'admin' })
    .eq('id', userId);
  if (profileErr) {
    console.error(`[e2e] profile update failed: ${profileErr.message}`);
    process.exit(1);
  }

  console.log(`[e2e] Provisioned fresh company "${companyName}" for ${email}`);
}

export default provisionE2eUser;
