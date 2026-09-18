import { test, expect, Page } from '@playwright/test';

// LIVE QA — admin (real backend, no mocks). Run AFTER live-instructor.
// Admin credentials come from E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD env
// (injected locally by the launcher; never committed).
test.describe.configure({ mode: 'serial' });

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || '';
const ADMIN_PW = process.env.E2E_ADMIN_PASSWORD || '';
const S = `livetmp${Date.now().toString(36)}`;
const TEMP_EMAIL = `${S}@example.com`;
const TEMP_PW = 'LiveQa12345!';

async function adminLogin(page: Page) {
  if (!ADMIN_EMAIL || !ADMIN_PW) test.skip(true, 'E2E admin credentials not provided (BLOCKED)');
  await page.goto('/login');
  await page.getByPlaceholder('your@email.com').fill(ADMIN_EMAIL);
  await page.getByPlaceholder('••••••••').fill(ADMIN_PW);
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  await expect(page.getByRole('button', { name: /toggle sidebar/i })).toBeVisible({ timeout: 20000 });
}

async function apiRegisterTemp() {
  const res = await fetch('http://localhost:4000/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: TEMP_EMAIL, password: TEMP_PW, name: 'Live Temp', role: 'student' }),
  });
  if (!res.ok && res.status !== 409) throw new Error('temp register failed ' + res.status);
}

async function apiLogin(email: string, pw: string) {
  const res = await fetch('http://localhost:4000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('admin: dashboard nav + users search + role assign/revoke', async ({ page }) => {
  await adminLogin(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /Admin/ }).first()).toBeVisible();
  for (const label of ['Dashboard', 'Users & Roles', 'Approvals', 'Moderation', 'Analytics', 'Revenue']) {
    await expect(page.getByRole('link', { name: label }).first()).toBeVisible();
  }
  await apiRegisterTemp();
  await page.goto('/admin/users');
  await page.getByPlaceholder('Search by email or name').fill(TEMP_EMAIL);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText(TEMP_EMAIL)).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Make instructor' }).first().click();
  await expect(page.getByText('Role updated.')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Remove instructor' }).first().click();
  await expect(page.getByText('Role updated.')).toBeVisible({ timeout: 15000 });
});

test('admin: suspend blocks login, restore re-enables', async ({ page }) => {
  await adminLogin(page);
  await page.goto('/admin/users');
  await page.getByPlaceholder('Search by email or name').fill(TEMP_EMAIL);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText(TEMP_EMAIL)).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Suspend' }).first().click();
  await expect(page.getByText('Suspension status updated.')).toBeVisible({ timeout: 15000 });
  const blocked = await apiLogin(TEMP_EMAIL, TEMP_PW);
  expect(blocked.status).toBe(403);
  await page.getByRole('button', { name: 'Restore' }).first().click();
  await expect(page.getByText('Suspension status updated.')).toBeVisible({ timeout: 15000 });
  const ok = await apiLogin(TEMP_EMAIL, TEMP_PW);
  expect(ok.status).toBe(200);
});

test('admin: approve pending course, appears in catalog', async ({ page }) => {
  await adminLogin(page);
  await page.goto('/admin/courses/pending');
  const pendingTitles = await page.locator('h3').allTextContents();
  expect(pendingTitles.length).toBeGreaterThan(0);
  const title = pendingTitles[0];
  await page.getByRole('button', { name: 'Approve' }).first().click();
  await expect(page.getByText('Decision recorded')).toBeVisible({ timeout: 20000 });
  await page.goto('/courses');
  await page.getByPlaceholder('Search courses...').fill(title.slice(0, 20));
  await expect(page.getByText(title)).toBeVisible({ timeout: 20000 });
});

test('admin: moderation hide flow + revenue record', async ({ page }) => {
  await adminLogin(page);
  // hide a flagged post (instructor flow flagged one; older open flags count too)
  await page.goto('/admin/moderation');
  const hideButtons = page.getByRole('button', { name: 'Hide' });
  await expect(hideButtons.first()).toBeVisible({ timeout: 20000 });
  const before = await hideButtons.count();
  await hideButtons.first().click();
  await expect
    .poll(async () => page.getByRole('button', { name: 'Hide' }).count(), { timeout: 20000 })
    .toBeLessThan(before);
  // revenue: record + totals update (real records only)
  await page.goto('/admin/revenue');
  await expect(page.getByRole('heading', { name: 'Revenue' })).toBeVisible();
  await page.getByLabel('Amount').fill('19.99');
  await page.getByLabel(/Currency/).fill('USD');
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText(/Payment records|19\.99/).first()).toBeVisible({ timeout: 20000 });
  // analytics overview loads with real aggregates
  await page.goto('/admin/analytics');
  await expect(page.getByRole('heading', { name: /Analytics/ })).toBeVisible({ timeout: 20000 });
});
