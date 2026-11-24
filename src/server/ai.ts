import { env } from "cloudflare:workers";
import {
  aiBaseUrl,
  createGatewayFetch,
  gatewayRefusal,
  refusalFromError,
} from "@every-app/sdk/server";
import { z } from "zod";

// The one model the app asks OpenRouter for; listed in everyapp.config.ts.
export const MODEL = "anthropic/claude-haiku-5.5";

const FALLBACK_SETUP =
  "AI isn't set up for this app yet. An admin can add an OpenRouter key in the Gateway.";

/** AI is off or refused: the page shows `setup` where the feature would be. */
export class AiUnavailable extends Error {
  constructor(readonly setup: string) {
    super(setup);
  }
}

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

/** One reply from the model. Throws AiUnavailable when the Gateway refuses. */
export async function complete(
  messages: ChatTurn[],
  options: { json?: boolean } = {},
): Promise<string> {
  let response: Response;
  try {
    const gatewayFetch = createGatewayFetch({ env });
    response = await gatewayFetch(`${aiBaseUrl("openrouter")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  } catch (error) {
    const refusal = refusalFromError(error);
    if (refusal) throw new AiUnavailable(refusal.setup ?? FALLBACK_SETUP);
    throw error;
  }
  if (!response.ok) {
    const refusal = await gatewayRefusal(response.clone());
    if (refusal) throw new AiUnavailable(refusal.setup ?? FALLBACK_SETUP);
    throw new Error(`The AI provider answered ${response.status}.`);
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("The AI provider sent an empty answer.");
  return content;
}

/** A JSON answer checked against `schema`. */
export async function completeJson<T>(
  task: string,
  instructions: string,
  input: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const text = await complete(
    [
      {
        role: "system",
        content: `TASK:${task}\nYou help a student study. ${instructions}\nAnswer with one JSON object and nothing else.`,
      },
      { role: "user", content: input },
    ],
    { json: true },
  );
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The AI answer wasn't JSON.");
  return schema.parse(JSON.parse(text.slice(start, end + 1)));
}

/** A result a page can show: the value, or AI's setup sentence. */
export type AiResult<T> = { ok: true; value: T } | { ok: false; setup: string };

export async function aiResult<T>(work: () => Promise<T>): Promise<AiResult<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    if (error instanceof AiUnavailable) return { ok: false, setup: error.setup };
    throw error;
  }
}
