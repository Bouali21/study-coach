import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export interface Member {
  id: string;
  email: string;
}

/** The member's own row, created the first time the Gateway sends them. */
export async function ensureUser(user: Member): Promise<string> {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoNothing();
  return user.id;
}

export async function getUser(userId: string) {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row ?? null;
}

/** An XP increment, for a batch beside the result it comes from. */
export function addXp(userId: string, xp: number, when?: SQL) {
  return db
    .update(users)
    .set({ xp: sql`${users.xp} + ${xp}` })
    .where(when ? and(eq(users.id, userId), when) : eq(users.id, userId));
}

export const tones = ["friendly", "relaxed", "direct"] as const;
export const warmths = ["neutral", "balanced", "warm"] as const;
export const emojis = ["none", "some", "lots"] as const;
