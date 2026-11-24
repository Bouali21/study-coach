import { and, asc, eq, gte, isNull, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { decks, planItems, plans, quizzes, subjects } from "@/db/schema";
import { completeJson } from "./ai";
import { daysBetween, planItems as spread } from "./planDays";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const topicList = z
  .array(z.string().trim().min(1).max(120))
  .min(1, "List at least one topic")
  .max(40, "40 topics at most");
export const planInput = z.object({
  subjectId: z.string().min(1),
  today: day,
  examDate: day,
  topics: topicList,
});
export const editPlanInput = z.object({
  id: z.string().min(1),
  today: day,
  examDate: day,
  topics: topicList,
});
export const toggleInput = z.object({ id: z.string().min(1), done: z.boolean() });
export const noteInput = z.object({ id: z.string().min(1), note: z.string().max(10000) });
export const suggestInput = z.object({
  subjectId: z.string().min(1),
  hint: z.string().trim().max(2000).optional(),
});
export const openInput = z.object({ id: z.string().min(1) });

/**
 * The member's today, from their browser, held to within a day of the
 * server's so it can't be moved into the past.
 */
export function checkToday(today: string): string {
  const server = new Date().toISOString().slice(0, 10);
  if (Math.abs(daysBetween(server, today)) > 1) throw new Error("Your device's date looks wrong.");
  return today;
}

function checkExamDate(today: string, examDate: string) {
  if (daysBetween(today, examDate) < 0) throw new Error("The exam date can't be in the past.");
  if (daysBetween(today, examDate) > 365) throw new Error("Pick an exam date within a year.");
}

function clean(topics: string[]) {
  return [...new Set(topics.map((t) => t.trim()).filter(Boolean))];
}

export async function getPlan(userId: string, id: string) {
  const [row] = await db
    .select({
      id: plans.id,
      examDate: plans.examDate,
      topics: plans.topics,
      subjectId: plans.subjectId,
      subject: subjects.name,
    })
    .from(plans)
    .innerJoin(subjects, eq(subjects.id, plans.subjectId))
    .where(and(eq(plans.id, id), eq(plans.ownerId, userId)));
  return row ?? null;
}

export async function planPage(userId: string, id: string) {
  const plan = await getPlan(userId, id);
  if (!plan) return null;
  const items = await db
    .select({
      id: planItems.id,
      date: planItems.date,
      topic: planItems.topic,
      kind: planItems.kind,
      done: sql<boolean>`${planItems.doneAt} is not null`,
      note: planItems.note,
    })
    .from(planItems)
    .where(eq(planItems.planId, id))
    .orderBy(asc(planItems.date), asc(planItems.seq));
  return { plan, items: items.map((i) => ({ ...i, done: Boolean(i.done) })) };
}

function itemRows(planId: string, list: ReturnType<typeof spread>, offset = 0) {
  return list.map((item, i) =>
    db.insert(planItems).values({
      id: crypto.randomUUID(),
      planId,
      date: item.date,
      topic: item.topic,
      kind: item.kind,
      seq: offset + i,
    }),
  );
}

export async function createPlan(userId: string, input: z.infer<typeof planInput>) {
  const today = checkToday(input.today);
  checkExamDate(today, input.examDate);
  const [subject] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, input.subjectId), eq(subjects.ownerId, userId)));
  if (!subject) return null;
  const topics = clean(input.topics);
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(plans).values({ id, ownerId: userId, subjectId: subject.id, examDate: input.examDate, topics }),
    ...itemRows(id, spread(today, input.examDate, topics)),
  ]);
  return { id };
}

/**
 * New topics or date: days from today on are planned again; what's done
 * and what's overdue stays.
 */
