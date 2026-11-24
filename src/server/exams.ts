import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { batchAll, db } from "@/db";
import {
  examAnswers,
  examAttempts,
  examQuestions,
  exams,
  subjects,
} from "@/db/schema";
import { AiUnavailable, completeJson } from "./ai";
import { sqliteTime } from "./schedule";
import { addXp } from "./users";

export const createExamInput = z.object({
  subjectId: z.string().min(1),
  title: z.string().trim().min(1, "Give the exam a title").max(120),
  minutes: z.number().int().min(1, "At least 1 minute").max(600),
});
export const examQuestionInput = z
  .object({
    examId: z.string().min(1),
    id: z.string().optional(),
    section: z.string().trim().min(1, "Name the section").max(80),
    kind: z.enum(["mc", "written"]),
    prompt: z.string().trim().min(1, "Write the question").max(4000),
    options: z.array(z.string().trim().min(1, "Fill in every option").max(500)).max(6).optional(),
    correctIndex: z.number().int().min(0).optional(),
    modelAnswer: z.string().trim().max(4000).optional(),
    points: z.number().int().min(1, "At least 1 point").max(100),
  })
  .refine(
    (q) =>
      q.kind === "written" ||
      (q.options !== undefined &&
        q.options.length >= 2 &&
        q.correctIndex !== undefined &&
        q.correctIndex < q.options.length),
    "Give at least two options and pick the right one",
  )
  .refine((q) => q.kind === "mc" || Boolean(q.modelAnswer), "Write a model answer");
export const examQuestionRef = z.object({ examId: z.string().min(1), id: z.string().min(1) });
export const generateExamInput = z.object({
  examId: z.string().min(1),
  source: z.string().trim().max(5000).optional(),
});
export const saveAnswerInput = z.object({
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  choice: z.number().int().min(0).max(5).nullable().optional(),
  text: z.string().max(10000).nullable().optional(),
});
export const submitInput = z.object({
  attemptId: z.string().min(1),
  answers: z.array(saveAnswerInput.omit({ attemptId: true })).max(200).optional(),
});
export const selfMarkInput = z.object({
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  awarded: z.number().int().min(0).max(100),
});

/** Answers saved this long after the deadline still count: the request was on its way. */
const GRACE_SECONDS = 2;

export async function getExam(userId: string, id: string) {
  const [row] = await db
    .select({
      id: exams.id,
      title: exams.title,
      minutes: exams.minutes,
      subjectId: exams.subjectId,
      subject: subjects.name,
    })
    .from(exams)
    .innerJoin(subjects, eq(subjects.id, exams.subjectId))
    .where(and(eq(exams.id, id), eq(exams.ownerId, userId)));
  return row ?? null;
}

const scoreOf = sql<number>`(select coalesce(sum(awarded), 0) from exam_answers a where a.attempt_id = "exam_attempts"."id")`;

export async function examPage(userId: string, id: string) {
  const exam = await getExam(userId, id);
  if (!exam) return null;
  const [questions, attempts] = await Promise.all([
    db
      .select()
      .from(examQuestions)
      .where(eq(examQuestions.examId, id))
      .orderBy(asc(examQuestions.seq)),
    db
      .select({
        id: examAttempts.id,
        startedAt: examAttempts.startedAt,
        submittedAt: examAttempts.submittedAt,
        timedOut: examAttempts.timedOut,
        maxScore: examAttempts.maxScore,
        score: scoreOf,
      })
      .from(examAttempts)
      .where(eq(examAttempts.examId, id))
      .orderBy(desc(examAttempts.startedAt)),
  ]);
  return { exam, questions, attempts };
}

export async function createExam(userId: string, input: z.infer<typeof createExamInput>) {
  const [subject] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, input.subjectId), eq(subjects.ownerId, userId)));
  if (!subject) return null;
  const id = crypto.randomUUID();
  await db.insert(exams).values({
    id,
    ownerId: userId,
    subjectId: subject.id,
    title: input.title,
    minutes: input.minutes,
  });
  return { id };
}

export async function deleteExam(userId: string, id: string) {
  const [row] = await db
    .delete(exams)
    .where(and(eq(exams.id, id), eq(exams.ownerId, userId)))
    .returning({ id: exams.id, subjectId: exams.subjectId });
  return row ?? null;
}

