import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  cards,
  decks,
  exams,
  examAttempts,
  planItems,
  plans,
  quizAttempts,
  quizzes,
  subjects,
  users,
} from "@/db/schema";

export const subjectInput = z.object({
  name: z.string().trim().min(1, "Give the subject a name").max(80),
  label: z.string().trim().max(80).optional(),
});
export const idInput = z.object({ id: z.string().min(1) });
export const renameInput = subjectInput.extend({ id: z.string().min(1) });

export function listSubjects(userId: string) {
  return db
    .select({ id: subjects.id, name: subjects.name, label: subjects.label })
    .from(subjects)
    .where(eq(subjects.ownerId, userId))
    .orderBy(subjects.name);
}

export async function getSubject(userId: string, id: string) {
  const [row] = await db
    .select({ id: subjects.id, name: subjects.name, label: subjects.label })
    .from(subjects)
    .where(and(eq(subjects.id, id), eq(subjects.ownerId, userId)));
  return row ?? null;
}

export async function createSubject(
  userId: string,
  input: z.infer<typeof subjectInput>,
) {
  const id = crypto.randomUUID();
  await db
    .insert(subjects)
    .values({ id, ownerId: userId, name: input.name, label: input.label || null });
  return { id };
}

export async function renameSubject(
  userId: string,
  input: z.infer<typeof renameInput>,
) {
  const [row] = await db
    .update(subjects)
    .set({ name: input.name, label: input.label || null })
    .where(and(eq(subjects.id, input.id), eq(subjects.ownerId, userId)))
    .returning({ id: subjects.id });
  return row ?? null;
}

/** Deletes the subject and, through the foreign keys, all its material. */
export async function deleteSubject(userId: string, id: string) {
  const [row] = await db
    .delete(subjects)
    .where(and(eq(subjects.id, id), eq(subjects.ownerId, userId)))
    .returning({ id: subjects.id });
  return row ?? null;
}

/** What the subject page lists: its decks, quizzes, exams and plans. */
export async function subjectMaterial(userId: string, subjectId: string) {
  const [deckRows, quizRows, examRows, planRows] = await Promise.all([
    db
      .select({
        id: decks.id,
        title: decks.title,
        cards: sql<number>`(select count(*) from cards where cards.deck_id = "decks"."id")`,
        due: sql<number>`(select count(*) from cards where cards.deck_id = "decks"."id" and cards.due_at <= datetime('now'))`,
      })
      .from(decks)
      .where(and(eq(decks.ownerId, userId), eq(decks.subjectId, subjectId)))
      .orderBy(desc(decks.createdAt)),
    db
      .select({
        id: quizzes.id,
        topic: quizzes.topic,
        difficulty: quizzes.difficulty,
        questions: sql<number>`(select count(*) from quiz_questions q where q.quiz_id = "quizzes"."id")`,
      })
      .from(quizzes)
      .where(and(eq(quizzes.ownerId, userId), eq(quizzes.subjectId, subjectId)))
      .orderBy(desc(quizzes.createdAt)),
    db
      .select({ id: exams.id, title: exams.title, minutes: exams.minutes })
      .from(exams)
      .where(and(eq(exams.ownerId, userId), eq(exams.subjectId, subjectId)))
      .orderBy(desc(exams.createdAt)),
    db
      .select({
        id: plans.id,
        examDate: plans.examDate,
        total: sql<number>`(select count(*) from plan_items i where i.plan_id = "plans"."id")`,
        done: sql<number>`(select count(*) from plan_items i where i.plan_id = "plans"."id" and i.done_at is not null)`,
      })
      .from(plans)
      .where(and(eq(plans.ownerId, userId), eq(plans.subjectId, subjectId)))
      .orderBy(plans.examDate),
  ]);
  return { decks: deckRows, quizzes: quizRows, exams: examRows, plans: planRows };
}

/** The home page: subjects, what's due, today's plan, recent scores, XP. */
export async function dashboard(userId: string, today: string) {
  const [subjectRows, user, due, todayRows, quizScores, examScores] =
    await Promise.all([
      db
        .select({
          id: subjects.id,
          name: subjects.name,
          label: subjects.label,
          due: sql<number>`(select count(*) from cards c join decks d on d.id = c.deck_id where d.subject_id = "subjects"."id" and c.due_at <= datetime('now'))`,
        })
        .from(subjects)
        .where(eq(subjects.ownerId, userId))
        .orderBy(subjects.name),
      db.select({ xp: users.xp }).from(users).where(eq(users.id, userId)),
      db
        .select({ deckId: decks.id, title: decks.title, due: sql<number>`count(*)` })
        .from(cards)
        .innerJoin(decks, eq(decks.id, cards.deckId))
        .where(and(eq(decks.ownerId, userId), lte(cards.dueAt, sql`datetime('now')`)))
        .groupBy(decks.id),
      db
        .select({
          id: planItems.id,
          planId: plans.id,
          topic: planItems.topic,
          kind: planItems.kind,
          date: planItems.date,
          subject: subjects.name,
        })
        .from(planItems)
        .innerJoin(plans, eq(plans.id, planItems.planId))
        .innerJoin(subjects, eq(subjects.id, plans.subjectId))
        .where(
          and(
            eq(plans.ownerId, userId),
            isNull(planItems.doneAt),
            lte(planItems.date, today),
          ),
        )
        .orderBy(planItems.date, planItems.seq)
        .limit(12),
      db
        .select({
          id: quizAttempts.id,
          parentId: quizzes.id,
          title: quizzes.topic,
          score: quizAttempts.score,
          max: quizAttempts.total,
          at: quizAttempts.finishedAt,
        })
        .from(quizAttempts)
        .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
        .where(
          and(
            eq(quizAttempts.ownerId, userId),
            sql`${quizAttempts.finishedAt} is not null`,
          ),
        )
        .orderBy(desc(quizAttempts.finishedAt))
        .limit(5),
      db
        .select({
          id: examAttempts.id,
          parentId: exams.id,
          title: exams.title,
          score: sql<number>`(select coalesce(sum(awarded), 0) from exam_answers a where a.attempt_id = "exam_attempts"."id")`,
          max: examAttempts.maxScore,
          at: examAttempts.submittedAt,
        })
        .from(examAttempts)
        .innerJoin(exams, eq(exams.id, examAttempts.examId))
        .where(
          and(
            eq(examAttempts.ownerId, userId),
            sql`${examAttempts.submittedAt} is not null`,
          ),
        )
        .orderBy(desc(examAttempts.submittedAt))
        .limit(5),
    ]);
  const scores = [
    ...quizScores.map((s) => ({ ...s, kind: "quiz" as const })),
    ...examScores.map((s) => ({ ...s, kind: "exam" as const })),
  ]
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, 6);
  return {
    subjects: subjectRows,
    xp: user[0]?.xp ?? 0,
    due,
    dueTotal: due.reduce((sum, d) => sum + Number(d.due), 0),
    today: todayRows,
    scores,
  };
}