export async function editPlan(userId: string, input: z.infer<typeof editPlanInput>) {
  const today = checkToday(input.today);
  checkExamDate(today, input.examDate);
  const plan = await getPlan(userId, input.id);
  if (!plan) return null;
  const topics = clean(input.topics);
  const done = await db
    .select({ date: planItems.date, topic: planItems.topic, kind: planItems.kind })
    .from(planItems)
    .where(and(eq(planItems.planId, plan.id), isNotNull(planItems.doneAt), gte(planItems.date, today)));
  const kept = new Set(done.map((d) => `${d.date}|${d.topic}|${d.kind}`));
  const fresh = spread(today, input.examDate, topics).filter(
    (item) => !kept.has(`${item.date}|${item.topic}|${item.kind}`),
  );
  const [{ max } = { max: 0 }] = await db
    .select({ max: sql<number>`coalesce(max(seq), 0)` })
    .from(planItems)
    .where(eq(planItems.planId, plan.id));
  await db.batch([
    db.update(plans).set({ examDate: input.examDate, topics }).where(eq(plans.id, plan.id)),
    db
      .delete(planItems)
      .where(and(eq(planItems.planId, plan.id), isNull(planItems.doneAt), gte(planItems.date, today))),
    ...itemRows(plan.id, fresh, Number(max) + 1),
  ]);
  return { id: plan.id };
}

export async function deletePlan(userId: string, id: string) {
  const [row] = await db
    .delete(plans)
    .where(and(eq(plans.id, id), eq(plans.ownerId, userId)))
    .returning({ id: plans.id, subjectId: plans.subjectId });
  return row ?? null;
}

async function ownItem(userId: string, itemId: string) {
  const [row] = await db
    .select({ item: planItems, subjectId: plans.subjectId })
    .from(planItems)
    .innerJoin(plans, eq(plans.id, planItems.planId))
    .where(and(eq(planItems.id, itemId), eq(plans.ownerId, userId)));
  return row ?? null;
}

export async function toggleItem(userId: string, input: z.infer<typeof toggleInput>) {
  const own = await ownItem(userId, input.id);
  if (!own) return null;
  await db
    .update(planItems)
    .set({ doneAt: input.done ? sql`(datetime('now'))` : null })
    .where(eq(planItems.id, own.item.id));
  return { id: own.item.id };
}

export async function saveNote(userId: string, input: z.infer<typeof noteInput>) {
  const own = await ownItem(userId, input.id);
  if (!own || own.item.kind !== "explain") return null;
  await db.update(planItems).set({ note: input.note }).where(eq(planItems.id, own.item.id));
  return { id: own.item.id };
}

/** The quiz or deck behind an activity: the linked one, else a new one, linked. */
export async function openActivity(userId: string, itemId: string) {
  const own = await ownItem(userId, itemId);
  if (!own || own.item.kind === "explain") return null;
  const { item, subjectId } = own;
  if (item.kind === "quiz") {
    if (item.linkedId) {
      const [quiz] = await db
        .select({ id: quizzes.id })
        .from(quizzes)
        .where(and(eq(quizzes.id, item.linkedId), eq(quizzes.ownerId, userId)));
      if (quiz) return { kind: "quiz" as const, id: quiz.id };
    }
    const id = crypto.randomUUID();
    await db.batch([
      db.insert(quizzes).values({ id, ownerId: userId, subjectId, topic: item.topic, difficulty: "medium" }),
      db.update(planItems).set({ linkedId: id }).where(eq(planItems.id, item.id)),
    ]);
    return { kind: "quiz" as const, id };
  }
  if (item.linkedId) {
    const [deck] = await db
      .select({ id: decks.id })
      .from(decks)
      .where(and(eq(decks.id, item.linkedId), eq(decks.ownerId, userId)));
    if (deck) return { kind: "deck" as const, id: deck.id };
  }
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(decks).values({ id, ownerId: userId, subjectId, title: item.topic }),
    db.update(planItems).set({ linkedId: id }).where(eq(planItems.id, item.id)),
  ]);
  return { kind: "deck" as const, id };
}

/** Topics the AI suggests for the subject. */
export async function suggestTopics(userId: string, input: z.infer<typeof suggestInput>) {
  const [subject] = await db
    .select({ name: subjects.name, label: subjects.label })
    .from(subjects)
    .where(and(eq(subjects.id, input.subjectId), eq(subjects.ownerId, userId)));
  if (!subject) return null;
  const { topics } = await completeJson(
    "topics",
    `List 4 to 8 topics a student should revise for this exam, each a few words. Shape: {"topics":["..."]}`,
    `Subject: ${subject.name}${subject.label ? ` (${subject.label})` : ""}${input.hint ? `\nNotes: ${input.hint}` : ""}`,
    z.object({ topics: z.array(z.string().min(1)).min(1).max(20) }),
  );
  return topics.map((t) => t.slice(0, 120));
}