function questionValues(q: Omit<z.infer<typeof examQuestionInput>, "examId" | "id">) {
  return {
    section: q.section,
    kind: q.kind,
    prompt: q.prompt,
    options: q.kind === "mc" ? (q.options ?? []) : null,
    correctIndex: q.kind === "mc" ? (q.correctIndex ?? 0) : null,
    modelAnswer: q.modelAnswer || null,
    points: q.points,
  };
}

export async function saveExamQuestion(
  userId: string,
  input: z.infer<typeof examQuestionInput>,
) {
  if (!(await getExam(userId, input.examId))) return null;
  const values = questionValues(input);
  if (input.id) {
    const [row] = await db
      .update(examQuestions)
      .set(values)
      .where(and(eq(examQuestions.id, input.id), eq(examQuestions.examId, input.examId)))
      .returning({ id: examQuestions.id });
    return row ?? null;
  }
  const id = crypto.randomUUID();
  await db.insert(examQuestions).values({
    id,
    examId: input.examId,
    seq: sql`(select coalesce(max(seq), 0) + 1 from exam_questions where exam_id = ${input.examId})`,
    ...values,
  });
  return { id };
}

export async function deleteExamQuestion(
  userId: string,
  input: z.infer<typeof examQuestionRef>,
) {
  if (!(await getExam(userId, input.examId))) return null;
  const [row] = await db
    .delete(examQuestions)
    .where(and(eq(examQuestions.id, input.id), eq(examQuestions.examId, input.examId)))
    .returning({ id: examQuestions.id });
  return row ?? null;
}

const generatedExam = z.object({
  sections: z
    .array(
      z.object({
        name: z.string().min(1),
        questions: z
          .array(
            z.object({
              kind: z.enum(["mc", "written"]),
              prompt: z.string().min(1),
              options: z.array(z.string().min(1)).max(6).optional(),
              correct: z.number().int().min(0).optional(),
              modelAnswer: z.string().optional(),
              points: z.number().int().min(1).max(100),
            }),
          )
          .min(1),
      }),
    )
    .min(1)
    .max(8),
});

/** Adds AI-written sections to the exam. */
export async function generateExam(
  userId: string,
  input: z.infer<typeof generateExamInput>,
) {
  const exam = await getExam(userId, input.examId);
  if (!exam) return null;
  const { sections } = await completeJson(
    "exam",
    `Write a practice exam for ${exam.subject} that a student can finish in ${exam.minutes} minutes: 2 or 3 sections mixing multiple-choice questions (kind "mc", 3-4 options, zero-based "correct") and written questions (kind "written" with a "modelAnswer"), each with "points". Shape: {"sections":[{"name":"...","questions":[{"kind":"mc","prompt":"...","options":["..."],"correct":0,"points":1},{"kind":"written","prompt":"...","modelAnswer":"...","points":4}]}]}`,
    input.source?.trim() ? `Topics: ${input.source}` : `Exam: ${exam.title}`,
    generatedExam,
  );
  const rows = sections.flatMap((section) =>
    section.questions
      .filter(
        (q) =>
          q.kind === "written" ||
          (q.options && q.options.length >= 2 && (q.correct ?? 0) < q.options.length),
      )
      .map((q) =>
        questionValues({
          section: section.name.slice(0, 80),
          kind: q.kind,
          prompt: q.prompt.slice(0, 4000),
          options: q.options?.map((o) => o.slice(0, 500)),
          correctIndex: q.correct ?? 0,
          modelAnswer: q.modelAnswer?.slice(0, 4000) || (q.kind === "written" ? "-" : undefined),
          points: q.points,
        }),
      ),
  );
  if (rows.length === 0) return { added: 0 };
  await batchAll(
    rows.map((values, i) =>
      db.insert(examQuestions).values({
        id: crypto.randomUUID(),
        examId: exam.id,
        seq: sql`(select coalesce(max(seq), 0) + ${i + 1} from exam_questions where exam_id = ${exam.id})`,
        ...values,
      }),
    ),
  );
  return { added: rows.length };
}

export async function startExamAttempt(userId: string, examId: string) {
  const exam = await getExam(userId, examId);
  if (!exam) return null;
  const [totals] = await db
    .select({ count: sql<number>`count(*)`, points: sql<number>`coalesce(sum(points), 0)` })
    .from(examQuestions)
    .where(eq(examQuestions.examId, examId));
  if (!totals || Number(totals.count) === 0) throw new Error("Add a question first.");
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(examAttempts).values({
    id,
    examId,
    ownerId: userId,
    startedAt: sqliteTime(now),
    deadlineAt: sqliteTime(new Date(now.getTime() + exam.minutes * 60_000)),
    maxScore: Number(totals.points),
  });
  return { id };
}

