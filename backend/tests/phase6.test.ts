import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/db/pool';
import { useTestDb } from './helpers';
import { lectureObjectKey, sanitizeFileName, storageBackendName, submissionObjectKey } from '../src/storage/objectStore';

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

async function makePublishedCourse(instructorToken: string, title: string, extra: Record<string, string> = {}): Promise<string> {
  const course = await request(app)
    .post('/api/v1/courses')
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ title, description: 'desc', ...extra });
  const id = course.body.id as string;
  await db.query(`UPDATE courses SET status = 'published' WHERE id = $1`, [id]);
  return id;
}

let admin: { token: string; userId: string };
let instructor: { token: string; userId: string };
let student: { token: string; userId: string };

beforeAll(async () => {
  await useTestDb();
  app = createApp();
  admin = await makeAdmin('phase6-admin@example.com');
  instructor = await register('phase6-teach@example.com', 'instructor');
  student = await register('phase6-stud@example.com', 'student');
});

describe('phase6 storage key hygiene (no network)', () => {
  test('object keys are safe and namespaced', () => {
    expect(submissionObjectKey('a', 'b', '../../etc/passwd')).toBe('submissions/a/b/.._.._etc_passwd');
    expect(lectureObjectKey('lec1', 'My Video (final).mp4')).toBe('lectures/lec1/My_Video__final_.mp4');
    expect(sanitizeFileName('', 'fallback')).toBe('fallback');
  });

  test('default backend is local without S3 credentials', () => {
    expect(storageBackendName()).toBe('local');
  });
});

