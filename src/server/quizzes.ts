import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { batchAll, db } from "@/db";
import {
  quizAnswers,
  quizAttempts,
  quizQuestions,
  quizzes,
  subjects,
} from "@/db/schema";
import { completeJson } from "./ai";
import { sqliteTime } from "./schedule";
import { addXp } from "./users";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const createQuizInput = z.object({
  subjectId: z.string().min(1),
  topic: z.string().trim().min(1, "Give a topic").max(120),
  difficulty: z.enum(DIFFICULTIES),
});
const optionList = z
  .array(z.string().trim().min(1, "Fill in every option").max(500))
  .min(2, "Give at least two options")
  .max(6, "Six options at most");
export const questionInput = z
  .object({
    quizId: z.string().min(1),
    id: z.string().optional(),
    prompt: z.string().trim().min(1, "Write the question").max(2000),
    options: optionList,
    correctIndex: z.number().int().min(0),
    explanation: z.string().trim().max(2000).optional(),
  })
  .refine((q) => q.correctIndex < q.options.length, "Pick the right answer");
export const questionRef = z.object({ quizId: z.string().min(1), id: z.string().min(1) });
export const generateQuizInput = z.object({
  quizId: z.string().min(1),
  source: z.string().trim().max(20000).optional(),
});
export const answerInput = z.object({
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  choice: z.number().int().min(0).max(5),
});

export async function getQuiz(userId: string, id: string) {
  const [row] = await db
    .select({
      id: quizzes.id,
      topic: quizzes.topic,
      difficulty: quizzes.difficulty,
      subjectId: quizzes.subjectId,
      subject: subjects.name,
    })
    .from(quizzes)
    .innerJoin(subjects, eq(subjects.id, quizzes.subjectId))
    .where(and(eq(quizzes.id, id), eq(quizzes.ownerId, userId)));
  return row ?? null;
}

export async function quizPage(userId: string, id: string) {
  const quiz = await getQuiz(userId, id);
  if (!quiz) return null;
  const [questions, attempts] = await Promise.all([
    db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, id))
      .orderBy(asc(quizQuestions.seq)),
    db
      .select({
        id: quizAttempts.id,
        score: quizAttempts.score,
        total: quizAttempts.total,
        bestStreak: quizAttempts.bestStreak,
        seconds: quizAttempts.seconds,
        xp: quizAttempts.xp,
        at: quizAttempts.finishedAt,
      })
      .from(quizAttempts)
      .where(
        and(eq(quizAttempts.quizId, id), sql`${quizAttempts.finishedAt} is not null`),
      )
      .orderBy(desc(quizAttempts.finishedAt)),
  ]);
  return { quiz, questions, attempts };
}

export async function createQuiz(
  userId: string,
  input: z.infer<typeof createQuizInput>,
) {
  const [subject] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, input.subjectId), eq(subjects.ownerId, userId)));
  if (!subject) return null;
  const id = crypto.randomUUID();
  await db.insert(quizzes).values({
    id,
    ownerId: userId,
    subjectId: subject.id,
    topic: input.topic,
    difficulty: input.difficulty,
  });
  return { id };
}

export async function deleteQuiz(userId: string, id: string) {
  const [row] = await db
    .delete(quizzes)
    .where(and(eq(quizzes.id, id), eq(quizzes.ownerId, userId)))
    .returning({ id: quizzes.id, subjectId: quizzes.subjectId });
  return row ?? null;
}

export async function saveQuestion(
  userId: string,
  input: z.infer<typeof questionInput>,
) {
  if (!(await getQuiz(userId, input.quizId))) return null;
  const values = {
    prompt: input.prompt,
    options: input.options,
    correctIndex: input.correctIndex,
    explanation: input.explanation || null,
  };
  if (input.id) {
    const [row] = await db
      .update(quizQuestions)
      .set(values)
      .where(and(eq(quizQuestions.id, input.id), eq(quizQuestions.quizId, input.quizId)))
      .returning({ id: quizQuestions.id });
    return row ?? null;
  }
  const id = crypto.randomUUID();
  await db.insert(quizQuestions).values({
    id,
    quizId: input.quizId,
    seq: sql`(select coalesce(max(seq), 0) + 1 from quiz_questions where quiz_id = ${input.quizId})`,
    ...values,
  });
  return { id };
}

export async function deleteQuestion(userId: string, input: z.infer<typeof questionRef>) {
  if (!(await getQuiz(userId, input.quizId))) return null;
  const [row] = await db
    .delete(quizQuestions)
    .where(and(eq(quizQuestions.id, input.id), eq(quizQuestions.quizId, input.quizId)))
    .returning({ id: quizQuestions.id });
  return row ?? null;
}

const generatedQuestions = z.object({
  questions: z
    .array(
      z.object({
        prompt: z.string().min(1),
        options: z.array(z.string().min(1)).min(2).max(6),
        correct: z.number().int().min(0),
        explanation: z.string().optional(),
      }),
    )
    .min(1)
    .max(30),
});

/** Questions from the model for a topic at a difficulty. */
export async function draftQuestions(
  subject: string,
  topic: string,
  difficulty: Difficulty,
  source?: string,
) {
  const { questions } = await completeJson(
    "quiz",
    `Write 5 to 8 multiple-choice questions on "${topic}" in ${subject}, at ${difficulty} difficulty. Each has 3 or 4 options, exactly one correct (its zero-based index in "correct"), and a one-sentence explanation. Shape: {"questions":[{"prompt":"...","options":["..."],"correct":0,"explanation":"..."}]}`,
    source?.trim() || `Topic: ${topic}`,
    generatedQuestions,
  );
  return questions
    .filter((q) => q.correct < q.options.length)
    .map((q) => ({
      prompt: q.prompt.slice(0, 2000),
      options: q.options.map((o) => o.slice(0, 500)),
      correctIndex: q.correct,
      explanation: q.explanation?.slice(0, 2000) ?? null,
    }));
}

