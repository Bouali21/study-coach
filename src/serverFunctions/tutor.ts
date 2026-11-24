import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { aiResult } from "@/server/ai";
import * as decks from "@/server/decks";
import * as quizzes from "@/server/quizzes";
import { getSubject, idInput, listSubjects } from "@/server/subjects";
import * as tutor from "@/server/tutor";
import { found, memberId } from "./member";

export const getTutorHome = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => {
    const userId = await memberId(context.user);
    const [chats, style, subjects] = await Promise.all([
      tutor.listChats(userId),
      tutor.getStyle(userId),
      listSubjects(userId),
    ]);
    return { chats, style, subjects };
  });

export const getChat = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = await memberId(context.user);
    const chat = found(await tutor.getChat(userId, data.id));
    return { ...chat, subjects: chat.chat.subjectId ? [] : await listSubjects(userId) };
  });

export const saveStyle = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => tutor.styleInput.parse(data))
  .handler(async ({ data, context }) =>
    tutor.saveStyle(await memberId(context.user), data),
  );

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => tutor.sendInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = await memberId(context.user);
    return aiResult(async () => found(await tutor.send(userId, data)));
  });

export const deleteChat = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await tutor.deleteChat(await memberId(context.user), data.id)),
  );

/** Turns the conversation into a quiz or a deck in its subject (or the one picked). */
export const chatToPractice = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) =>
    z
      .object({
        chatId: z.string().min(1),
        kind: z.enum(["quiz", "deck"]),
        subjectId: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const userId = await memberId(context.user);
    const { chat, messages } = found(await tutor.getChat(userId, data.chatId));
    const subjectId = chat.subjectId ?? data.subjectId;
    if (!subjectId) throw new Error("Pick a subject first.");
    const subject = found(await getSubject(userId, subjectId));
    const notes = tutor.transcript(messages);
    const topic = chat.title.slice(0, 120);
    return aiResult(async () => {
      if (data.kind === "deck") {
        const list = await decks.draftCards(notes, subject.name);
        const deck = found(await decks.createDeck(userId, { subjectId, title: topic }));
        await decks.addCards(deck.id, list);
        return { kind: "deck" as const, id: deck.id };
      }
      const list = await quizzes.draftQuestions(subject.name, topic, "medium", notes);
      const quiz = found(
        await quizzes.createQuiz(userId, { subjectId, topic, difficulty: "medium" }),
      );
      await quizzes.addQuestions(quiz.id, list);
      return { kind: "quiz" as const, id: quiz.id };
    });
  });
