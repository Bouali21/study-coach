import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { batchAll, db } from "@/db";
import { cards, deckReviews, decks, subjects } from "@/db/schema";
import { completeJson } from "./ai";
import { dueAfter, nextBox, reviewXp, sqliteTime } from "./schedule";
import { addXp } from "./users";

export const createDeckInput = z.object({
  subjectId: z.string().min(1),
  title: z.string().trim().min(1, "Give the deck a title").max(120),
});
export const cardInput = z.object({
  deckId: z.string().min(1),
  id: z.string().optional(),
  front: z.string().trim().min(1, "Write the front").max(2000),
  back: z.string().trim().min(1, "Write the back").max(4000),
});
export const cardRef = z.object({ deckId: z.string().min(1), id: z.string().min(1) });
export const generateInput = z.object({
  deckId: z.string().min(1),
  source: z.string().trim().min(1, "Give a topic or paste notes").max(20000),
});
export const reviewInput = z.object({
  deckId: z.string().min(1),
  results: z
    .array(z.object({ cardId: z.string().min(1), known: z.boolean() }))
    .min(1)
    .max(500),
  seconds: z.number().int().min(0).max(86_400),
});

/** The deck when it is the user's, with its subject's name. */
export async function getDeck(userId: string, id: string) {
  const [row] = await db
    .select({
      id: decks.id,
      title: decks.title,
      subjectId: decks.subjectId,
      subject: subjects.name,
    })
    .from(decks)
    .innerJoin(subjects, eq(subjects.id, decks.subjectId))
    .where(and(eq(decks.id, id), eq(decks.ownerId, userId)));
  return row ?? null;
}

export async function deckPage(userId: string, id: string) {
  const deck = await getDeck(userId, id);
  if (!deck) return null;
  const [cardRows, reviews] = await Promise.all([
    db
      .select({
        id: cards.id,
        front: cards.front,
        back: cards.back,
        box: cards.box,
        due: sql<number>`${cards.dueAt} <= datetime('now')`,
      })
      .from(cards)
      .where(eq(cards.deckId, id))
      .orderBy(asc(cards.seq)),
    db
      .select({
        id: deckReviews.id,
        known: deckReviews.known,
        total: deckReviews.total,
        seconds: deckReviews.seconds,
        xp: deckReviews.xp,
        at: deckReviews.createdAt,
      })
      .from(deckReviews)
      .where(eq(deckReviews.deckId, id))
      .orderBy(desc(deckReviews.createdAt))
      .limit(10),
  ]);
  return {
    deck,
    cards: cardRows.map((c) => ({ ...c, due: Boolean(c.due) })),
    reviews,
  };
}

export async function createDeck(
  userId: string,
  input: z.infer<typeof createDeckInput>,
) {
  const [subject] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, input.subjectId), eq(subjects.ownerId, userId)));
  if (!subject) return null;
  const id = crypto.randomUUID();
  await db
    .insert(decks)
    .values({ id, ownerId: userId, subjectId: subject.id, title: input.title });
  return { id };
}

export async function deleteDeck(userId: string, id: string) {
  const [row] = await db
    .delete(decks)
    .where(and(eq(decks.id, id), eq(decks.ownerId, userId)))
    .returning({ id: decks.id, subjectId: decks.subjectId });
  return row ?? null;
}

function nextSeq(deckId: string) {
  return sql<number>`(select coalesce(max(seq), 0) + 1 from cards where deck_id = ${deckId})`;
}

export async function saveCard(userId: string, input: z.infer<typeof cardInput>) {
  if (!(await getDeck(userId, input.deckId))) return null;
  if (input.id) {
    const [row] = await db
      .update(cards)
      .set({ front: input.front, back: input.back })
      .where(and(eq(cards.id, input.id), eq(cards.deckId, input.deckId)))
      .returning({ id: cards.id });
    return row ?? null;
  }
  const id = crypto.randomUUID();
  await db.insert(cards).values({
    id,
    deckId: input.deckId,
    front: input.front,
    back: input.back,
    seq: nextSeq(input.deckId),
  });
  return { id };
}

export async function deleteCard(userId: string, input: z.infer<typeof cardRef>) {
  if (!(await getDeck(userId, input.deckId))) return null;
  const [row] = await db
    .delete(cards)
    .where(and(eq(cards.id, input.id), eq(cards.deckId, input.deckId)))
    .returning({ id: cards.id });
  return row ?? null;
}

export async function addCards(
  deckId: string,
  list: { front: string; back: string }[],
) {
  if (list.length === 0) return;
  await batchAll(
    list.map((card, i) =>
      db.insert(cards).values({
        id: crypto.randomUUID(),
        deckId,
        front: card.front,
        back: card.back,
        seq: sql`(select coalesce(max(seq), 0) + ${i + 1} from cards where deck_id = ${deckId})`,
      }),
    ),
  );
}

const generatedCards = z.object({
  cards: z
    .array(z.object({ front: z.string().min(1), back: z.string().min(1) }))
    .min(1)
    .max(40),
});

/** Cards from a topic or notes; the caller adds them to a deck. */
export async function draftCards(source: string, subject: string) {
  const { cards: list } = await completeJson(
    "cards",
    `Write 6 to 12 flashcards for the subject "${subject}". Each has a short question or term on the front and a concise answer on the back. Shape: {"cards":[{"front":"...","back":"..."}]}`,
    source,
    generatedCards,
  );
  return list.map((c) => ({ front: c.front.slice(0, 2000), back: c.back.slice(0, 4000) }));
}

/**
 * Records a review: each card's box and due time, the review row and the
 * XP, in one batch.
 */
export async function recordReview(
  userId: string,
  input: z.infer<typeof reviewInput>,
) {
  if (!(await getDeck(userId, input.deckId))) return null;
  const ids = [...new Set(input.results.map((r) => r.cardId))];
  const owned = await db
    .select({ id: cards.id, box: cards.box })
    .from(cards)
    .where(and(eq(cards.deckId, input.deckId), inArray(cards.id, ids)));
  const boxes = new Map(owned.map((c) => [c.id, c.box]));
  const results = input.results.filter((r) => boxes.has(r.cardId));
  if (results.length === 0) return null;
  const now = new Date();
  const known = results.filter((r) => r.known).length;
  const xp = reviewXp(known, results.length - known);
  const updates = results.map((r) => {
    const box = nextBox(boxes.get(r.cardId)!, r.known);
    return db
      .update(cards)
      .set({ box, dueAt: dueAfter(box, r.known, now) })
      .where(eq(cards.id, r.cardId));
  });
  await db.batch([
    db.insert(deckReviews).values({
      id: crypto.randomUUID(),
      deckId: input.deckId,
      ownerId: userId,
      known,
      total: results.length,
      seconds: input.seconds,
      xp,
      createdAt: sqliteTime(now),
    }),
    addXp(userId, xp),
    ...updates,
  ]);
  return { known, total: results.length, xp, seconds: input.seconds };
}

/** Cards a review starts with: the due ones, or every card with `all`. */
export async function reviewCards(userId: string, deckId: string, all: boolean) {
  const deck = await getDeck(userId, deckId);
  if (!deck) return null;
  const rows = await db
    .select({ id: cards.id, front: cards.front, back: cards.back })
    .from(cards)
    .where(
      all
        ? eq(cards.deckId, deckId)
        : and(eq(cards.deckId, deckId), lte(cards.dueAt, sql`datetime('now')`)),
    )
    .orderBy(asc(cards.box), asc(cards.seq));
  return { deck, cards: rows };
}
