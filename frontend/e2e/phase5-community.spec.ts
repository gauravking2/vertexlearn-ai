import { test, expect, Page } from '@playwright/test';

// Phase 5 community flows (mocked API, no live backend):
// - student: login → course → discussions → notification
// - instructor: login → course → announcement

const COURSE_ID = '00000000-0000-4000-8000-000000000031';
const THREAD_ID = '00000000-0000-4000-8000-000000000032';

async function mockBase(page: Page, user: { id: string; email: string; name: string; roles: string[] }) {
  await page.route('**/api/v1/auth/login', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'mock-access', refreshToken: 'mock-refresh', user }),
    })
  );
  await page.route('**/api/v1/auth/me', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
  );
  await page.route(`**/api/v1/courses/${COURSE_ID}`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: COURSE_ID,
        title: 'Community Course',
        description: 'Discuss and announce',
        status: 'published',
        instructor_id: 't1',
        modules: [],
      }),
    })
  );
  await page.route('**/api/v1/enrollments/me', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ id: 'e1', course_id: COURSE_ID, courseId: COURSE_ID, progressPercent: 5 }] }),
    })
  );
  // The post-login landing page (student dashboard) fetches these; mock them
  // so the suite stays hermetic (a stray live 401 would trigger logout).
  await page.route('**/api/v1/gamification/me', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ badges: [], streak: null }) })
  );
  await page.route('**/api/v1/certificates/me', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
  await page.route('**/api/v1/recommendations/me', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
  // The enrolled course detail page renders the mastery card.
  await page.route('**/api/v1/ai/mastery/*', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ level: 'beginner', avgScoreRatio: 0, attempts: 0 }),
    })
  );
}

async function loginViaUi(page: Page, email: string) {
  await page.goto('/login');
  await page.getByPlaceholder('your@email.com').fill(email);
  await page.getByPlaceholder('••••••••').fill('Password123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your Learning Journey', exact: true })).toBeVisible();
}

test.describe('student discussion + notification flow (mocked API)', () => {
  test('login → course → discussions → notification', async ({ page }) => {
    await mockBase(page, { id: 's1', email: 'stud@example.com', name: 'Stud', roles: ['student'] });
    await page.route(`**/api/v1/courses/${COURSE_ID}/discussions/threads`, async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: THREAD_ID, title: 'Q' }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: THREAD_ID, title: 'Deadline question', author_name: 'Stud', post_count: 1 }] }),
      });
    });
    await page.route(`**/api/v1/discussions/threads/${THREAD_ID}`, async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          thread: { id: THREAD_ID, title: 'Deadline question' },
          posts: [{ id: 'p1', thread_id: THREAD_ID, author_name: 'Stud', body: 'When is it due?' }],
        }),
      })
    );
    await page.route(`**/api/v1/discussions/threads/${THREAD_ID}/posts`, async (route) =>
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'p2', body: 'Friday' }) })
    );
    await page.route('**/api/v1/notifications/me*', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'n1', type: 'announcement', title: 'New announcement', is_read: false, created_at: new Date().toISOString() }] }),
      })
    );
    await page.route('**/api/v1/notifications/unread-count', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unread: 1 }) })
    );
    await page.route(`**/api/v1/courses/${COURSE_ID}/announcements`, async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
    );

    await loginViaUi(page, 'stud@example.com');
    await page.goto(`/courses/${COURSE_ID}/discussions`);
    await expect(page.getByText('Deadline question')).toBeVisible();

    await page.goto(`/courses/${COURSE_ID}/discussions/${THREAD_ID}`);
    await expect(page.getByText('When is it due?')).toBeVisible();

    await page.goto('/notifications');
    await expect(page.getByText('New announcement')).toBeVisible();
  });
});

test.describe('instructor announcement flow (mocked API)', () => {
  test('login → course → announcement', async ({ page }) => {
    await mockBase(page, { id: 't1', email: 'teach@example.com', name: 'Teach', roles: ['instructor'] });
    await page.route(`**/api/v1/courses/${COURSE_ID}/announcements`, async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'a1', title: 'Welcome', body: 'Read the syllabus' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'a1', course_id: COURSE_ID, author_name: 'Teach', title: 'Welcome', body: 'Read the syllabus', created_at: new Date().toISOString() }],
        }),
      });
    });

    await loginViaUi(page, 'teach@example.com');
    await page.goto(`/courses/${COURSE_ID}`);
    await expect(page.getByText('Welcome')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish announcement' })).toBeVisible();
  });
});
