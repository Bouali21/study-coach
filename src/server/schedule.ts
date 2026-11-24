// Leitner boxes: a known card moves up a box and waits longer; a missed
// card goes back to box 1 and is due again at once.
export const MAX_BOX = 5;
const INTERVAL_DAYS = [0, 0, 1, 3, 7, 14];

export function nextBox(box: number, known: boolean): number {
  return known ? Math.min(box + 1, MAX_BOX) : 1;
}

/** When a card in `box` is due again, after a review at `now`, as SQLite's datetime text. */
export function dueAfter(box: number, known: boolean, now: Date): string {
  const days = known ? INTERVAL_DAYS[box]! : 0;
  return sqliteTime(new Date(now.getTime() + days * 86_400_000));
}

export function sqliteTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function reviewXp(known: number, missed: number): number {
  return known * 5 + missed;
}