export async function addQuestions(
  quizId: string,
  list: Awaited<ReturnType<typeof draftQuestions>>,
) {
  if (list.length === 0) return;
  await batchAll(
    list.map((q, i) =>
      db.insert(quizQuestions).values({
        id: crypto.randomUUID(),
        quizId,
        seq: sql`(select coalesce(max(seq), 0) + ${i + 1} from quiz_questions where quiz_id = ${quizId})`,
        ...q,
      }),
    ),
  );
}

/** A new attempt: the questions without their answers. */
export async function startAttempt(userId: string, quizId: string) {
  const quiz = await getQuiz(userId, quizId);
  if (!quiz) return null;
  const questions = await db
    .select({
      id: quizQuestions.id,
      prompt: quizQuestions.prompt,
      options: quizQuestions.options,
    })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(asc(quizQuestions.seq));
  if (questions.length === 0) return { quiz, attemptId: null, questions };
  const attemptId = crypto.randomUUID();
  await db.insert(quizAttempts).values({
    id: attemptId,
    quizId,
    ownerId: userId,
    total: questions.length,
    startedAt: sqliteTime(new Date()),
  });
  return { quiz, attemptId, questions };
}

async function openAttempt(userId: string, attemptId: string) {
  const [attempt] = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.ownerId, userId)));
  return attempt ?? null;
}

/** Records one answer, once, and says whether it was right. */
export async function answer(userId: string, input: z.infer<typeof answerInput>) {
  const attempt = await openAttempt(userId, input.attemptId);
  if (!attempt) return null;
  if (attempt.finishedAt) throw new Error("This attempt is finished.");
  const [question] = await db
    .select()
    .from(quizQuestions)
    .where(
      and(eq(quizQuestions.id, input.questionId), eq(quizQuestions.quizId, attempt.quizId)),
    );
  if (!question) return null;
  const correct = input.choice === question.correctIndex;
  const inserted = await db
    .insert(quizAnswers)
    .values({
      id: crypto.randomUUID(),
      attemptId: attempt.id,
      questionId: question.id,
      choice: input.choice,
      correct,
      seq: sql`(select count(*) + 1 from quiz_answers where attempt_id = ${attempt.id})`,
    })
    .onConflictDoNothing()
    .returning({ id: quizAnswers.id });
  if (inserted.length === 0) throw new Error("That question is already answered.");
  return {
    correct,
    correctIndex: question.correctIndex,
    explanation: question.explanation,
  };
}

const XP_PER_RIGHT: Record<Difficulty, number> = { easy: 5, medium: 10, hard: 15 };

/** Scores the attempt from its recorded answers; once. */
export async function finish(userId: string, attemptId: string) {
  const attempt = await openAttempt(userId, attemptId);
  if (!attempt) return null;
  const quiz = await getQuiz(userId, attempt.quizId);
  if (!quiz) return null;
  if (!attempt.finishedAt) {
    const answers = await db
      .select({ correct: quizAnswers.correct })
      .from(quizAnswers)
      .where(eq(quizAnswers.attemptId, attemptId))
      .orderBy(asc(quizAnswers.seq));
    let streak = 0;
    let best = 0;
    for (const a of answers) {
      streak = a.correct ? streak + 1 : 0;
      best = Math.max(best, streak);
    }
    const score = answers.filter((a) => a.correct).length;
    const now = new Date();
    const seconds = Math.max(
      0,
      Math.round((now.getTime() - Date.parse(`${attempt.startedAt.replace(" ", "T")}Z`)) / 1000),
    );
    const xp = score * XP_PER_RIGHT[quiz.difficulty] + best * 2;
    // XP first, only while the attempt is still open, then close it: one batch.
    await db.batch([
      addXp(userId, xp, sql`exists (select 1 from quiz_attempts where id = ${attemptId} and finished_at is null)`),
      db
        .update(quizAttempts)
        .set({ finishedAt: sqliteTime(now), score, bestStreak: best, seconds, xp })
        .where(and(eq(quizAttempts.id, attemptId), sql`${quizAttempts.finishedAt} is null`)),
    ]);
  }
  return attemptResult(userId, attemptId);
}

export async function attemptResult(userId: string, attemptId: string) {
  const attempt = await openAttempt(userId, attemptId);
  if (!attempt || !attempt.finishedAt) return null;
  const quiz = await getQuiz(userId, attempt.quizId);
  if (!quiz) return null;
  const review = await db
    .select({
      id: quizQuestions.id,
      prompt: quizQuestions.prompt,
      options: quizQuestions.options,
      correctIndex: quizQuestions.correctIndex,
      explanation: quizQuestions.explanation,
      choice: quizAnswers.choice,
    })
    .from(quizQuestions)
    .leftJoin(
      quizAnswers,
      and(eq(quizAnswers.questionId, quizQuestions.id), eq(quizAnswers.attemptId, attemptId)),
    )
    .where(eq(quizQuestions.quizId, attempt.quizId))
    .orderBy(asc(quizQuestions.seq));
  return {
    quiz,
    score: attempt.score ?? 0,
    total: attempt.total,
    bestStreak: attempt.bestStreak ?? 0,
    seconds: attempt.seconds ?? 0,
    xp: attempt.xp ?? 0,
    review,
  };
}

/** A new quiz one level harder on the same topic, filled by AI when it can be. */
export function harder(difficulty: Difficulty): Difficulty {
  return difficulty === "easy" ? "medium" : "hard";
}
