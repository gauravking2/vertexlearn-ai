import { test, expect, Page } from '@playwright/test';

const COURSE_ID = '00000000-0000-4000-8000-000000000011';
const MODULE_ID = '00000000-0000-4000-8000-000000000012';
const LECTURE_ID = '00000000-0000-4000-8000-000000000013';

async function mockInstructorApi(page: Page) {
  await page.route('**/api/v1/auth/login', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'mock-access',
        refreshToken: 'mock-refresh',
        user: { id: 't1', email: 'teach@example.com', name: 'Teach', roles: ['instructor'] },
      }),
    })
  );
  await page.route('**/api/v1/auth/me', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 't1', email: 'teach@example.com', name: 'Teach', roles: ['instructor'] }),
    })
  );
  await page.route('**/api/v1/courses', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: COURSE_ID, title: 'Teach Course', description: 'desc', status: 'pending', instructor_id: 't1' }],
          page: 1,
          pageSize: 20,
          total: 1,
        }),
      });
    }
    if (method === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: COURSE_ID, title: 'Teach Course', status: 'pending', instructor_id: 't1' }),
      });
    }
    return route.continue();
  });
  await page.route(`**/api/v1/courses/${COURSE_ID}`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: COURSE_ID,
        title: 'Teach Course',
        description: 'desc',
        status: 'pending',
        instructor_id: 't1',
        modules: [{ id: MODULE_ID, title: 'Module 1', sort_order: 0, lectures: [{ id: LECTURE_ID, title: 'Lecture 1', sortOrder: 0 }] }],
      }),
    })
  );
  await page.route(`**/api/v1/courses/${COURSE_ID}/modules`, async (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: MODULE_ID, course_id: COURSE_ID, title: 'Module 1', sort_order: 0 }),
    })
  );
  await page.route(`**/api/v1/courses/modules/${MODULE_ID}/lectures`, async (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: LECTURE_ID, module_id: MODULE_ID, title: 'Lecture 1', sort_order: 0 }),
    })
  );
  await page.route(`**/api/v1/courses/${COURSE_ID}/quizzes`, async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
  await page.route('**/api/v1/quizzes', async (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'q9', courseId: COURSE_ID, title: 'Quiz', questions: [] }),
    })
  );
  await page.route('**/api/v1/ai/quiz-drafts', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
  await page.route('**/api/v1/ai/lectures/*/generate-quiz', async (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'd1', status: 'pending_review', payload: { questions: [] } }),
    })
  );
  await page.route(`**/api/v1/courses/${COURSE_ID}/analytics`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ perLecture: [], quizzes: [], timeOnTask: { total_watched_seconds: 0, active_students: 0 } }),
    })
  );
  await page.route(`**/api/v1/courses/${COURSE_ID}/assignments`, async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
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

async function loginAsInstructor(page: Page) {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /log in|sign in/i })).toBeVisible();
  await page.getByPlaceholder('your@email.com').fill('teach@example.com');
  await page.getByPlaceholder('••••••••').fill('Password123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Successful login lands on the dashboard.
  await expect(page.getByRole('heading', { name: 'Your Learning Journey', exact: true })).toBeVisible();
}

test.describe('instructor smoke flow (mocked API, no live AI)', () => {
  test('login → dashboard → courses → curriculum → quizzes/AI quiz → drafts → analytics', async ({ page }) => {
    await mockInstructorApi(page);

    await loginAsInstructor(page);

    await page.goto('/instructor');
    await expect(page.getByRole('heading', { name: /instructor/i }).first()).toBeVisible();

    await page.goto('/instructor/courses');
    await expect(page.getByText('Teach Course')).toBeVisible();

    // Curriculum builder (module + lecture creation UI)
    await page.goto(`/instructor/courses/${COURSE_ID}/edit`);
    await expect(page.getByRole('heading', { name: /edit course/i })).toBeVisible();
    await expect(page.getByText('Curriculum')).toBeVisible();

    // Quiz management with AI generate trigger + existing list
    await page.goto(`/instructor/courses/${COURSE_ID}/quizzes`);
    await expect(page.getByRole('button', { name: /generate/i }).first()).toBeVisible();
    await expect(page.getByText('Existing quizzes')).toBeVisible();

    // AI draft review stays secure (pending drafts listed for instructor only)
    await page.goto('/instructor/quiz-drafts');
    await expect(page.getByRole('heading', { name: 'AI Quiz Review', exact: true })).toBeVisible();

    // Analytics + assignments surfaces exist
    await page.goto(`/instructor/courses/${COURSE_ID}/analytics`);
    await expect(page.getByRole('heading', { name: 'Course Analytics', exact: true })).toBeVisible();

    await page.goto(`/instructor/courses/${COURSE_ID}/assignments`);
    await expect(page.getByRole('heading', { name: /assignments/i }).first()).toBeVisible();
  });
});
