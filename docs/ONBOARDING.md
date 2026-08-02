# HireFlow — Adding Another Person (Complete Guide)

Two meanings of “add another person” are covered:

1. **Teammate / developer** collaborating on the codebase  
2. **Company user** (recruiter / interviewer / admin) inside the product  

Today (pre–Phase 2), #2 is incomplete: there is **no invite flow**. A second signup creates a **new** user with `company_id = null` and must be linked manually. Prefer shipping invites (Phase 2) before onboarding real coworkers as product users.

---

## Part A — Add a developer / collaborator

### A1. Access

1. Put the repo on GitHub/GitLab (private recommended).  
2. Invite them with **write** (or **read** if reviewers only).  
3. Never share production `SUPABASE_SERVICE_ROLE_KEY` or live OAuth secrets in chat — use a password manager or Vercel/Supabase team invites.

### A2. Their machine setup

```bash
git clone <repo-url>
cd <repo>
npm install
cp .env.local.example .env.local
# Fill keys — prefer a shared DEV Supabase project, not production
npm run dev
```

They need:

| Item | Notes |
|------|--------|
| Node 20+ | `node -v` |
| Dev Supabase project | Or restricted access to shared staging |
| AI key (optional) | Without it, matching uses keyword simulation |
| Google OAuth (optional) | Only if testing calendar locally; redirect URI must include their `NEXT_PUBLIC_APP_URL` |

### A3. Database for new environments

Run in SQL Editor:

1. `schema.sql`  
2. `migration_phase2.sql`  

Create Storage bucket `resumes` if testing uploads.

### A4. What they should read first

1. [README.md](../README.md) — setup  
2. [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — roadmap  
3. This file — roles & invites  
4. Skim `src/lib/ai.ts`, `src/lib/calendar.ts`, `src/app/api/**`  

### A5. Working agreement (recommended)

- Branch from `main`; open PRs; don’t push secrets.  
- One feature per PR when possible.  
- Touch RLS carefully — always think multi-tenant.  
- Match existing patterns: App Router + `'use client'` pages calling `/api/*`.  
- Before merge: `npm run lint` and manual smoke of the path you changed.

### A6. Architecture cheat sheet for new contributors

| Concern | Where |
|---------|--------|
| Auth session (browser) | `src/utils/supabase/client.ts` |
| Auth session (API/RSC) | `src/utils/supabase/server.ts` |
| Cookie refresh | `src/middleware.ts` |
| AI ranking | `src/lib/ai.ts` |
| PDF text | `src/lib/pdf.ts` |
| Google Calendar | `src/lib/calendar.ts` |
| Tenant boundary | `profiles.company_id` + RLS |

---

## Part B — Add a product user to a company (recruiter / interviewer)

### B1. Current workaround (until invites exist)

**Only for trusted staging users.**

1. Person signs up at `/login` (creates `auth.users` + `profiles` via trigger).  
2. In Supabase Table Editor → `profiles`: set their `company_id` to your company UUID.  
3. Set `role` to `recruiter`, `interviewer`, or `admin` (role is **not enforced in app code yet**).  
4. They refresh `/` — they should see the company jobs.  
5. If they are an interviewer: they log in → **Settings → Integrations** → Connect Google Calendar.

**Risks:** no invite audit trail; roles don’t restrict UI; anyone who signs up could create their own company.

### B2. Target flow (Phase 2 — build this)

```
Admin opens Team settings
  → enters email + role
  → system creates invite token (expires 7 days)
  → email link: /invite/[token]
  → user signs up / logs in
  → invite consumed; profile.company_id + role set
  → redirect to dashboard
```

**Suggested tables**

```sql
create table public.invites (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete cascade not null,
  email text not null,
  role text not null check (role in ('recruiter', 'interviewer', 'admin')),
  token text unique not null,
  invited_by uuid references public.profiles(id),
  accepted_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz default now() not null
);
```

**API sketch**

- `POST /api/invites` — admin only  
- `GET /api/invites/[token]` — validate  
- `POST /api/invites/[token]/accept` — attach company + role  

**UI**

- `/settings/team` — member list + invite form  
- `/invite/[token]` — accept page  

### B3. Role matrix (target behavior)

| Action | Admin | Recruiter | Interviewer |
|--------|-------|-----------|-------------|
| Manage team / invites | ✓ | — | — |
| Create / edit jobs | ✓ | ✓ | — |
| Upload / rank candidates | ✓ | ✓ | view maybe |
| Change candidate status | ✓ | ✓ | limited |
| Connect own calendar | ✓ | ✓ | ✓ |
| Appear as bookable interviewer | if assigned | if assigned | ✓ |
| Company settings / billing | ✓ | — | — |

Until Phase 2 ships, treat **everyone as a full recruiter**.

### B4. Checklist before inviting a real coworker

- [ ] Staging env separate from production  
- [ ] Invites + role checks merged (Phase 2)  
- [ ] Middleware protects private routes  
- [ ] Booking links are signed / expiring  
- [ ] Calendar encryption key is strong and unique  
- [ ] They know not to upload real candidate PII on shared demos without agreement  

---

## Part C — Add a candidate (applicant)

Candidates are **not** auth users today.

1. Recruiter uploads PDF on `/jobs/[id]` **or** (future) candidate applies via public form.  
2. System stores row on `candidates` with AI score.  
3. Recruiter copies `/book/{candidateId}` (later: signed URL).  
4. Candidate opens link (no login) → picks slot → Meet created.

**Future improvements:** public apply form, email magic links, candidate chat FAQ (see implementation plan Phase 4).

---

## Part D — First-day checklist for a new teammate (developer)

- [ ] Repo cloned, `npm install`, `.env.local` filled  
- [ ] SQL applied on shared **dev** Supabase  
- [ ] Can open app, sign up test user, create company  
- [ ] Upload one sample PDF and see a score  
- [ ] Read IMPLEMENTATION_PLAN Phase 1–2  
- [ ] Assigned a ticket from P0 backlog (prefer invites/roles or auth middleware)  

---

## Part E — Security when adding people

| Do | Don’t |
|----|--------|
| Use separate Supabase projects for prod vs dev | Share service role key in Slack |
| Invite via GitHub teams + least privilege | Commit `.env.local` |
| Rotate keys if a contractor leaves | Give production DB write to everyone |
| Document who is admin of Supabase/Vercel/Google Cloud | Rely on “security through obscurity” for booking IDs |

---

## Quick answers

**“Can I add my cofounder as a second recruiter today?”**  
Yes, only via manual `profiles.company_id` update in Supabase (Part B1). Build invites ASAP.

**“Can I add a developer this week?”**  
Yes — Part A. Give them staging credentials only.

**“When can we add interviewers properly?”**  
After Phase 2: invites + role enforcement + interviewer assignment on booking.
