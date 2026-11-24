import type { BatchItem } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/d1";
import { env } from "cloudflare:workers";
import * as schema from "./schema";

export const db = drizzle(env.DB, { schema });

/** A D1 batch of any length: all statements commit together or none do. */
export function batchAll(statements: BatchItem<"sqlite">[]) {
  if (statements.length === 0) return Promise.resolve([]);
  return db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}
