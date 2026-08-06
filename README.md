# HireFlow

AI-powered recruiting platform: post jobs, upload resumes, get AI match scores, and let candidates self-schedule interviews via Google Calendar.

**Stack:** Next.js 15 · React 19 · Supabase (Auth + Postgres + Storage) · Claude / Gemini · Google Calendar

---

## Current status

| Area | Status |
|------|--------|
| Auth (email/password) + company setup | Done |
| Job create / list / detail | Done |
| Resume PDF upload + text extract + AI ranking | Done |
| Candidate pipeline statuses | Done |
| Google Calendar connect + Meet booking | Done |
| Public candidate booking page | Done |
| Roles (admin / interviewer / recruiter) | Enforced in API + RLS |
| Team invites / join existing company | Done — `/settings/team` + `/invite/[token]` |
| Outlook calendar | Schema only |
| Interviews dashboard UI | Done — `/interviews` |
| Product chatbot | Not built (Phase 4) |
| Docs | README + docs/SUPABASE_SETUP.md |

---

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- Optional: Anthropic and/or Gemini API key (falls back to keyword simulation)
- Optional: Google Cloud OAuth client (for Calendar + Meet)

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Environment

Copy `.env.local.example` → `.env.local` and fill values:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# AI (at least one recommended)
GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# App URL (OAuth redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Google Calendar (Phase 2)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
CALENDAR_ENCRYPTION_KEY=  # 32-byte secret for encrypting refresh tokens
```

### 3. Database (required)

**Full guide:** [docs/SUPABASE_SETUP.md](./docs/SUPABASE_SETUP.md)

**Fastest path:** Supabase → SQL Editor → paste and run [`setup_all.sql`](./setup_all.sql).

Or run incrementally: `schema.sql` → `migration_phase2.sql` → `migration_phase2_multiuser.sql` → `migration_phase2_hardening.sql` → `migration_phase3.sql` → `storage_resumes.sql`.

### 4. Storage (optional but recommended)

Included in `setup_all.sql`. Or run `storage_resumes.sql` / create a public bucket named `resumes`. Without it, uploads still work but use a mock file URL.

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
npm run start   # production server
npm run lint    # ESLint
```

---

## Product flow (today)

1. Sign up → create company  
2. Create a job (title, skills, description)  
3. On the job board, upload candidate PDFs → AI score + reasoning  
4. Shortlist / reject / override score  
5. Connect Google Calendar under **Settings → Integrations**  
6. Copy booking link → candidate picks a free slot → Meet event created  

---

## Project structure

```
src/
  app/                    # App Router pages + API routes
    login/
    jobs/new, jobs/[id]/
    book/[candidateId]/  # Public scheduling
    settings/integrations/
    api/                  # REST handlers
  lib/ai.ts               # Claude → Gemini → simulation
  lib/pdf.ts              # PDF text extraction
  lib/calendar.ts         # Google OAuth + freeBusy + Meet
  utils/supabase/         # Browser, server, middleware clients
schema.sql
migration_phase2.sql
```

---

## Docs in this repo

| Doc | Purpose |
|-----|---------|
| [README.md](./README.md) | Setup & overview (this file) |
| [docs/IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md) | Phased roadmap, scale, chatbot, team onboarding |
| [docs/ONBOARDING.md](./docs/ONBOARDING.md) | Guide for adding a new teammate / collaborator |
| [docs/SUPABASE_SETUP.md](./docs/SUPABASE_SETUP.md) | Create all tables in Supabase (SQL + verification) |
| `schema.sql` / `migration_phase2.sql` | Database source of truth |

---

## Security notes

- Recruiter APIs rely on Supabase RLS + session cookies.  
- Public booking uses the service role and a known `candidateId` — treat IDs as secrets; harden before production.  
- Do not commit `.env.local`. Rotate any keys that were shared.  
- Set a real `CALENDAR_ENCRYPTION_KEY` in production (never ship the code default).