async function ownAttempt(userId: string, attemptId: string) {
  const [row] = await db
    .select()
    .from(examAttempts)
    .where(and(eq(examAttempts.id, attemptId), eq(examAttempts.ownerId, userId)));
  return row ?? null;
}

const parseTime = (text: string) => Date.parse(`${text.replace(" ", "T")}Z`);

function isOpen(attempt: { submittedAt: string | null; deadlineAt: string }, now = Date.now()) {
  return !attempt.submittedAt && now <= parseTime(attempt.deadlineAt) + GRACE_SECONDS * 1000;
}

function answerUpsert(attemptId: string, a: { questionId: string; choice?: number | null; text?: string | null }) {
  return db
    .insert(examAnswers)
    .values({
      id: crypto.randomUUID(),
      attemptId,
      questionId: a.questionId,
      choice: a.choice ?? null,
      text: a.text ?? null,
    })
    .onConflictDoUpdate({
      target: [examAnswers.attemptId, examAnswers.questionId],
      set: { choice: a.choice ?? null, text: a.text ?? null },
    });
}

/** Saves one answer while the attempt is open; refused after submit or time-up. */
export async function saveAnswer(userId: string, input: z.infer<typeof saveAnswerInput>) {
  const attempt = await ownAttempt(userId, input.attemptId);
  if (!attempt) return null;
  if (!isOpen(attempt)) throw new Error("Time is up: this attempt takes no more answers.");
  const [question] = await db
    .select({ id: examQuestions.id })
    .from(examQuestions)
    .where(and(eq(examQuestions.id, input.questionId), eq(examQuestions.examId, attempt.examId)));
  if (!question) return null;
  await answerUpsert(attempt.id, input);
  return { saved: true };
}

async function gradeWritten(
  subject: string,
  q: { prompt: string; modelAnswer: string | null; points: number },
  text: string,
) {
  const graded = await completeJson(
    "grade",
    `Mark a student's written answer in ${subject} out of ${q.points} points against the model answer. Give "awarded" (whole number from 0 to ${q.points}) and one or two sentences of "feedback" to the student. Shape: {"awarded":0,"feedback":"..."}`,
    `Question: ${q.prompt}\nModel answer: ${q.modelAnswer ?? ""}\nStudent answer: ${text}`,
    z.object({ awarded: z.number(), feedback: z.string() }),
  );
  return {
    awarded: Math.max(0, Math.min(q.points, Math.round(graded.awarded))),
    feedback: graded.feedback.slice(0, 2000),
  };
}

/** Marks the attempt once: multiple choice by key, written by AI when it can. */
async function finalize(userId: string, attemptId: string, timedOut: boolean) {
  const attempt = await ownAttempt(userId, attemptId);
  if (!attempt || attempt.submittedAt) return;
  const exam = await getExam(userId, attempt.examId);
  if (!exam) return;
  const rows = await db
    .select({
      question: examQuestions,
      choice: examAnswers.choice,
      text: examAnswers.text,
    })
    .from(examQuestions)
    .leftJoin(
      examAnswers,
      and(eq(examAnswers.questionId, examQuestions.id), eq(examAnswers.attemptId, attemptId)),
    )
    .where(eq(examQuestions.examId, attempt.examId));
  let aiOff = false;
  const grades: { questionId: string; awarded: number | null; feedback: string | null }[] = [];
  for (const { question: q, choice, text } of rows) {
    if (q.kind === "mc") {
      grades.push({ questionId: q.id, awarded: choice === q.correctIndex ? q.points : 0, feedback: null });
    } else if (!text?.trim()) {
      grades.push({ questionId: q.id, awarded: 0, feedback: null });
    } else if (aiOff) {
      grades.push({ questionId: q.id, awarded: null, feedback: null });
    } else {
      try {
        grades.push({ questionId: q.id, ...(await gradeWritten(exam.subject, q, text)) });
      } catch (error) {
        if (!(error instanceof AiUnavailable)) console.error("grading failed", error);
        aiOff = true;
        grades.push({ questionId: q.id, awarded: null, feedback: null });
      }
    }
  }
  const awardedNow = grades.reduce((sum, g) => sum + (g.awarded ?? 0), 0);
  const xp = 10 + awardedNow;
  const open = sql`exists (select 1 from exam_attempts where id = ${attemptId} and submitted_at is null)`;
  await db.batch([
    addXp(userId, xp, open),
    ...grades.map((g) =>
      db
        .insert(examAnswers)
        .values({ id: crypto.randomUUID(), attemptId, questionId: g.questionId, awarded: g.awarded, feedback: g.feedback })
        .onConflictDoUpdate({
          target: [examAnswers.attemptId, examAnswers.questionId],
          set: { awarded: g.awarded, feedback: g.feedback },
          setWhere: open,
        }),
    ),
    db
      .update(examAttempts)
      .set({ submittedAt: sqliteTime(new Date()), timedOut, xp })
      .where(and(eq(examAttempts.id, attemptId), isNull(examAttempts.submittedAt))),
  ]);
}

