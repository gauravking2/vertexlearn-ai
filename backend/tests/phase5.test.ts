import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/db/pool';
import { useTestDb } from './helpers';

let app: ReturnType<typeof createApp>;

async function register(email: string, role: 'student' | 'instructor' = 'student'): Promise<{ token: string; userId: string }> {
  await request(app).post('/api/v1/auth/register').send({ email, password: 'Password123!', name: email, role });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password123!' });
  return { token: login.body.accessToken as string, userId: login.body.user?.id as string };
}

async function makeAdmin(email: string): Promise<{ token: string; userId: string }> {
  const base = await register(email, 'instructor');
  const roleRow = await db.query(`SELECT id FROM roles WHERE name = 'admin'`);
  await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    base.userId,
    (roleRow.rows[0] as { id: string }).id,
  ]);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password123!' });
  return { token: login.body.accessToken as string, userId: base.userId };
}

async function makePublishedCourse(instructorToken: string, title: string): Promise<string> {
  const course = await request(app)
    .post('/api/v1/courses')
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ title, description: 'desc' });
  const id = course.body.id as string;
  await db.query(`UPDATE courses SET status = 'published' WHERE id = $1`, [id]);
  return id;
}

async function enroll(studentToken: string, courseId: string): Promise<void> {
  await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${studentToken}`).send();
}

let admin: { token: string; userId: string };
let instructor: { token: string; userId: string };
let instructorB: { token: string; userId: string };
let studentA: { token: string; userId: string };
let studentB: { token: string; userId: string };

beforeAll(async () => {
  await useTestDb();
  app = createApp();
  admin = await makeAdmin('phase5-admin@example.com');
  instructor = await register('phase5-teach@example.com', 'instructor');
  instructorB = await register('phase5-teach-b@example.com', 'instructor');
  studentA = await register('phase5-stud-a@example.com', 'student');
  studentB = await register('phase5-stud-b@example.com', 'student');
});

describe('phase5 admin RBAC', () => {
  test('unauthenticated admin access is rejected', async () => {
    const res = await request(app).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
  });

  test('non-admin is blocked from admin routes', async () => {
    for (const path of ['/api/v1/admin/users', '/api/v1/admin/courses/pending', '/api/v1/admin/analytics/overview', '/api/v1/admin/moderation/flagged-posts']) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${studentA.token}`);
      expect(res.status).toBe(403);
    }
  });

  test('admin can list users with search', async () => {
    const res = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(5);
    const search = await request(app)
      .get('/api/v1/admin/users?q=phase5-stud-a')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(search.status).toBe(200);
    expect(search.body.data.length).toBe(1);
    expect(search.body.data[0].email).toBe('phase5-stud-a@example.com');
  });

  test('admin can assign and revoke roles', async () => {
    const assign = await request(app)
      .put(`/api/v1/admin/users/${studentB.userId}/role`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'instructor', action: 'assign' });
    expect(assign.status).toBe(200);
    expect(assign.body.roles).toContain('instructor');
    const revoke = await request(app)
      .put(`/api/v1/admin/users/${studentB.userId}/role`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'instructor', action: 'revoke' });
    expect(revoke.status).toBe(200);
    expect(revoke.body.roles).not.toContain('instructor');
  });

  test('admin cannot revoke their own admin role', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/users/${admin.userId}/role`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'admin', action: 'revoke' });
    expect(res.status).toBe(403);
  });

  test('suspend blocks login; restore re-enables login', async () => {
    const victim = await register('phase5-suspend-me@example.com', 'student');
    const suspend = await request(app)
      .put(`/api/v1/admin/users/${victim.userId}/suspend`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ suspended: true, reason: 'test suspension' });
    expect(suspend.status).toBe(200);
    const blocked = await request(app).post('/api/v1/auth/login').send({ email: 'phase5-suspend-me@example.com', password: 'Password123!' });
    expect([401, 403]).toContain(blocked.status);
    const restore = await request(app)
      .put(`/api/v1/admin/users/${victim.userId}/suspend`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ suspended: false });
    expect(restore.status).toBe(200);
    const ok = await request(app).post('/api/v1/auth/login').send({ email: 'phase5-suspend-me@example.com', password: 'Password123!' });
    expect(ok.status).toBe(200);
  });

  test('admin cannot suspend themselves', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/users/${admin.userId}/suspend`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ suspended: true });
    expect(res.status).toBe(403);
  });
});

