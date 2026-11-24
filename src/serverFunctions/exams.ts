import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { aiResult } from "@/server/ai";
import * as exams from "@/server/exams";
import { idInput } from "@/server/subjects";
import { found, memberId } from "./member";

export const getExamPage = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await exams.examPage(await memberId(context.user), data.id)),
  );

export const createExam = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => exams.createExamInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await exams.createExam(await memberId(context.user), data)),
  );

export const deleteExam = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await exams.deleteExam(await memberId(context.user), data.id)),
  );

export const saveExamQuestion = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => exams.examQuestionInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await exams.saveExamQuestion(await memberId(context.user), data)),
  );

export const deleteExamQuestion = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => exams.examQuestionRef.parse(data))
  .handler(async ({ data, context }) =>
    found(await exams.deleteExamQuestion(await memberId(context.user), data)),
  );

export const generateExam = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => exams.generateExamInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = await memberId(context.user);
    found(await exams.getExam(userId, data.examId));
    return aiResult(async () => (await exams.generateExam(userId, data))?.added ?? 0);
  });

export const startExam = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await exams.startExamAttempt(await memberId(context.user), data.id)),
  );

export const getAttempt = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await exams.attemptView(await memberId(context.user), data.id)),
  );

export const saveExamAnswer = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => exams.saveAnswerInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await exams.saveAnswer(await memberId(context.user), data)),
  );

export const submitExam = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => exams.submitInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await exams.submitExam(await memberId(context.user), data)),
  );

export const selfMark = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => exams.selfMarkInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await exams.selfMark(await memberId(context.user), data)),
  );
