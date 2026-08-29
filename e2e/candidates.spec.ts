import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { signUpAndCreateCompany, createJob } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A distinct resume file name so the candidate can be located by name.
// The app infers the candidate name from the filename stem.
const RESUME_NAME = `e2e-resume-${Date.now().toString(36)}.pdf`;
const RESUME_STEM = RESUME_NAME.replace('.pdf', '');
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'resume-e2e.pdf');

async function setupJobBoard(page: Page) {
  await signUpAndCreateCompany(page);
  await createJob(
    page,
    `Backend Engineer ${Date.now().toString(36)}`,
    'TypeScript, Node.js, PostgreSQL',
    'Build backend services with TypeScript, Node.js and PostgreSQL.'
  );
}

async function uploadResume(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: RESUME_NAME,
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(FIXTURE_PATH),
  });
}

async function getCandidateRow(page: Page) {
  const name = page.locator('h4', { hasText: RESUME_STEM }).first();
  await name.waitFor({ state: 'visible', timeout: 25_000 });
  return name.locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
}

test.describe('Candidate screening', () => {
  test.beforeEach(async ({ page }) => {
    await setupJobBoard(page);
  });

  test('uploading a resume creates a candidate in the list', async ({ page }) => {
    await uploadResume(page);

    const row = await getCandidateRow(page);
    await expect(row).toBeVisible();
    // Candidate email/name text is shown; status starts as "new".
    await expect(row.getByText('new', { exact: false }).first()).toBeVisible();
  });

  test('a candidate can be shortlisted from the quick actions', async ({ page }) => {
    await uploadResume(page);
    const row = await getCandidateRow(page);

    await row.locator('button[title="Shortlist Candidate"]').click();

    await expect(row.getByText('shortlisted', { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('a candidate can be moved to interviewing', async ({ page }) => {
    await uploadResume(page);
    const row = await getCandidateRow(page);

    await row.locator('button[title="Set to Interviewing"]').click();

    await expect(row.getByText('Interviewing', { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('manual score override saves via the modal', async ({ page }) => {
    await uploadResume(page);
    const row = await getCandidateRow(page);

    // Open the override modal from the row quick actions.
    await row.locator('button[title="Manual Score Override"]').click();

    await expect(page.getByRole('heading', { name: 'Manual Score Override' })).toBeVisible();
    await page.getByLabel('Manual Match Score (0 - 100)').fill('88');
    await page
      .getByLabel('Recruiter Evaluation & Reason')
      .fill('Override for E2E test');
    await page.getByRole('button', { name: 'Save Override' }).click();

    // The modal closes after a successful save.
    await expect(page.getByRole('heading', { name: 'Manual Score Override' })).toBeHidden({
      timeout: 15_000,
    });
  });

  test('search filters the candidate list', async ({ page }) => {
    await uploadResume(page);
    await getCandidateRow(page);

    const search = page.getByPlaceholder('Search candidates by name...');
    await search.fill('zzz-no-match-here');
    await expect(page.locator('h4', { hasText: RESUME_STEM })).toBeHidden();

    await search.fill(RESUME_STEM);
    await expect(page.locator('h4', { hasText: RESUME_STEM })).toBeVisible({ timeout: 10_000 });
  });
});
