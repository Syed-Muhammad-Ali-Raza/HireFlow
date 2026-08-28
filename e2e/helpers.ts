import { expect, Page } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E test helpers for HireFlow.
 *
 * Tests authenticate as a single dedicated E2E user that is provisioned
 * idempotently by globalSetup (e2e/setup.ts) with a fresh, empty company each
 * run. This avoids collisions and the Supabase email signup rate limit.
 */

// Stable, reused E2E user. Provisioned (idempotently) by globalSetup
// (e2e/setup.ts) so tests never hit Supabase's email signup rate limit.
// Override via e2e/.env (see e2e/.env.example) if you need different creds.
export const E2E = {
  email: process.env.E2E_USER_EMAIL || 'e2e-runner@example.com',
  password: process.env.E2E_USER_PASSWORD || 'E2e-Super-Secret-123!',
  name: process.env.E2E_USER_NAME || 'E2E Runner',
  company: process.env.E2E_COMPANY_NAME || 'E2E Test Company',
};

/**
 * Sign in as the provisioned E2E user (created once by globalSetup).
 * Expects to be on /login (or navigates there).
 */
export async function signUpAndCreateCompany(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(E2E.email);
  await page.getByLabel('Password').fill(E2E.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // After signing in we land on the dashboard (Active Jobs).
  await expect(page.getByRole('heading', { name: 'Active Jobs' })).toBeVisible({
    timeout: 20_000,
  });
}

/**
 * Sign in with an existing account via the login form.
 * Expects to be on /login (or navigates there).
 */
export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'Active Jobs' })).toBeVisible({
    timeout: 20_000,
  });
}

/**
 * Create a job posting through the UI. Returns the created job title.
 */
export async function createJob(page: Page, title: string, skills: string, description: string) {
  await page.goto('/jobs/new');
  await page.getByLabel('Job Title').fill(title);
  await page.getByLabel('Required Skills (Comma separated)').fill(skills);
  await page.getByLabel('Job Description').fill(description);
  await page.getByRole('button', { name: 'Publish Job Posting' }).click();

  // Lands on the job detail board page.
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 15_000 });
  return title;
}

/**
 * Path to the committed resume fixture PDF (a real, parseable PDF).
 */
export function resumeFixturePath(): string {
  return path.join(__dirname, 'fixtures', 'resume-e2e.pdf');
}

/**
 * Upload one or more resume PDFs on the job board page.
 * Assumes we are already on a job detail page with the candidate panel.
 */
export async function uploadResumes(page: Page, files: string[]) {
  const input = page.locator('input[type="file"]');
  await input.setInputFiles(files);
}

/**
 * Wait until all background AI ranking tasks for the given candidate names have
 * finished (no longer queued/processing). Scores may not be present if an AI
 * provider isn't configured, so we only wait for the spinner to clear.
 */
export async function waitForRanking(page: Page, candidateName: string, timeout = 60_000) {
  const candidateCard = page.locator('h4', { hasText: candidateName }).first();
  await candidateCard.waitFor({ state: 'attached', timeout });
}
