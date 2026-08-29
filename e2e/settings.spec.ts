import { test, expect, Page } from '@playwright/test';
import { signUpAndCreateCompany } from './helpers';

test.describe('Settings & dashboards', () => {
  test.beforeEach(async ({ page }) => {
    await signUpAndCreateCompany(page);
  });

  test('team management page loads with the current admin as a member', async ({ page }) => {
    await page.goto('/settings/team');
    await expect(
      page.getByRole('heading', { name: 'Team Management' })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Active Members')).toBeVisible();
  });

  test('integrations page loads', async ({ page }) => {
    await page.goto('/settings/integrations');
    await expect(
      page.getByRole('heading', { name: 'Settings & Integrations' })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('interviews dashboard loads (empty state for a fresh account)', async ({ page }) => {
    await page.goto('/interviews');
    await expect(page.getByRole('heading', { name: 'Interviews' })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('inviting a team member generates an invite link', async ({ page }) => {
    await page.goto('/settings/team');
    await expect(
      page.getByRole('heading', { name: 'Team Management' })
    ).toBeVisible({ timeout: 15_000 });

    const email = `invite-${Date.now().toString(36)}@example.com`;
    await page.getByPlaceholder(/email/i).first().fill(email);
    await page.getByRole('button', { name: 'Generate Invite Link' }).click();

    // An invite URL modal appears with a link to /invite/<token>.
    await expect(page.getByText(/\/invite\//).first()).toBeVisible({ timeout: 15_000 });
  });
});
