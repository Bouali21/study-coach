import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

/** Runs a change, then reloads the page's data; keeps the error to show. */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    setPending(true);
    setError(null);
    try {
      const result = await work();
      await router.invalidate();
      return result;
    } catch (cause) {
      setError(messageOf(cause));
      return undefined;
    } finally {
      setPending(false);
    }
  }
  return { run, pending, error, setError };
}

/** A thrown error as one sentence: zod's first issue, or the message. */
export function messageOf(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause);
  try {
    const issues = JSON.parse(text) as { message?: string }[];
    if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
  } catch {
    // Not zod's JSON: the message as it is.
  }
  return text || "That didn't work. Try again.";
}

/** The member's today in their own time zone, as YYYY-MM-DD. */
export function localToday(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
