import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import * as subjects from "@/server/subjects";
import { found, memberId } from "./member";

export const getDashboard = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(data))
  .handler(async ({ data, context }) =>
    subjects.dashboard(await memberId(context.user), data.today),
  );

export const getSubjectPage = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => subjects.idInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = await memberId(context.user);
    const subject = found(await subjects.getSubject(userId, data.id));
    return { subject, ...(await subjects.subjectMaterial(userId, subject.id)) };
  });

export const createSubject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => subjects.subjectInput.parse(data))
  .handler(async ({ data, context }) =>
    subjects.createSubject(await memberId(context.user), data),
  );

export const renameSubject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => subjects.renameInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await subjects.renameSubject(await memberId(context.user), data)),
  );

export const deleteSubject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => subjects.idInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await subjects.deleteSubject(await memberId(context.user), data.id)),
  );
