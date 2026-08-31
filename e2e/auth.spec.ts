import { test, expect } from '@playwright/test';
import { E2E, signUpAndCreateCompany, signIn } from './helpers';

test.describe('Authentication & onboarding', () => {
  test('visitor sees the public landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Screen & Rank Resumes/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Get Started for Free' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible();
  });

  test('signing in lands on the dashboard with the company badge', async ({ page }) => {
    await signIn(page, E2E.email, E2E.password);
    await expect(page.getByText(E2E.company)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Active Jobs' })).toBeVisible();
  });

  test('sign out returns to the landing page and protected routes redirect to login', async ({
    page,
  }) => {
    await signUpAndCreateCompany(page);

    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page.getByRole('heading', { name: /Screen & Rank Resumes/i })).toBeVisible();

    await page.goto('/jobs/new');
    await expect(
      page.getByRole('heading', { name: /Create your hiring portal|Welcome back/i })
    ).toBeVisible();
  });

  test('signing out then back in restores the session', async ({ page }) => {
    await signUpAndCreateCompany(page);
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page.getByRole('heading', { name: /Screen & Rank Resumes/i })).toBeVisible();

    await signIn(page, E2E.email, E2E.password);
    await expect(page.getByText(E2E.company)).toBeVisible();
  });

  test('wrong credentials show an error and stay on the login page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(E2E.email);
    await page.getByLabel('Password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText(/Invalid login credentials|error/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