describe('phase5 course approval lifecycle', () => {
  test('instructor course starts pending; admin approves to published with notification', async () => {
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Phase5 Approval Course One', description: 'lifecycle' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending');

    const queue = await request(app).get('/api/v1/admin/courses/pending').set('Authorization', `Bearer ${admin.token}`);
    expect(queue.status).toBe(200);
    expect(queue.body.data.map((c: { id: string }) => c.id)).toContain(created.body.id);

    const approved = await request(app)
      .post(`/api/v1/admin/courses/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ comment: 'Looks good' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('published');

    const history = await request(app)
      .get(`/api/v1/admin/courses/${created.body.id}/approvals`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(history.status).toBe(200);
    expect(history.body.data.length).toBeGreaterThanOrEqual(1);

    const notifs = await request(app).get('/api/v1/notifications/me').set('Authorization', `Bearer ${instructor.token}`);
    expect(notifs.status).toBe(200);
    expect(notifs.body.data.some((n: { type: string }) => n.type === 'course_approved')).toBe(true);
  });

  test('admin can reject a course with notification', async () => {
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Phase5 Rejection Course Two', description: 'lifecycle' });
    const rejected = await request(app)
      .post(`/api/v1/admin/courses/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ comment: 'Needs work' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('rejected');
  });

  test('non-admin cannot approve courses', async () => {
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Phase5 Forbidden Approval Xyz', description: 'x' });
    const res = await request(app)
      .post(`/api/v1/admin/courses/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({ comment: 'hijack' });
    expect(res.status).toBe(403);
  });
});

describe('phase5 admin analytics', () => {
  test('admin analytics returns real data with explicit revenue gap', async () => {
    const res = await request(app).get('/api/v1/admin/analytics/overview').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.users.total).toBe('number');
    expect(typeof res.body.enrollments.total).toBe('number');
    expect(typeof res.body.enrollments.completionRate).toBe('number');
    expect(res.body.revenue.total).toBe(0);
    expect(res.body.revenue.unavailable).toBe(true);
  });
});

describe('phase5 discussions', () => {
  let courseId: string;
  let threadId: string;
  let postA: string;

  beforeAll(async () => {
    courseId = await makePublishedCourse(instructor.token, 'Phase5 Discussion Course Abc');
    await enroll(studentA.token, courseId);
    await enroll(studentB.token, courseId);
  });

  test('enrolled student creates a thread', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/discussions/threads`)
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({ title: 'What is the deadline?', body: 'Asking about week 2' });
    expect(res.status).toBe(201);
    threadId = res.body.id as string;
    expect(threadId).toBeTruthy();
  });

  test('enrolled student posts a reply', async () => {
    const res = await request(app)
      .post(`/api/v1/discussions/threads/${threadId}/posts`)
      .set('Authorization', `Bearer ${studentB.token}`)
      .send({ body: 'I think it is Friday' });
    expect(res.status).toBe(201);
    postA = res.body.id as string;
  });

  test('unenrolled student cannot access discussions', async () => {
    const outsider = await register('phase5-outsider@example.com', 'student');
    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/discussions/threads`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(res.status).toBe(403);
  });

  test('course isolation: student enrolled elsewhere cannot read the thread', async () => {
    const otherCourse = await makePublishedCourse(instructorB.token, 'Phase5 Other Course Zzz');
    const otherStudent = await register('phase5-other-stud@example.com', 'student');
    await enroll(otherStudent.token, otherCourse);
    const res = await request(app)
      .get(`/api/v1/discussions/threads/${threadId}`)
      .set('Authorization', `Bearer ${otherStudent.token}`);
    expect(res.status).toBe(403);
  });

  test('IDOR: student B cannot edit student A post', async () => {
    const mine = await request(app)
      .post(`/api/v1/discussions/threads/${threadId}/posts`)
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({ body: 'my own post here' });
    const target = mine.body.id as string;
    const res = await request(app)
      .put(`/api/v1/discussions/posts/${target}`)
      .set('Authorization', `Bearer ${studentB.token}`)
      .send({ body: 'hijacked edit' });
    expect(res.status).toBe(403);
  });

  test('IDOR: student B cannot delete student A post', async () => {
    const mine = await request(app)
      .post(`/api/v1/discussions/threads/${threadId}/posts`)
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({ body: 'another own post' });
    const res = await request(app)
      .delete(`/api/v1/discussions/posts/${mine.body.id}`)
      .set('Authorization', `Bearer ${studentB.token}`);
    expect(res.status).toBe(403);
  });

  test('instructor can moderate own-course posts; outsider instructor cannot', async () => {
    const hide = await request(app)
      .put(`/api/v1/discussions/posts/${postA}/moderate`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ action: 'hide' });
    expect(hide.status).toBe(200);
    const forbiddenMod = await request(app)
      .put(`/api/v1/discussions/posts/${postA}/moderate`)
      .set('Authorization', `Bearer ${instructorB.token}`)
      .send({ action: 'unhide' });
    expect(forbiddenMod.status).toBe(403);
  });

  test('flagging surfaces in admin moderation queue; admin can resolve', async () => {
    const flaggable = await request(app)
      .post(`/api/v1/discussions/threads/${threadId}/posts`)
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({ body: 'flaggable content here' });
    const flag = await request(app)
      .post(`/api/v1/discussions/posts/${flaggable.body.id}/flag`)
      .set('Authorization', `Bearer ${studentB.token}`)
      .send({ reason: 'spam' });
    expect(flag.status).toBe(201);

    const queue = await request(app).get('/api/v1/admin/moderation/flagged-posts').set('Authorization', `Bearer ${admin.token}`);
    expect(queue.status).toBe(200);
    expect(queue.body.data.map((p: { id: string }) => p.id)).toContain(flaggable.body.id);

    const studentQueue = await request(app)
      .get('/api/v1/admin/moderation/flagged-posts')
      .set('Authorization', `Bearer ${studentA.token}`);
    expect(studentQueue.status).toBe(403);

    const resolve = await request(app)
      .put(`/api/v1/admin/moderation/posts/${flaggable.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ action: 'resolve' });
    expect(resolve.status).toBe(200);
  });
});

