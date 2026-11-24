// The app's tools for AI clients, served by the Gateway at /mcp.
import { defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import { dashboard } from "@/server/subjects";

export const tools = defineTools({
  study_overview: {
    description:
      "The user's subjects, cards due for review, today's study plan activities, recent quiz and exam scores, and total XP.",
    risk: "read",
    input: z.object({}).strict(),
    handler: (_input, { user }) =>
      dashboard(user.id, new Date().toISOString().slice(0, 10)),
  },
});
