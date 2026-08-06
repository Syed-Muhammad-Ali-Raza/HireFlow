# HireFlow — Full Implementation Plan

Last updated: 2026-08-02

This plan covers: what exists today → next phases → how to scale → chatbot integration → what must be done before adding people.

---

## 0. Reality check (as of now)

**Working product core**
- Multi-tenant companies via Supabase
- Jobs + AI resume ranking (Claude / Gemini / keyword fallback)
- Candidate statuses + score override
- Google Calendar OAuth, free/busy overlap, public booking + Google Meet

**Not production-ready yet**
- `.env.local` may be empty — Supabase/AI/Google must be configured
- Roles exist in DB but are **not enforced** in UI/API
- No invite / join-company flow (hard to add a second person correctly)
- No interviews dashboard UI (API exists)
- Public booking is open if someone knows `candidateId`
- README was stock create-next-app (replaced); product docs live here + ONBOARDING.md
- No tests, CI, staging, or monitoring

**Blocker to “run fully”:** configure Supabase URL/keys, apply SQL, optional AI + Google OAuth keys.

---

## 1. Recommended phase roadmap

### Phase 1 — Stabilize foundation ✅ COMPLETED

Goal: reliable local + staging demo for one company.

| # | Work item | Status |
|---|-----------|--------|
| 1.1 | Fill `.env.local`, apply SQL | Ops (user configures keys) |
| 1.2 | Storage bucket `resumes` | Documented in README; create in Supabase |
| 1.3 | Middleware route protection | Done — `/jobs`, `/settings`, `/interviews` |
| 1.4 | Complete `.env.local.example` | Done (+ Google, booking secret) |
| 1.5 | Job edit / delete UI + API | Done — PATCH/DELETE `/api/jobs/[id]` |
| 1.6 | Extract name/email from resume | Done — `lib/resume-parse.ts` |
| 1.7 | Interviews list page | Done — `/interviews` |
| 1.8 | Signed booking links | Done — HMAC token, 7-day expiry |
| 1.9 | Toasts + error boundary | Done — `ToastProvider`, `app/error.tsx` |
| 1.10 | Smoke test checklist | Done — in ONBOARDING.md |

**Exit criteria:** New recruiter can sign up → create company → post job → upload PDFs → shortlist → connect Calendar → candidate books Meet — end to end on staging.

---

### Phase 2 — Multi-user & roles ✅ COMPLETED

Goal: safely add admins, recruiters, interviewers to the same company.

| # | Work item | Status |
|---|-----------|--------|
| 2.1 | Invite system | Done — `/settings/team`, `/invite/[token]` |
| 2.2 | Enforce roles in API | Done — `assertRole` + RLS |
| 2.3 | Team settings UI | Done — members, invite, revoke, resend |
| 2.4 | Interviewer assignment | Done — candidate drawer + booking filter |
| 2.5 | RLS + privilege lock | Done — `migration_phase2_hardening.sql` |
| 2.6 | Audit log | Done — `audit_logs` + Team activity list |

**Exit criteria:** Second person joins via invite; roles restrict actions; booking uses assigned interviewers only.

**SQL to run:** see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) (`setup_all.sql` or incremental Phase 2 files).

See also: [ONBOARDING.md](./ONBOARDING.md).

---

### Phase 3 — Recruiting workflow depth (3–4 weeks)

| # | Work item |
|---|-----------|
| 3.1 | Kanban pipeline UI (new → shortlisted → interview → offer/reject) |
| 3.2 | Email notifications (invite, shortlist, interview confirm) via Resend/SendGrid |
| 3.3 | Bulk resume upload + background jobs (queue) |
| 3.4 | Notes & scorecards on candidates |
| 3.5 | Job templates / duplicate job |
| 3.6 | Outlook calendar (schema already allows `outlook`) |
| 3.7 | Reminder emails / calendar updates / cancel-reschedule flows |

---

### Phase 4 — Chatbot assistant (3–5 weeks) — FUTURE INTEGRATION

Goal: in-app AI assistant for recruiters (and optionally candidates).

#### 4.1 Product design

| Mode | Audience | Examples |
|------|----------|----------|
| Recruiter copilot | Logged-in users | “Who are top 5 for this job?”, “Summarize this candidate”, “Draft rejection email”, “What’s free this week?” |
| Candidate FAQ bot | Public careers/booking | “What should I prepare?”, “How long is the interview?”, company FAQ |
| Ops bot (later) | Admins | Usage, invite help, integration status |

Start with **recruiter copilot only** — highest ROI, already have JD + resume + scores in DB.

#### 4.2 Architecture (recommended)

```
UI Chat Widget (floating on /jobs/[id] + dashboard)
        │
        ▼
POST /api/chat  (auth required, company-scoped)
        │
        ├── Tool/RAG layer (company data only)
        │     • get_job, list_candidates, get_candidate
        │     • get_interviews, get_availability (reuse calendar APIs)
        │     • draft_email (no send until confirmed)
        │
        └── LLM (reuse Anthropic/Gemini stack in lib/ai.ts)
              stream SSE responses
```

**Data rules**
- Never load another company’s data (pass `company_id` from session; filter all tool queries).
- Do not put raw PII into logs; redact in analytics.
- Prefer tool-calling over stuffing full resume text into every prompt; fetch on demand.

