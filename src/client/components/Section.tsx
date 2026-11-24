import type { ReactNode } from "react";

/** A titled part of a page, with an action on the right. */
export function Section({
  title,
  action,
  children,
  testId,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="space-y-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A white panel on the page's grey, holding a list. */
export const panel =
  "overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs";
