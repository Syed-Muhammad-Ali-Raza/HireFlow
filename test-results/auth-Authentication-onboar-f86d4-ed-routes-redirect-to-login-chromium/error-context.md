# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication & onboarding >> sign out returns to the landing page and protected routes redirect to login
- Location: e2e\auth.spec.ts:18:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Active Jobs' })
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByRole('heading', { name: 'Active Jobs' })

```

```yaml
- heading "Create Company" [level=2]
- paragraph: Set up your organization to start posting jobs and screening candidates.
- text: Company Name
- textbox "Company Name":
  - /placeholder: Acme Recruiting
- button "Create Organization"
- button "Logout"
- alert
```

# Test source

```ts
  1  | import { expect, Page } from '@playwright/test';
  2  | import * as path from 'path';
  3  | import { fileURLToPath } from 'url';
  4  | 
  5  | const __dirname = path.dirname(fileURLToPath(import.meta.url));
  6  | 
  7  | /**
  8  |  * E2E test helpers for HireFlow.
  9  |  *
  10 |  * All tests use a dedicated, uniquely-generated E2E user so that runs are
  11 |  * isolated and idempotent (no collisions with previously-created accounts or
  12 |  * shared demo data). Data created by the flow is cleaned up after each spec.
  13 |  */
  14 | 
  15 | // Stable, reused E2E user. Provisioned (idempotently) by globalSetup
  16 | // (e2e/setup.ts) so tests never hit Supabase's email signup rate limit.
  17 | // Override via e2e/.env (see e2e/.env.example) if you need different creds.
  18 | export const E2E = {
  19 |   email: process.env.E2E_USER_EMAIL || 'e2e-runner@example.com',
  20 |   password: process.env.E2E_USER_PASSWORD || 'E2e-Super-Secret-123!',
  21 |   name: process.env.E2E_USER_NAME || 'E2E Runner',
  22 |   company: process.env.E2E_COMPANY_NAME || 'E2E Test Company',
  23 | };
  24 | 
  25 | /**
  26 |  * Sign in as the provisioned E2E user (created once by globalSetup).
  27 |  * Expects to be on /login (or navigates there).
  28 |  */
  29 | export async function signUpAndCreateCompany(page: Page) {
  30 |   await page.goto('/login');
  31 |   await page.getByLabel('Email address').fill(E2E.email);
  32 |   await page.getByLabel('Password').fill(E2E.password);
  33 |   await page.getByRole('button', { name: 'Sign In' }).click();
  34 | 
  35 |   // After signing in we land on the dashboard (Active Jobs).
> 36 |   await expect(page.getByRole('heading', { name: 'Active Jobs' })).toBeVisible({
     |                                                                    ^ Error: expect(locator).toBeVisible() failed
  37 |     timeout: 20_000,
  38 |   });
  39 | }
  40 | 
  41 | /**
  42 |  * Sign in with an existing account via the login form.
  43 |  * Expects to be on /login (or navigates there).
  44 |  */
  45 | export async function signIn(page: Page, email: string, password: string) {
  46 |   await page.goto('/login');
  47 |   await page.getByLabel('Email address').fill(email);
  48 |   await page.getByLabel('Password').fill(password);
  49 |   await page.getByRole('button', { name: 'Sign In' }).click();
  50 |   await expect(page.getByRole('heading', { name: 'Active Jobs' })).toBeVisible({
  51 |     timeout: 20_000,
  52 |   });
  53 | }
  54 | 
  55 | /**
  56 |  * Create a job posting through the UI. Returns the created job title.
  57 |  */
  58 | export async function createJob(page: Page, title: string, skills: string, description: string) {
  59 |   await page.goto('/jobs/new');
  60 |   await page.getByLabel('Job Title').fill(title);
  61 |   await page.getByLabel('Required Skills (Comma separated)').fill(skills);
  62 |   await page.getByLabel('Job Description').fill(description);
  63 |   await page.getByRole('button', { name: 'Publish Job Posting' }).click();
  64 | 
  65 |   // Lands on the job detail board page.
  66 |   await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 15_000 });
  67 |   return title;
  68 | }
  69 | 
  70 | /**
  71 |  * Path to the committed resume fixture PDF (a real, parseable PDF).
  72 |  */
  73 | export function resumeFixturePath(): string {
  74 |   return path.join(__dirname, 'fixtures', 'resume-e2e.pdf');
  75 | }
  76 | 
  77 | /**
  78 |  * Upload one or more resume PDFs on the job board page.
  79 |  * Assumes we are already on a job detail page with the candidate panel.
  80 |  */
  81 | export async function uploadResumes(page: Page, files: string[]) {
  82 |   const input = page.locator('input[type="file"]');
  83 |   await input.setInputFiles(files);
  84 | }
  85 | 
  86 | /**
  87 |  * Wait until all background AI ranking tasks for the given candidate names have
  88 |  * finished (no longer queued/processing). Scores may not be present if an AI
  89 |  * provider isn't configured, so we only wait for the spinner to clear.
  90 |  */
  91 | export async function waitForRanking(page: Page, candidateName: string, timeout = 60_000) {
  92 |   const candidateCard = page.locator('h4', { hasText: candidateName }).first();
  93 |   await candidateCard.waitFor({ state: 'attached', timeout });
  94 | }
  95 | 
```