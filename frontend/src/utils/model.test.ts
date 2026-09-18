import { describe, test, expect } from 'vitest';
import {
  normalizeCourse,
  normalizeEnrollment,
  normalizeQuiz,
  normalizeAttemptResult,
  normalizeGamification,
  normalizeRecommendation,
  normalizeCertificate,
  normalizeSubmission,
  safePercent,
  displayPercent,
  validId,
  num,
} from './model';

describe('model normalization (no /undefined, no NaN%)', () => {
  test('course cards never generate /undefined: missing id maps to empty, valid ids pass', () => {
    expect(normalizeCourse({ id: 'c1', title: 'T' }).id).toBe('c1');
    expect(normalizeCourse({ title: 'T' }).id).toBe('');
    expect(validId(normalizeCourse({ title: 'T' }).id)).toBeNull();
    expect(validId('c1')).toBe('c1');
    expect(validId('')).toBeNull();
    expect(validId(undefined)).toBeNull();
  });

  test('course snake_case maps to camelCase once', () => {
    const c = normalizeCourse({
      id: 'c1', title: 'T', instructor_id: 'u1', avg_rating: 4.5, rating_count: 3,
      modules: [{ id: 'm1', title: 'M', sort_order: 0, lectures: [{ id: 'l1', title: 'L', sort_order: 0 }] }],
    });
    expect(c.instructorId).toBe('u1');
    expect(c.avgRating).toBe(4.5);
    expect(c.ratingCount).toBe(3);
    expect(c.modules[0].sortOrder).toBe(0);
    expect(c.modules[0].lectures[0].id).toBe('l1');
  });

  test('enrollment maps course_id/progress_percent/course_title; missing progress is 0', () => {
    const e = normalizeEnrollment({ id: 'e1', course_id: 'c9', progress_percent: 42.4, course_title: 'Python', course_status: 'published' });
    expect(e.courseId).toBe('c9');
    expect(e.progressPercent).toBe(42);
    expect(e.courseTitle).toBe('Python');
    expect(normalizeEnrollment({ id: 'e2', course_id: 'c9' }).progressPercent).toBe(0);
  });

  test('progress never produces NaN/Infinity/undefined', () => {
    for (const bad of [undefined, null, NaN, Infinity, -Infinity, 'abc', {}, []]) {
      expect(safePercent(bad)).toBe(0);
      expect(displayPercent(bad)).toBe('0%');
      expect(displayPercent(bad)).not.toMatch(/NaN|Infinity|undefined|null/);
    }
    expect(safePercent(-5)).toBe(0);
    expect(safePercent(142)).toBe(100);
    expect(safePercent(42.6)).toBe(43);
    expect(num('12', 0)).toBe(12);
  });

  test('quiz options map option_text→optionText; submit result max_score→maxScore', () => {
    const q = normalizeQuiz({
      id: 'q1', course_id: 'c1', title: 'Q', is_ai_generated: true, question_count: 1,
      questions: [{ id: 'qq1', type: 'mcq', prompt: 'P?', points: 2, options: [{ id: 'o1', option_text: 'Yes', is_correct: true }] }],
    });
    expect(q.courseId).toBe('c1');
    expect(q.isAiGenerated).toBe(true);
    expect(q.questionCount).toBe(1);
    expect(q.questions[0].options[0].optionText).toBe('Yes');
    expect(q.questions[0].options[0].isCorrect).toBe(true);
    const r = normalizeAttemptResult({ score: 2, max_score: 4, status: 'graded' });
    expect(r).toEqual({ score: 2, maxScore: 4, status: 'graded' });
  });

  test('gamification maps streak/badges with null-streak safety', () => {
    const g = normalizeGamification({
      badges: [{ slug: 's', name: 'Starter', awarded_at: '2026-01-01' }],
      streak: { current_streak_days: 5, longest_streak_days: 9 },
    });
    expect(g.currentStreak).toBe(5);
    expect(g.longestStreak).toBe(9);
    expect(g.badges[0].name).toBe('Starter');
    expect(normalizeGamification({ badges: [], streak: null }).currentStreak).toBe(0);
  });

  test('recommendations keep null courseId (browse-card) and map course_id', () => {
    expect(normalizeRecommendation({ id: 'r1', course_id: 'c5', kind: 'continue', title: 'T', reason: 'R', score: 1 }, 0).courseId).toBe('c5');
    expect(normalizeRecommendation({ kind: 'next', title: 'Browse' }, 3).courseId).toBeNull();
  });

  test('certificates map course_title/code/issued_at', () => {
    const c = normalizeCertificate({ id: 'ct1', course_id: 'c1', certificate_code: 'VL-X', issued_at: '2026-02-02', course_title: 'Python' });
    expect(c.courseId).toBe('c1');
    expect(c.courseTitle).toBe('Python');
    expect(c.certificateCode).toBe('VL-X');
  });

  test('submissions map file/grade fields', () => {
    const s = normalizeSubmission({ id: 's1', assignment_id: 'a1', file_name: 'x.pdf', content_text: 'hi', grade: 8 });
    expect(s.assignmentId).toBe('a1');
    expect(s.fileName).toBe('x.pdf');
    expect(s.contentText).toBe('hi');
    expect(s.grade).toBe(8);
    expect(normalizeSubmission({ id: 's2' }).grade).toBeNull();
  });
});
