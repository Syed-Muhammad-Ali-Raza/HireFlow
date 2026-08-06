# HireFlow — Supabase table creation guide

Follow this exactly in the [Supabase Dashboard](https://supabase.com/dashboard) for a new project (or to catch an existing project up).

---

## What you will create

| Table / object | Phase | Purpose |
|----------------|-------|---------|
| `companies` | 1 | Tenant (one hiring org) |
| `profiles` | 1 | App user linked to `auth.users` + company + role |
| `job_postings` | 1 | Jobs belonging to a company |
| `candidates` | 1 | Resumes + AI scores on a job |
| `interviews` | 2 calendar | Booked meetings + Meet links |
| `company_invites` | 2 team | Email invites with role + token |
| `audit_logs` | 2 team | Who changed status / roles / invites |
| `candidate_notes` | 3 | Recruiter notes |
| `candidate_scorecards` | 3 | Interview ratings |
| Storage bucket `resumes` | 1 | PDF files |

Roles on `profiles.role`: **`admin`** · **`recruiter`** · **`interviewer`**

---

## Step 0 — Create a Supabase project

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Copy these into `.env.local` (Project Settings → API):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon / public)
   - `SUPABASE_SERVICE_ROLE_KEY` (service_role — **never expose in the browser**)
3. Auth → Providers → **Email** enabled. For local demos you can disable “Confirm email”.

---

## Step 1 — Run SQL (choose one path)

### Path A — Fresh project (recommended)

Open **SQL Editor → New query**, paste the **entire** file:

- [`setup_all.sql`](../setup_all.sql)

Click **Run**. This creates every table, index, RLS policy, trigger, and storage bucket from Phase 1–3.

### Path B — Incremental (if you already ran older scripts)

Run **in this order**, one file at a time:

| Order | File | What it adds |
|------:|------|----------------|
| 1 | [`schema.sql`](../schema.sql) | companies, profiles, jobs, candidates, signup trigger, RLS |
| 2 | [`migration_phase2.sql`](../migration_phase2.sql) | calendar columns on profiles + `interviews` |
| 3 | [`migration_phase2_multiuser.sql`](../migration_phase2_multiuser.sql) | invites, audit_logs, interviewer assignment, role RLS |
| 4 | [`migration_phase2_hardening.sql`](../migration_phase2_hardening.sql) | block self role/company escalation |
| 5 | [`migration_phase3.sql`](../migration_phase3.sql) | notes, scorecards, `offer` status |
| 6 | [`storage_resumes.sql`](../storage_resumes.sql) | `resumes` storage bucket + policies |

If a policy already exists, `drop policy if exists …` in later files is safe.

---

## Step 2 — Verify tables

In Dashboard → **Table Editor**, you should see:

```
public.companies
public.profiles
public.job_postings
public.candidates
public.interviews
public.company_invites
public.audit_logs
public.candidate_notes          (Phase 3)
public.candidate_scorecards     (Phase 3)
```

Each table should show **RLS enabled** (shield icon).

---

## Step 3 — Auth trigger check

When a user signs up, a row must appear in `profiles`.

Dashboard → **Database → Triggers** → `on_auth_user_created` on `auth.users`.

If signup works but there is no profile row, re-run the trigger section from `schema.sql` / `setup_all.sql`.

---

## Step 4 — Storage bucket

Dashboard → **Storage**:

- Bucket name: **`resumes`**
- Public: **ON** for simple demos (or use signed URLs later)

If the bucket is missing, run [`storage_resumes.sql`](../storage_resumes.sql).

---

## Step 5 — Promote yourself to admin (existing users)

New company creators are set to **admin** automatically via `/api/companies`.

If your profile is still `recruiter` from before Phase 2:

1. Table Editor → `profiles`
2. Set `role` = `admin` for your user
3. Confirm `company_id` is your company UUID

After `migration_phase2_hardening.sql`, **users cannot change `role` or `company_id` from the app**. Use Table Editor or Team settings (admin API) only.

---

## Table reference (columns you care about)

### `companies`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | Tenant id |
| `name` | text | Display name |
| `created_at` | timestamptz | |

### `profiles`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | Same as `auth.users.id` |
| `company_id` | uuid FK | Null until company created or invite accepted |
| `email` | text | |
| `name` | text | |
| `role` | text | `admin` / `recruiter` / `interviewer` |
| `calendar_connected` | boolean | Phase 2 calendar |
| `calendar_provider` | text | `google` or `outlook` |
| `calendar_refresh_token` | text | Encrypted refresh token |

### `job_postings`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `company_id` | uuid FK | Tenant scope |
| `title`, `description` | text | |
| `required_skills` | text[] | |
| `created_by` | uuid FK | Profile who created it |

### `candidates`

| Column | Type | Notes |
|--------|------|--------|
| `job_id` | uuid FK | Parent job |
| `name`, `email` | text | Parsed from resume when possible |
| `resume_file_url`, `resume_text` | text | |
| `match_score` | numeric 0–100 | |
| `status` | text | `new`, `shortlisted`, `interview_scheduled`, `rejected`, `offer` |
| `assigned_interviewer_ids` | uuid[] | Who can be booked |

### `company_invites`

| Column | Type | Notes |
|--------|------|--------|
| `email` | text | Invitee |
| `role` | text | Role they receive on accept |
| `token` | text unique | Used in `/invite/[token]` |
| `expires_at` | timestamptz | Default 7 days |
| `accepted` | boolean | Consumed after join |

### `audit_logs`

| Column | Type | Notes |
|--------|------|--------|
| `company_id` | uuid FK | |
| `profile_id` | uuid FK | Actor |
| `action` | text | e.g. `member_invited`, `candidate_status_changed` |
| `details` | jsonb | Extra payload |

### `interviews`

| Column | Type | Notes |
|--------|------|--------|
| `candidate_id` | uuid FK | |
| `scheduled_time` | timestamptz | |
| `interviewer_ids` | uuid[] | Hosts on the calendar event |
| `meeting_link` | text | Google Meet |
| `status` | text | `pending` / `confirmed` / `cancelled` |

---

## Common errors

| Error | Fix |
|-------|-----|
| `relation "companies" does not exist` | You have not run `schema.sql` / `setup_all.sql` |
| `new row violates row-level security` | RLS policy missing or user has no `company_id` |
| Invite insert fails for admin | Confirm `profiles.role = 'admin'` |
| Upload works but PDF URL is `/uploads/...` | Create `resumes` bucket |
| Signup has no profile | Re-apply `handle_new_user` trigger |
| `uuid_generate_v4` missing | `create extension if not exists "uuid-ossp";` |

---

## Optional dummy data

After you have at least one real auth user + company:

- [`seed_dummy_data.sql`](../seed_dummy_data.sql) — edit the UUIDs at the top first.

---

## After SQL is applied

1. Restart `npm run dev`
2. Sign up → create company (you become **admin**)
3. **Team** → invite a second email as recruiter/interviewer
4. Open the invite link → they join the same `company_id`
