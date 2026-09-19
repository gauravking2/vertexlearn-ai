import { test, expect } from '@playwright/test';

// Phase 7 basic responsive checks (mobile viewport, no horizontal overflow,
// key surfaces reachable). API is mocked like the other specs.
// NOTE: uses a mobile viewport on the installed desktop browser (Edge
// fallback) rather than the WebKit iPhone preset, so CI works without
// downloading extra browsers.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('mobile: login renders without horizontal overflow', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /vertexlearn ai/i }).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('mobile: dashboard shell (sidebar toggle + skip link) is operable', async ({ page }) => {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'mock-access',
        refreshToken: 'mock-refresh',
        user: { id: 'u1', email: 'stud@example.com', name: 'Stu', roles: ['student'] },
      }),
    }),
  );
  await page.route('**/api/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.goto('/login');
  await page.getByPlaceholder('your@email.com').fill('stud@example.com');
  await page.getByPlaceholder('••••••••').fill('Password123!');
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  await expect(page.getByRole('button', { name: /toggle sidebar/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /skip to main content/i })).toBeAttached();
});
