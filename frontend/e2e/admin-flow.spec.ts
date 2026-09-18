import { test, expect, Page } from '@playwright/test';

// Phase 5 admin flow (mocked API, no live backend):
// login → admin dashboard → pending course queue → approve.

const COURSE_ID = '00000000-0000-4000-8000-000000000021';

async function mockAdminApi(page: Page) {
  await page.route('**/api/v1/auth/login', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'mock-access',
        refreshToken: 'mock-refresh',
        user: { id: 'a1', email: 'admin@example.com', name: 'Admin', roles: ['admin'] },
      }),
    })
  );
  await page.route('**/api/v1/auth/me', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'a1', email: 'admin@example.com', name: 'Admin', roles: ['admin'] }),
    })
  );
  await page.route('**/api/v1/admin/analytics/overview', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        users: { total: 10, byRole: [{ role: 'student', count: 8 }] },
        enrollments: { total: 5, last7Days: 2, completions: 1, completionRate: 0.2 },
        courses: { byStatus: [{ status: 'pending', count: 1 }] },
        certificates: { total: 1 },
        dau: { last24hActiveUsers: 4 },
        revenue: { total: 0, unavailable: true, reason: 'No payment data exists; revenue cannot be calculated.' },
      }),
    })
  );
  await page.route('**/api/v1/admin/courses/pending*', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: COURSE_ID,
            title: 'Pending Review Course',
            description: 'Awaiting approval',
            status: 'pending',
            instructor_email: 'teach@example.com',
            instructor_name: 'Teach',
          },
        ],
        page: 1,
        pageSize: 50,
        total: 1,
      }),
    })
  );
  await page.route(`**/api/v1/admin/courses/${COURSE_ID}/decision`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: COURSE_ID, title: 'Pending Review Course', status: 'published' }),
    })
  );
  await page.route('**/api/v1/admin/moderation/flagged-posts', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
  await page.route('**/api/v1/admin/users*', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{ id: 'u1', email: 'stud@example.com', name: 'Stud', roles: ['student'], is_suspended: false }],
        page: 1,
        pageSize: 50,
        total: 1,
      }),
    })
  );
  // The post-login landing page (student dashboard) fetches these; mock them
  // so the suite stays hermetic (a stray live 401 would trigger logout).
  await page.route('**/api/v1/enrollments/me', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
  await page.route('**/api/v1/gamification/me', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ badges: [], streak: null }) })
  );
  await page.route('**/api/v1/certificates/me', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
  await page.route('**/api/v1/recommendations/me', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
}

test.describe('admin approval flow (mocked API)', () => {
  test('login → admin dashboard → pending course → approve', async ({ page }) => {
    await mockAdminApi(page);

    await page.goto('/login');
    await page.getByPlaceholder('your@email.com').fill('admin@example.com');
    await page.getByPlaceholder('••••••••').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Your Learning Journey', exact: true })).toBeVisible();

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /Admin/ }).first()).toBeVisible();

    await page.goto('/admin/courses/pending');
    await expect(page.getByText('Pending Review Course')).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/Decision recorded/)).toBeVisible();
  });
});