describe('phase6 assignment binary upload (local backend)', () => {
  let courseId: string;
  let assignmentId: string;

  beforeAll(async () => {
    courseId = await makePublishedCourse(instructor.token, 'Phase6 Upload Course Aa');
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send();
    const assignment = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ courseId, title: 'Upload Me', description: 'binary upload' });
    assignmentId = assignment.body.id as string;
  });

  test('student uploads a PDF; bytes land in storage, metadata in Postgres', async () => {
    const pdf = Buffer.from('%PDF-1.4 fake pdf bytes for testing');
    const res = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/upload`)
      .set('Authorization', `Bearer ${student.token}`)
      .attach('file', pdf, 'homework.pdf');
    expect(res.status).toBe(201);
    expect(res.body.file_name).toBe('homework.pdf');
    expect(res.body.file_size_bytes).toBe(pdf.length);
    expect(res.body.storage.bucket).toBeTruthy();
    expect(res.body.storage.key).toContain(assignmentId);
    const row = await db.query(`SELECT file_key, content_text FROM assignment_submissions WHERE id = $1`, [res.body.id]);
    expect((row.rows[0] as { content_text: string }).content_text).toBe('');
    expect((row.rows[0] as { file_key: string }).file_key).toContain(assignmentId);
  });

  test('student downloads own file; instructor downloads graded file', async () => {
    const subs = await request(app).get(`/api/v1/assignments/${assignmentId}/submissions`).set('Authorization', `Bearer ${instructor.token}`);
    const subId = (subs.body.data as { id: string }[])[0].id;
    const asStudent = await request(app).get(`/api/v1/submissions/${subId}/download`).set('Authorization', `Bearer ${student.token}`);
    expect(asStudent.status).toBe(200);
    expect(asStudent.headers['content-type']).toContain('application/pdf');
    const asInstructor = await request(app).get(`/api/v1/submissions/${subId}/download`).set('Authorization', `Bearer ${instructor.token}`);
    expect(asInstructor.status).toBe(200);
  });

  test('another student cannot download the file (isolation)', async () => {
    const other = await register('phase6-other-stud@example.com', 'student');
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${other.token}`).send();
    const subs = await request(app).get(`/api/v1/assignments/${assignmentId}/submissions`).set('Authorization', `Bearer ${instructor.token}`);
    const subId = (subs.body.data as { id: string }[])[0].id;
    const res = await request(app).get(`/api/v1/submissions/${subId}/download`).set('Authorization', `Bearer ${other.token}`);
    expect(res.status).toBe(403);
  });

  test('executables are rejected; spoofed content is rejected', async () => {
    const exe = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/upload`)
      .set('Authorization', `Bearer ${admin.token}`)
      .attach('file', Buffer.from('MZ fake'), 'evil.exe');
    expect(exe.status).toBe(400);
    const spoof = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/upload`)
      .set('Authorization', `Bearer ${admin.token}`)
      .attach('file', Buffer.from('not a pdf at all'), 'spoof.pdf');
    expect(spoof.status).toBe(400);
  });

  test('duplicate binary submission is rejected', async () => {
    const res = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/upload`)
      .set('Authorization', `Bearer ${student.token}`)
      .attach('file', Buffer.from('%PDF-1.4 again'), 'second.pdf');
    expect(res.status).toBe(409);
  });
});

describe('phase6 lecture video URLs', () => {
  let lectureId: string;
  let courseId: string;

  beforeAll(async () => {
    courseId = await makePublishedCourse(instructor.token, 'Phase6 Video Course Bb');
    const mod = await request(app).post(`/api/v1/courses/${courseId}/modules`).set('Authorization', `Bearer ${instructor.token}`).send({ title: 'M1' });
    const lec = await request(app)
      .post(`/api/v1/courses/modules/${mod.body.id}/lectures`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'L1' });
    lectureId = lec.body.id as string;
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send();
  });

  test('owner instructor gets an upload target and video_key is stored', async () => {
    const res = await request(app)
      .post(`/api/v1/lectures/${lectureId}/upload-url`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ fileName: 'intro.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(201);
    expect(res.body.key).toContain(lectureId);
    expect(res.body.uploadUrl).toBeTruthy();
    const row = await db.query(`SELECT video_key FROM lectures WHERE id = $1`, [lectureId]);
    expect((row.rows[0] as { video_key: string }).video_key).toContain(lectureId);
  });

  test('non-owner instructor cannot mint upload URLs', async () => {
    const other = await register('phase6-teach2@example.com', 'instructor');
    const res = await request(app)
      .post(`/api/v1/lectures/${lectureId}/upload-url`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ fileName: 'hijack.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(403);
  });

  test('video-url without storage backend reports honestly (no fabricated stream)', async () => {
    const res = await request(app).get(`/api/v1/lectures/${lectureId}/video-url`).set('Authorization', `Bearer ${student.token}`);
    expect(res.status).toBe(200);
    expect(res.body.url).toBeNull();
    expect(res.body.unavailable).toBe(true);
  });

  test('lecture without video reports missing (404)', async () => {
    const mod = await request(app).post(`/api/v1/courses/${courseId}/modules`).set('Authorization', `Bearer ${instructor.token}`).send({ title: 'M2' });
    const lec = await request(app)
      .post(`/api/v1/courses/modules/${mod.body.id}/lectures`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'NoVideo' });
    const res = await request(app).get(`/api/v1/lectures/${lec.body.id}/video-url`).set('Authorization', `Bearer ${student.token}`);
    expect(res.status).toBe(404);
  });
});

describe('phase6 certificate storage', () => {
  test('certificate download serves PDF bytes with stored key', async () => {
    const courseId = await makePublishedCourse(instructor.token, 'Phase6 Cert Course Cc');
    const mod = await request(app).post(`/api/v1/courses/${courseId}/modules`).set('Authorization', `Bearer ${instructor.token}`).send({ title: 'M1' });
    const lec = await request(app)
      .post(`/api/v1/courses/modules/${mod.body.id}/lectures`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'L1' });
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send();
    await request(app)
      .post(`/api/v1/lectures/${lec.body.id}/progress`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ watchedSeconds: 10, completed: true });
    const me = await request(app).get('/api/v1/certificates/me').set('Authorization', `Bearer ${student.token}`);
    expect(me.body.data.length).toBeGreaterThanOrEqual(1);
    const dl = await request(app).get(`/api/v1/certificates/${me.body.data[0].id}/download`).set('Authorization', `Bearer ${student.token}`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toContain('application/pdf');
  });
});

describe('phase6 catalog filters + reviews', () => {
  test('category/difficulty filters work server-side', async () => {
    await makePublishedCourse(instructor.token, 'Phase6 Prog Course Dd', { category: 'Programming', difficulty: 'beginner' });
    await makePublishedCourse(instructor.token, 'Phase6 Design Course Ee', { category: 'Design', difficulty: 'advanced' });
    const cat = await request(app).get('/api/v1/courses?category=Programming&pageSize=100');
    expect(cat.status).toBe(200);
    for (const c of cat.body.data as { category: string }[]) expect(c.category).toBe('Programming');
    const diff = await request(app).get('/api/v1/courses?difficulty=advanced&pageSize=100');
    expect(diff.status).toBe(200);
    for (const c of diff.body.data as { difficulty: string }[]) expect(c.difficulty).toBe('advanced');
  });

  test('invalid difficulty is rejected (validation)', async () => {
    const res = await request(app).get('/api/v1/courses?difficulty=expert');
    expect(res.status).toBe(400);
  });

  test('reviews: enrolled student rates, aggregate appears, minRating filters', async () => {
    const courseId = await makePublishedCourse(instructor.token, 'Phase6 Review Course Ff', { category: 'Business' });
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send();
    const review = await request(app)
      .post(`/api/v1/courses/${courseId}/reviews`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ rating: 5, review: 'Excellent course' });
    expect(review.status).toBe(201);
    expect(review.body.rating).toBe(5);
    const list = await request(app).get(`/api/v1/courses/${courseId}/reviews`);
    expect(list.status).toBe(200);
    expect(list.body.aggregate.rating_count).toBe(1);
    expect(list.body.aggregate.avg_rating).toBe(5);
    const filtered = await request(app).get('/api/v1/courses?minRating=4&pageSize=100');
    expect(filtered.status).toBe(200);
    expect((filtered.body.data as { id: string }[]).map((c) => c.id)).toContain(courseId);
    const strict = await request(app).get(`/api/v1/courses?minRating=4&q=Phase6+Prog+Course+Dd&pageSize=100`);
    expect((strict.body.data as { id: string }[]).length).toBe(0);
  });

  test('unenrolled student cannot review; rating bounds enforced', async () => {
    const courseId = await makePublishedCourse(instructor.token, 'Phase6 Review Course Gg');
    const outsider = await register('phase6-rev-out@example.com', 'student');
    const denied = await request(app)
      .post(`/api/v1/courses/${courseId}/reviews`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ rating: 5 });
    expect(denied.status).toBe(403);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${outsider.token}`).send();
    const bad = await request(app)
      .post(`/api/v1/courses/${courseId}/reviews`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ rating: 6 });
    expect(bad.status).toBe(400);
  });
});

