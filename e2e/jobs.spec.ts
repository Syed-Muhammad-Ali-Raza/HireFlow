import { test, expect } from '@playwright/test';
import { signUpAndCreateCompany, createJob } from './helpers';
import { resetCompanyJobs } from './db';

test.describe('Jobs', () => {
  test.beforeEach(async ({ page }) => {
    await resetCompanyJobs();
    await signUpAndCreateCompany(page);
  });

  test('a new company shows the empty state on the dashboard', async ({ page }) => {
    await expect(page.getByText('No jobs posted yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create First Job' })).toBeVisible();
  });

  test('create a job posting and see it on the dashboard list', async ({ page }) => {
    const title = `Software Engineer ${Date.now().toString(36)}`;
    await createJob(page, title, 'TypeScript, React, Node.js', 'Build amazing products with TypeScript.');

    // We are on the board page - verify the job title header.
    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    // Go back to the dashboard and confirm the job is listed.
    await page.getByRole('link', { name: 'Back to Dashboard' }).first().click();
    await expect(page.getByRole('heading', { name: 'Active Jobs' })).toBeVisible();
    await expect(page.getByText(title)).toBeVisible();
  });

  test('job creation requires title and description', async ({ page }) => {
    await page.goto('/jobs/new');
    const title = page.getByLabel('Job Title');
    const description = page.getByLabel('Job Description');

    // Both are required — submission is blocked natively.
    await title.focus();
    await expect(title).toHaveAttribute('required', '');
    await description.focus();
    await expect(description).toHaveAttribute('required', '');
  });

  test('empty state disappears after the first job is published', async ({ page }) => {
    await expect(page.getByText('No jobs posted yet')).toBeVisible();
    await createJob(page, `First Job ${Date.now().toString(36)}`, 'Node.js', 'First job description.');
    await page.getByRole('link', { name: 'Back to Dashboard' }).first().click();
    await expect(page.getByText('No jobs posted yet')).toBeHidden();
  });
});
