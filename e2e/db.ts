import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

/**
 * Shared DB helper for E2E setup/teardown.
 *
 * Loads Supabase keys from `.env.local` (and optionally `e2e/.env`) and provides
 * service-role operations to reset the dedicated E2E company's data between
 * tests, so specs can assert on deterministic empty states.
 */

const loaded = loadEnv();
const url = loaded.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = loaded.SUPABASE_SERVICE_ROLE_KEY;

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of ['.env.local', 'e2e/.env']) {
    const envPath = path.join(process.cwd(), file);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('export ')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      value = value.replace(/^['"]|['"]$/g, '');
      if (!out[key] && !process.env[key]) out[key] = value;
    }
  }
  return out;
}

export function e2eCredentials() {
  const email = process.env.E2E_USER_EMAIL || 'e2e-runner@example.com';
  const password = process.env.E2E_USER_PASSWORD || 'E2e-Super-Secret-123!';
  const companyName = process.env.E2E_COMPANY_NAME || 'E2E Test Company';
  return { email, password, companyName };
}

export function adminClient() {
  if (!url || !serviceRole) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Delete all job postings (and their candidates/notes/scorecards via FK
 * cascade) for the dedicated E2E company. Call in a `beforeEach` to guarantee
 * an empty dashboard for the test.
 */
export async function resetCompanyJobs() {
  const { email } = e2eCredentials();
  const admin = adminClient();

  const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = (userList?.users || []).find((u) => u.email === email);
  if (!user) return;

  const { data: profile } = await admin
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (!profile?.company_id) return;

  const { data: jobs } = await admin
    .from('job_postings')
    .select('id')
    .eq('company_id', profile.company_id);
  const ids = (jobs ?? []).map((j) => j.id);
  if (ids.length) {
    await admin.from('job_postings').delete().in('id', ids);
  }
}