export async function submitExam(userId: string, input: z.infer<typeof submitInput>) {
  const attempt = await ownAttempt(userId, input.attemptId);
  if (!attempt) return null;
  if (attempt.submittedAt) return { id: attempt.id };
  const open = isOpen(attempt);
  if (open && input.answers?.length) {
    const ids = new Set(
      (
        await db
          .select({ id: examQuestions.id })
          .from(examQuestions)
          .where(eq(examQuestions.examId, attempt.examId))
      ).map((q) => q.id),
    );
    const valid = input.answers.filter((a) => ids.has(a.questionId));
    if (valid.length)
      await batchAll(
        valid.map((a) => answerUpsert(attempt.id, a)),
      );
  }
  await finalize(userId, attempt.id, !open);
  return { id: attempt.id };
}

/** Taking: questions without keys. Done: the marked review. Past its deadline it submits itself. */
export async function attemptView(userId: string, attemptId: string) {
  let attempt = await ownAttempt(userId, attemptId);
  if (!attempt) return null;
  if (!attempt.submittedAt && !isOpen(attempt)) {
    await finalize(userId, attemptId, true);
    attempt = (await ownAttempt(userId, attemptId))!;
  }
  const exam = await getExam(userId, attempt.examId);
  if (!exam) return null;
  const rows = await db
    .select({
      question: examQuestions,
      choice: examAnswers.choice,
      text: examAnswers.text,
      awarded: examAnswers.awarded,
      feedback: examAnswers.feedback,
    })
    .from(examQuestions)
    .leftJoin(
      examAnswers,
      and(eq(examAnswers.questionId, examQuestions.id), eq(examAnswers.attemptId, attemptId)),
    )
    .where(eq(examQuestions.examId, attempt.examId))
    .orderBy(asc(examQuestions.seq));
  if (!attempt.submittedAt) {
    return {
      state: "open" as const,
      exam,
      attemptId,
      deadlineAt: parseTime(attempt.deadlineAt),
      serverNow: Date.now(),
      questions: rows.map(({ question: q, choice, text }) => ({
        id: q.id,
        section: q.section,
        kind: q.kind,
        prompt: q.prompt,
        options: q.options,
        points: q.points,
        choice,
        text,
      })),
    };
  }
  const score = rows.reduce((sum, r) => sum + (r.awarded ?? 0), 0);
  return {
    state: "done" as const,
    exam,
    attemptId,
    timedOut: attempt.timedOut,
    score,
    maxScore: attempt.maxScore,
    questions: rows.map(({ question: q, ...answer }) => ({
      id: q.id,
      section: q.section,
      kind: q.kind,
      prompt: q.prompt,
      options: q.options,
      correctIndex: q.correctIndex,
      modelAnswer: q.modelAnswer,
      points: q.points,
      ...answer,
    })),
  };
}

/** The member marks a written answer the AI didn't, once, after submitting. */
export async function selfMark(userId: string, input: z.infer<typeof selfMarkInput>) {
  const attempt = await ownAttempt(userId, input.attemptId);
  if (!attempt?.submittedAt) return null;
  const [question] = await db
    .select({ points: examQuestions.points, kind: examQuestions.kind })
    .from(examQuestions)
    .where(and(eq(examQuestions.id, input.questionId), eq(examQuestions.examId, attempt.examId)));
  if (!question || question.kind !== "written") return null;
  const awarded = Math.min(question.points, input.awarded);
  const [row] = await db
    .update(examAnswers)
    .set({ awarded })
    .where(
      and(
        eq(examAnswers.attemptId, attempt.id),
        eq(examAnswers.questionId, input.questionId),
        isNull(examAnswers.awarded),
      ),
    )
    .returning({ id: examAnswers.id });
  return row ? { awarded } : null;
}
