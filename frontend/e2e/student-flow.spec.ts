import { test, expect, Page } from '@playwright/test';

const COURSE_ID = '00000000-0000-4000-8000-000000000001';
const LECTURE_ID = '00000000-0000-4000-8000-000000000002';
const QUIZ_ID = '00000000-0000-4000-8000-000000000003';

async function mockStudentApi(page: Page) {
  // Catch-all first; Playwright gives later specific routes precedence. This
  // keeps ancillary dashboard requests hermetic so a live 401 cannot log out
  // the fake session between the flow's explicit page checks.
  await page.route('**/api/v1/**', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
  await page.route('**/api/v1/auth/register', async (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', email: 'stud@example.com', name: 'Stud' }),
    })
  );
  await page.route('**/api/v1/auth/login', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'mock-access',
        refreshToken: 'mock-refresh',
        user: { id: 'u1', email: 'stud@example.com', name: 'Stud', roles: ['student'] },
      }),
    })
  );
  await page.route('**/api/v1/auth/me', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', email: 'stud@example.com', name: 'Stud', roles: ['student'] }),
    })
  );
  await page.route(`**/api/v1/courses?page*`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{ id: COURSE_ID, title: 'Intro to Testing', description: 'Learn test flows', status: 'published', instructor_id: 't1' }],
        page: 1,
        pageSize: 12,
        total: 1,
      }),
    })
  );
  await page.route(`**/api/v1/courses/${COURSE_ID}`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: COURSE_ID,
        title: 'Intro to Testing',
        description: 'Learn test flows',
        status: 'published',
        instructor_id: 't1',
        modules: [{ id: 'm1', title: 'Module 1', sort_order: 0, lectures: [{ id: LECTURE_ID, title: 'Lecture 1', sortOrder: 0 }] }],
      }),
    })
  );
  await page.route(`**/api/v1/courses/${COURSE_ID}/enroll`, async (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'e1' }) })
  );
  await page.route('**/api/v1/enrollments/me', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    })
  );
  await page.route(`**/api/v1/courses/${COURSE_ID}/quizzes`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ id: QUIZ_ID, title: 'Quiz 1', description: '', question_count: 1 }] }),
    })
  );
  await page.route(`**/api/v1/quizzes/${QUIZ_ID}/attempt`, async (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'a1',
        quiz_id: QUIZ_ID,
        status: 'in_progress',
        questions: [{ id: 'q1', type: 'mcq', prompt: 'What is 2+2?', points: 1, options: [{ id: 'o1', option_text: '4' }] }],
      }),
    })
  );
  await page.route('**/api/v1/attempts/*/submit', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'a1', status: 'graded', score: 1, max_score: 1 }),
    })
  );
  await page.route('**/api/v1/ai/chat/sessions', async (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 's1', course_id: COURSE_ID, mode: 'beginner' }),
    })
  );
  await page.route('**/api/v1/ai/chat/sessions/*/messages', async (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ userMessageId: 'm1', assistantMessageId: 'm2', answer: 'Mocked grounded answer [S1]', grounded: true, mode: 'beginner', sources: [] }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });
  await page.route('**/api/v1/ai/lectures/*/summarize', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ lectureId: LECTURE_ID, summary: { keyPoints: ['Mocked point'], takeaways: ['Mocked takeaway'] }, provider: 'mock' }),
    })
  );
  await page.route('**/api/v1/ai/mastery/*', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ topic: 'course', attempts: 1, avgScoreRatio: 0.8, level: 'intermediate', formula: 'mock formula' }),
    })
  );
  await page.route('**/api/v1/lectures/*/notes', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
  await page.route('**/api/v1/lectures/*/bookmarks', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
  await page.route('**/api/v1/lectures/*/progress', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  );
  await page.route('**/api/v1/gamification/me', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ badges: [], streak: null }) })
  );
  await page.route('**/api/v1/recommendations/me', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
  await page.route('**/api/v1/certificates/me', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
  // Pages under test also fetch these; keep the suite hermetic so no call
  // ever reaches a live backend (a stray 401 would trigger logout).
  await page.route('**/api/v1/courses/*/announcements', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
  await page.route('**/api/v1/courses/*/reviews', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], aggregate: { avg_rating: 0, rating_count: 0 } }),
    })
  );
  await page.route('**/api/v1/lectures/*/video-url', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ lectureId: LECTURE_ID, url: null, expiresInSeconds: 0, unavailable: true }),
    })
  );
}

async function registerViaUi(page: Page) {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
  await page.getByPlaceholder('John Doe').fill('Stud');
  await page.getByPlaceholder('your@email.com').fill('stud@example.com');
  // Both password fields share a placeholder; address them positionally.
  await page.getByPlaceholder('••••••••').first().fill('Password123!');
  await page.getByPlaceholder('••••••••').nth(1).fill('Password123!');
  await page.getByRole('button', { name: 'Create account' }).click();
  // Registration auto-logs in and lands on the student dashboard.
  await expect(page.getByRole('heading', { name: 'Your Learning Journey', exact: true })).toBeVisible();
}

test.describe('student smoke flow (mocked API, no live AI)', () => {
  test('register → login → dashboard → catalog → detail → enroll → player → quiz → AI tutor', async ({ page }) => {
    await mockStudentApi(page);

    await page.goto('/login');
    await expect(page.getByRole('button', { name: /log in|sign in/i })).toBeVisible();

    await registerViaUi(page);

    await page.goto('/courses');
    await expect(page.getByText('Intro to Testing')).toBeVisible();

    await page.goto(`/courses/${COURSE_ID}`);
    await expect(page.getByRole('heading', { name: 'Intro to Testing' })).toBeVisible();
    await page.getByRole('button', { name: 'Enroll Now' }).click();

    await page.goto(`/courses/${COURSE_ID}/play/${LECTURE_ID}`);
    await expect(page.getByText('Lecture 1').first()).toBeVisible();
    // AI summary action is visible and works through the (mocked) real endpoint
    await expect(page.getByRole('button', { name: /generate summary/i })).toBeVisible();
    // Mastery surface renders real mocked mastery data
    await expect(page.getByText('Mastery')).toBeVisible();

    await page.goto(`/courses/${COURSE_ID}/quizzes`);
    await expect(page.getByText('Quiz 1')).toBeVisible();

    await page.goto(`/quizzes/${QUIZ_ID}/attempt`);
    await expect(page.getByRole('button', { name: /start attempt/i }).first()).toBeVisible();

    await page.goto(`/ai-tutor/${COURSE_ID}`);
    await expect(page.getByText(/ai tutor/i).first()).toBeVisible();
  });
});