describe('phase5 announcements', () => {
  let courseId: string;

  beforeAll(async () => {
    courseId = await makePublishedCourse(instructor.token, 'Phase5 Announcement Course Qq');
    await enroll(studentA.token, courseId);
  });

  test('owner instructor can create an announcement', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/announcements`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Welcome to week 1', body: 'Please read the syllabus' });
    expect(res.status).toBe(201);
  });

  test('non-owner instructor is blocked', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/announcements`)
      .set('Authorization', `Bearer ${instructorB.token}`)
      .send({ title: 'Hijack attempt', body: 'nope' });
    expect(res.status).toBe(403);
  });

  test('enrolled student can read; unenrolled cannot', async () => {
    const ok = await request(app)
      .get(`/api/v1/courses/${courseId}/announcements`)
      .set('Authorization', `Bearer ${studentA.token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.length).toBeGreaterThanOrEqual(1);
    const outsider = await register('phase5-ann-outsider@example.com', 'student');
    const denied = await request(app)
      .get(`/api/v1/courses/${courseId}/announcements`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(denied.status).toBe(403);
  });

  test('announcement notifies enrolled students', async () => {
    const notifs = await request(app).get('/api/v1/notifications/me').set('Authorization', `Bearer ${studentA.token}`);
    expect(notifs.body.data.some((n: { type: string }) => n.type === 'announcement')).toBe(true);
  });
});

describe('phase5 notifications + email', () => {
  test('notifications are user-isolated', async () => {
    const mine = await request(app).get('/api/v1/notifications/me').set('Authorization', `Bearer ${studentA.token}`);
    expect(mine.status).toBe(200);
    const otherId = (mine.body.data[0] as { id: string } | undefined)?.id;
    if (otherId) {
      const cross = await request(app).put(`/api/v1/notifications/${otherId}/read`).set('Authorization', `Bearer ${studentB.token}`);
      expect(cross.status).toBe(404);
    }
    // No cross-user leakage: B's list must not contain A's ids.
    const bList = await request(app).get('/api/v1/notifications/me').set('Authorization', `Bearer ${studentB.token}`);
    const aIds = new Set((mine.body.data as { id: string }[]).map((n) => n.id));
    for (const n of bList.body.data as { id: string }[]) {
      expect(aIds.has(n.id)).toBe(false);
    }
  });

  test('unread count, mark read, mark all read', async () => {
    const before = await request(app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${studentA.token}`);
    expect(before.status).toBe(200);
    expect(typeof before.body.unread).toBe('number');
    const list = await request(app).get('/api/v1/notifications/me').set('Authorization', `Bearer ${studentA.token}`);
    const first = (list.body.data as { id: string }[])[0];
    if (first) {
      const read = await request(app).put(`/api/v1/notifications/${first.id}/read`).set('Authorization', `Bearer ${studentA.token}`);
      expect(read.status).toBe(200);
      expect(read.body.is_read).toBe(true);
    }
    const all = await request(app).put('/api/v1/notifications/read-all').set('Authorization', `Bearer ${studentA.token}`).send();
    expect(all.status).toBe(200);
    const after = await request(app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${studentA.token}`);
    expect(after.body.unread).toBe(0);
  });

  test('email abstraction is mocked in tests (no real delivery)', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/test-email')
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({ to: 'someone@example.com', subject: 'hi', text: 'hello' });
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('mock');
    expect(res.body.delivered).toBe(true);
    const status = await request(app).get('/api/v1/notifications/email-status').set('Authorization', `Bearer ${studentA.token}`);
    expect(status.status).toBe(200);
    expect(typeof status.body.provider).toBe('string');
  });

  test('assignment grading notifies the student', async () => {
    const courseId = await makePublishedCourse(instructor.token, 'Phase5 Grade Notify Course Ww');
    await enroll(studentA.token, courseId);
    const assignment = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ courseId, title: 'Essay 1', description: 'write' });
    expect(assignment.status).toBe(201);
    const submit = await request(app)
      .post(`/api/v1/assignments/${assignment.body.id}/submit`)
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({ contentText: 'my essay' });
    expect(submit.status).toBe(201);
    const subs = await request(app)
      .get(`/api/v1/assignments/${assignment.body.id}/submissions`)
      .set('Authorization', `Bearer ${instructor.token}`);
    const subId = (subs.body.data as { id: string }[])[0].id;
    const grade = await request(app)
      .put(`/api/v1/submissions/${subId}/grade`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ grade: 90, feedback: 'great' });
    expect(grade.status).toBe(200);
    const notifs = await request(app).get('/api/v1/notifications/me').set('Authorization', `Bearer ${studentA.token}`);
    expect(notifs.body.data.some((n: { type: string }) => n.type === 'assignment_graded')).toBe(true);
  });
});

describe('phase5 admin delete-user safety', () => {
  test('admin can delete a user with no courses; cannot delete self or course owners', async () => {
    const doomed = await register('phase5-doomed@example.com', 'student');
    const del = await request(app).delete(`/api/v1/admin/users/${doomed.userId}`).set('Authorization', `Bearer ${admin.token}`);
    expect(del.status).toBe(204);
    const self = await request(app).delete(`/api/v1/admin/users/${admin.userId}`).set('Authorization', `Bearer ${admin.token}`);
    expect(self.status).toBe(403);
    const owner = await request(app).delete(`/api/v1/admin/users/${instructor.userId}`).set('Authorization', `Bearer ${admin.token}`);
    expect(owner.status).toBe(409);
  });
});
