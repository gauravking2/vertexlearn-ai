import { db } from '../db/pool';

interface GradeInput {
  type: 'mcq' | 'multi_select' | 'short_answer';
  correctOptionIds: string[];
  points: number;
  selectedOptionIds: string[];
  answerText: string;
}

export function gradeObjectiveQuestion(input: GradeInput): { isCorrect: boolean | null; pointsEarned: number } {
  if (input.type === 'short_answer') {
    return { isCorrect: null, pointsEarned: 0 };
  }
  const correct = new Set(input.correctOptionIds);
  const selected = new Set(input.selectedOptionIds);
  if (input.type === 'mcq') {
    const ok = selected.size === 1 && correct.size >= 1 && correct.has([...selected][0] as string);
    return { isCorrect: ok, pointsEarned: ok ? input.points : 0 };
  }
  const sameSize = selected.size === correct.size;
  const allMatch = sameSize && [...selected].every((id) => correct.has(id));
  return { isCorrect: allMatch, pointsEarned: allMatch ? input.points : 0 };
}

export function normalizeIdList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [];
    }
  }
  return [];
}

export async function getQuizWithQuestions(quizId: string): Promise<{
  quiz: Record<string, unknown> | undefined;
  questions: { id: string; type: string; prompt: string; points: number; options: { id: string; option_text: string; is_correct: boolean }[] }[];
}> {
  const quizRes = await db.query(`SELECT id, course_id, instructor_id, title, description, is_ai_generated FROM quizzes WHERE id = $1`, [quizId]);
  const quiz = quizRes.rows[0] as Record<string, unknown> | undefined;
  if (!quiz) return { quiz: undefined, questions: [] };
  const qRes = await db.query(`SELECT id, type, prompt, points FROM quiz_questions WHERE quiz_id = $1 ORDER BY created_at`, [quizId]);
  const questions: { id: string; type: string; prompt: string; points: number; options: { id: string; option_text: string; is_correct: boolean }[] }[] = [];
  for (const q of qRes.rows as { id: string; type: string; prompt: string; points: number }[]) {
    const oRes = await db.query(`SELECT id, option_text, is_correct FROM quiz_options WHERE question_id = $1 ORDER BY sort_order`, [q.id]);
    questions.push({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      points: q.points,
      options: oRes.rows as { id: string; option_text: string; is_correct: boolean }[],
    });
  }
  return { quiz, questions };
}
