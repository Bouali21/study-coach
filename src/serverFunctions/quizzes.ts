import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { aiResult } from "@/server/ai";
import * as quizzes from "@/server/quizzes";
import { idInput } from "@/server/subjects";
import { found, memberId } from "./member";

export const getQuizPage = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await quizzes.quizPage(await memberId(context.user), data.id)),
  );

export const createQuiz = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => quizzes.createQuizInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await quizzes.createQuiz(await memberId(context.user), data)),
  );

export const deleteQuiz = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await quizzes.deleteQuiz(await memberId(context.user), data.id)),
  );

export const saveQuestion = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => quizzes.questionInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await quizzes.saveQuestion(await memberId(context.user), data)),
  );

export const deleteQuestion = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => quizzes.questionRef.parse(data))
  .handler(async ({ data, context }) =>
    found(await quizzes.deleteQuestion(await memberId(context.user), data)),
  );

export const generateQuestions = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => quizzes.generateQuizInput.parse(data))
  .handler(async ({ data, context }) => {
    const quiz = found(await quizzes.getQuiz(await memberId(context.user), data.quizId));
    return aiResult(async () => {
      const list = await quizzes.draftQuestions(quiz.subject, quiz.topic, quiz.difficulty, data.source);
      await quizzes.addQuestions(quiz.id, list);
      return list.length;
    });
  });

export const startQuiz = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await quizzes.startAttempt(await memberId(context.user), data.id)),
  );

export const answerQuestion = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => quizzes.answerInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await quizzes.answer(await memberId(context.user), data)),
  );

export const finishQuiz = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ attemptId: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) =>
    found(await quizzes.finish(await memberId(context.user), data.attemptId)),
  );

/** A new quiz one level harder on the same topic; AI fills it when it can. */
export const tryHarder = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = await memberId(context.user);
    const quiz = found(await quizzes.getQuiz(userId, data.id));
    const difficulty = quizzes.harder(quiz.difficulty);
    const created = found(
      await quizzes.createQuiz(userId, { subjectId: quiz.subjectId, topic: quiz.topic, difficulty }),
    );
    const filled = await aiResult(async () => {
      await quizzes.addQuestions(
        created.id,
        await quizzes.draftQuestions(quiz.subject, quiz.topic, difficulty),
      );
    });
    return { id: created.id, aiSetup: filled.ok ? null : filled.setup };
  });
