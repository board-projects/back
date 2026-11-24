import { clozeAnswerKey } from '../board/cloze-content';
import type { ExamQuestion } from './entities/exam-question.entity';

type QuestionDefinition = Pick<ExamQuestion, 'sourceItemId' | 'kind' | 'question'>;
type Grade = { earned: number; possible: number; pendingManual: number; unconfigured: number };

function normalizeBlank(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function scoreQuestion({ kind, question }: QuestionDefinition, answer: string[]): number | undefined {
  if (kind === 'clozeTests') {
    const keys = typeof question.content === 'string' ? clozeAnswerKey(question.content).map(normalizeBlank) : [];
    if (!keys.length || keys.some((key) => !key)) return;
    return keys.filter((key, index) => key === normalizeBlank(answer[index] ?? '')).length / keys.length;
  }

  switch (question.kind) {
    case 'matching': {
      const pairs = question.pairs as Array<{ left: { id: string; text: string }; right: { id: string; text: string } }> | undefined;
      if (!pairs?.length || pairs.some(({ left, right }) => !left.text.trim() || !right.text.trim())) return;
      const selected = new Set(answer);
      return pairs.filter(({ left, right }) => selected.has(`${left.id}:${right.id}`)).length / pairs.length;
    }
    case 'ordering': {
      const steps = question.steps as Array<{ id: string; text: string }> | undefined;
      if (!steps?.length || steps.some(({ text }) => !text.trim())) return;
      return Number(answer.length === steps.length && steps.every(({ id }, index) => answer[index] === id));
    }
    case 'image_spot': {
      const target = question.target as { x: number; y: number; radius: number } | undefined;
      if (!target) return;
      if (!answer[0]) return 0;
      const [x, y] = answer[0].split(',').map(Number);
      return Number(Math.hypot(x - target.x, y - target.y) <= target.radius + Number.EPSILON);
    }
    default: {
      const options = question.options as Array<{ id: string; correct?: boolean }> | undefined;
      const keys = options?.filter(({ correct }) => correct).map(({ id }) => id);
      if (!keys?.length) return;
      const selected = new Set(answer);
      return Number(selected.size === keys.length && keys.every((id) => selected.has(id)));
    }
  }
}

export function gradeExam(questions: QuestionDefinition[], answers: Record<string, string[]>): Grade {
  const grade = { earned: 0, possible: 0, pendingManual: 0, unconfigured: 0 };
  for (const entry of questions) {
    const answer = Object.hasOwn(answers, entry.sourceItemId) ? answers[entry.sourceItemId] : [];
    if (entry.kind === 'questions' && entry.question.kind === 'essay') {
      grade.pendingManual += 1;
      continue;
    }
    const score = scoreQuestion(entry, answer);
    if (score === undefined) {
      grade.unconfigured += 1;
      continue;
    }
    grade.earned += score;
    grade.possible += 1;
  }
  return grade;
}
