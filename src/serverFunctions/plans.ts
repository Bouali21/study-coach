import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { aiResult } from "@/server/ai";
import * as plans from "@/server/plans";
import { idInput } from "@/server/subjects";
import { found, memberId } from "./member";

export const getPlanPage = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await plans.planPage(await memberId(context.user), data.id)),
  );

export const createPlan = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => plans.planInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await plans.createPlan(await memberId(context.user), data)),
  );

export const editPlan = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => plans.editPlanInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await plans.editPlan(await memberId(context.user), data)),
  );

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await plans.deletePlan(await memberId(context.user), data.id)),
  );

export const togglePlanItem = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => plans.toggleInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await plans.toggleItem(await memberId(context.user), data)),
  );

export const savePlanNote = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => plans.noteInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await plans.saveNote(await memberId(context.user), data)),
  );

export const openPlanActivity = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => plans.openInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await plans.openActivity(await memberId(context.user), data.id)),
  );

export const suggestTopics = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => plans.suggestInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = await memberId(context.user);
    return aiResult(async () => found(await plans.suggestTopics(userId, data)));
  });
