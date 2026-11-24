// How a plan spreads its topics over the days before the exam.
export const ACTIVITIES = ["quiz", "flashcards", "explain"] as const;
export type Activity = (typeof ACTIVITIES)[number];

export interface PlannedItem {
  date: string;
  topic: string;
  kind: Activity;
}

/** `YYYY-MM-DD` plus `days`. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * Study days run from `today` to the day before the exam (an exam today
 * gets today). With more topics than days, a day takes several; with
 * fewer, later days go over the topics again.
 */
export function planItems(
  today: string,
  examDate: string,
  topics: string[],
): PlannedItem[] {
  const dayCount = Math.max(1, daysBetween(today, examDate));
  const items: PlannedItem[] = [];
  for (let day = 0; day < dayCount; day++) {
    const date = addDays(today, day);
    const dayTopics =
      topics.length >= dayCount
        ? topics.filter(
            (_, i) => Math.floor((i * dayCount) / topics.length) === day,
          )
        : [topics[day % topics.length]!];
    for (const topic of dayTopics)
      for (const kind of ACTIVITIES) items.push({ date, topic, kind });
  }
  return items;
}
