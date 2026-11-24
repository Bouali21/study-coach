import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { chatMessages, chats, subjects, users } from "@/db/schema";
import { complete, type ChatTurn } from "./ai";
import { emojis, tones, warmths } from "./users";

export const styleInput = z.object({
  tone: z.enum(tones),
  warmth: z.enum(warmths),
  emoji: z.enum(emojis),
});
export const sendInput = z.object({
  chatId: z.string().optional(),
  subjectId: z.string().optional(),
  content: z.string().trim().min(1, "Write a question").max(8000),
});

export async function saveStyle(userId: string, input: z.infer<typeof styleInput>) {
  await db.update(users).set(input).where(eq(users.id, userId));
  return input;
}

export async function getStyle(userId: string) {
  const [row] = await db
    .select({ tone: users.tone, warmth: users.warmth, emoji: users.emoji })
    .from(users)
    .where(eq(users.id, userId));
  return styleInput.parse(row ?? { tone: "friendly", warmth: "balanced", emoji: "some" });
}

export function listChats(userId: string) {
  return db
    .select({
      id: chats.id,
      title: chats.title,
      updatedAt: chats.updatedAt,
      subject: subjects.name,
    })
    .from(chats)
    .leftJoin(subjects, eq(subjects.id, chats.subjectId))
    .where(eq(chats.ownerId, userId))
    .orderBy(desc(chats.updatedAt), desc(chats.createdAt));
}

export async function getChat(userId: string, id: string) {
  const [chat] = await db
    .select({
      id: chats.id,
      title: chats.title,
      subjectId: chats.subjectId,
      subject: subjects.name,
    })
    .from(chats)
    .leftJoin(subjects, eq(subjects.id, chats.subjectId))
    .where(and(eq(chats.id, id), eq(chats.ownerId, userId)));
  if (!chat) return null;
  const messages = await db
    .select({ id: chatMessages.id, role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.chatId, id))
    .orderBy(asc(chatMessages.seq));
  return { chat, messages };
}

export async function deleteChat(userId: string, id: string) {
  const [row] = await db
    .delete(chats)
    .where(and(eq(chats.id, id), eq(chats.ownerId, userId)))
    .returning({ id: chats.id });
  return row ?? null;
}

const TONE = {
  friendly: "friendly and encouraging",
  relaxed: "relaxed and casual, like a classmate",
  direct: "direct and to the point, no small talk",
};
const WARMTH = {
  neutral: "neutral, matter-of-fact",
  balanced: "balanced",
  warm: "warm and supportive",
};
const EMOJI = {
  none: "Use no emojis.",
  some: "Use an emoji now and then.",
  lots: "Use plenty of emojis.",
};

export function systemPrompt(style: z.infer<typeof styleInput>, subject: string | null) {
  return [
    "You are a patient tutor for a school or university student.",
    subject ? `The conversation is about ${subject}.` : null,
    "Explain step by step: break the problem into numbered steps, show the working, and end with a short check the student can do themselves.",
    `Tone: ${style.tone} (${TONE[style.tone]}). Warmth: ${style.warmth} (${WARMTH[style.warmth]}). ${EMOJI[style.emoji]}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Asks the tutor. The question and the reply are stored together only once
 * the reply came back, so a refused call leaves nothing behind.
 */
export async function send(userId: string, input: z.infer<typeof sendInput>) {
  let chatId = input.chatId ?? null;
  let subjectId: string | null = null;
  let subjectName: string | null = null;
  let history: ChatTurn[] = [];
  if (chatId) {
    const existing = await getChat(userId, chatId);
    if (!existing) return null;
    subjectId = existing.chat.subjectId;
    subjectName = existing.chat.subject;
    history = existing.messages.map((m) => ({ role: m.role, content: m.content }));
  } else if (input.subjectId) {
    const [subject] = await db
      .select({ id: subjects.id, name: subjects.name })
      .from(subjects)
      .where(and(eq(subjects.id, input.subjectId), eq(subjects.ownerId, userId)));
    if (!subject) return null;
    subjectId = subject.id;
    subjectName = subject.name;
  }
  const style = await getStyle(userId);
  const reply = await complete([
    { role: "system", content: systemPrompt(style, subjectName) },
    ...history.slice(-30),
    { role: "user", content: input.content },
  ]);
  const seq = history.length;
  const message = (role: "user" | "assistant", content: string, n: number) =>
    db.insert(chatMessages).values({ id: crypto.randomUUID(), chatId: chatId!, role, content, seq: n });
  if (!chatId) {
    chatId = crypto.randomUUID();
    await db.batch([
      db.insert(chats).values({
        id: chatId,
        ownerId: userId,
        subjectId,
        title: input.content.slice(0, 80),
      }),
      message("user", input.content, 1),
      message("assistant", reply, 2),
    ]);
  } else {
    await db.batch([
      message("user", input.content, seq + 1),
      message("assistant", reply, seq + 2),
      db.update(chats).set({ updatedAt: sql`(datetime('now'))` }).where(eq(chats.id, chatId)),
    ]);
  }
  return { chatId };
}

/** The conversation as notes for generating a quiz or deck. */
export function transcript(messages: { role: string; content: string }[]) {
  return messages
    .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
    .join("\n\n")
    .slice(-12000);
}
