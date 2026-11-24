import { notFound } from "@tanstack/react-router";
import { ensureUser, type Member } from "@/server/users";

/** The signed-in member's id, with their row created on first sight. */
export function memberId(user: Member): Promise<string> {
  return ensureUser({ id: user.id, email: user.email });
}

/** Null from a scoped query means "not yours or not there": the page's 404. */
export function found<T>(value: T | null): T {
  if (value === null) throw notFound();
  return value;
}