#### 4.3 Schema additions

```sql
create table public.chat_threads (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  context_type text check (context_type in ('general', 'job', 'candidate')),
  context_id uuid,
  created_at timestamptz default now() not null
);

create table public.chat_messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid references public.chat_threads(id) on delete cascade not null,
  role text check (role in ('user', 'assistant', 'system', 'tool')) not null,
  content text not null,
  created_at timestamptz default now() not null
);
```

#### 4.4 Implementation steps

1. Extract shared `lib/ai.ts` chat helper (streaming).  
2. Implement tools that wrap existing DB queries (same RLS mindset).  
3. Build `ChatPanel` component; mount on job board first.  
4. Persist threads; show history.  
5. Add “suggested prompts” based on page context.  
6. Optional: embed FAQ bot on `/book/[id]` with **no** access to other candidates.  
7. Rate limit per user/company; budget caps on tokens.  
8. Eval set: 20 canned questions with expected tool use.

#### 4.5 Chatbot exit criteria

- Recruiter asks “rank shortlist for Job X” and gets accurate, company-scoped answer.  
- No cross-tenant leakage in tests.  
- Streaming UX < 2s to first token under normal load.

---

### Phase 5 — Scale & production (ongoing)

See section 2 below. Can start light infra during Phase 2–3.

---

## 2. How to scale HireFlow

### 2.1 Technical scale

| Concern | Current | Next step |
|---------|---------|-----------|
| Hosting | Local `next dev` | Vercel (app) + Supabase (DB/auth/storage) |
| DB | Single project | Connection pooling (Supabase pooler); indexes already on FKs — add `(job_id, match_score desc)`, `(company_id, created_at)` as data grows |
| Resume AI | Sync in request | Move PDF parse + AI rank to **background jobs** (Inngest / Trigger.dev / Supabase Edge + queue) for bulk uploads |
| File storage | Optional bucket | CDN-backed Storage; virus scan on upload |
| Calendar | Per-request Google APIs | Cache freeBusy short TTL; refresh-token rotation; circuit breaker |
| Chatbot | — | Streaming + caching embeddings (optional vector table for JD/FAQ) |
| Multi-region | — | Keep DB primary region near users; edge for static |

### 2.2 Product / org scale (multi-company SaaS)

1. **Billing** — Stripe per seat or per company; gate features by plan.  
2. **Admin console** — platform-level support tools (not company admin).  
3. **Observability** — Sentry + Vercel Analytics + Supabase logs; alert on API 5xx and AI failures.  
4. **Compliance** — retention policy for resumes, GDPR delete endpoint, DPA with vendors.  
5. **Feature flags** — chatbot, Outlook, bulk upload rolled out gradually.

### 2.3 Suggested scale milestones

| Milestone | Target |
|-----------|--------|
| M1 | 1 company, ≤5 users, ≤100 candidates — current architecture OK |
| M2 | 10 companies, bulk uploads — need job queue + rate limits |
| M3 | 100+ companies — billing, monitoring, stricter RLS audits, chatbot cost controls |
| M4 | Enterprise — SSO (SAML), audit exports, custom data residency |

---

## 3. Full implementation backlog (priority ordered)

**P0 — Must before real use / teammates**
1. Env + DB + Storage setup documented and verified  
2. Invites + role enforcement  
3. Route protection middleware  
4. Signed booking links  
5. Interviews dashboard  

**P1 — Competitive recruiting product**
6. Email notifications  
7. Pipeline kanban + notes/scorecards  
8. Bulk upload + async AI  
9. Outlook calendar  

**P2 — Differentiation**
10. Recruiter chatbot (Phase 4)  
11. Candidate FAQ bot  
12. Analytics dashboard (time-to-hire, source quality)  

**P3 — Scale / enterprise**
13. Stripe billing  
14. SSO  
15. Background workers + vector search for resumes  

---

## 4. Suggested sprint plan (first 8 weeks)

| Week | Focus |
|------|--------|
| 1 | Env hardening, middleware auth, Storage, interviews UI, env example |
| 2 | Signed booking links, resume email/name extract, job edit/delete, smoke tests |
| 3–4 | Invites, roles in API/UI, team settings, interviewer assignment |
| 5 | Email notifications + cancel/reschedule interviews |
| 6 | Async ranking queue + bulk upload |
| 7–8 | Chatbot MVP (tools + chat UI on job board) |

---

## 5. Definition of done (per feature)

- TypeScript clean; `npm run lint` passes  
- RLS / auth reviewed for tenant isolation  
- Happy path + one failure path tested manually (later: automated)  
- Env vars documented in `.env.local.example`  
- ONBOARDING / README updated if setup changes  

---

## 6. What you should do this week

1. Create Supabase project → run both SQL files → fill `.env.local`.  
2. Confirm app at `http://localhost:3000` (or 3001 if port busy): signup → company → job → upload PDF.  
3. Add Google OAuth credentials if you need booking demos.  
4. Start Phase 1 items 1.3–1.8 before inviting anyone.  
5. Use [ONBOARDING.md](./ONBOARDING.md) when a second person joins **after** Phase 2 invites ship.