describe('phase6 payments + revenue analytics', () => {
  test('analytics revenue is zero-state with no payments', async () => {
    const res = await request(app).get('/api/v1/admin/analytics/overview').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.revenue.recorded).toBe(0);
    expect(res.body.revenue.total).toBe(0);
    expect(res.body.revenue.unavailable).toBe(true);
  });

  test('recorded completed payments aggregate; pending/refunded excluded', async () => {
    const courseId = await makePublishedCourse(instructor.token, 'Phase6 Paid Course Hh');
    const p1 = await request(app)
      .post('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: student.userId, courseId, amountCents: 4999, currency: 'USD', status: 'completed', provider: 'manual' });
    expect(p1.status).toBe(201);
    await request(app)
      .post('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: student.userId, courseId, amountCents: 1000, currency: 'USD', status: 'pending' });
    await request(app)
      .post('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: student.userId, courseId, amountCents: 2000, currency: 'USD', status: 'refunded' });
    const res = await request(app).get('/api/v1/admin/analytics/overview').set('Authorization', `Bearer ${admin.token}`);
    expect(res.body.revenue.recorded).toBe(3);
    expect(res.body.revenue.total).toBe(4999);
    expect(res.body.revenue.currency).toBe('USD');
    expect(res.body.revenue.unavailable).toBe(false);
    expect(res.body.revenue.totals).toEqual([{ currency: 'USD', total_cents: 4999 }]);
    const list = await request(app).get('/api/v1/admin/payments').set('Authorization', `Bearer ${admin.token}`);
    expect(list.body.data.length).toBe(3);
  });

  test('non-admin cannot record payments; unknown course rejected', async () => {
    const denied = await request(app)
      .post('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ amountCents: 100 });
    expect(denied.status).toBe(403);
    const bad = await request(app)
      .post('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ courseId: '00000000-0000-4000-8000-ffffffffffff', amountCents: 100 });
    expect(bad.status).toBe(404);
  });
});
