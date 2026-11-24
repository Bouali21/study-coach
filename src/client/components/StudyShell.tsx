import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/client/components/AppShell";

const LINK =
  "text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground";

/** Every page's frame: the starter's AppShell with the app's two places. */
export function StudyShell({ children }: { children: ReactNode }) {
  return (
    <AppShell
      nav={
        <nav className="flex items-center gap-4">
          <Link to="/" className={LINK} activeOptions={{ exact: true }}>
            Home
          </Link>
          <Link to="/tutor" className={LINK}>
            Tutor
          </Link>
        </nav>
      }
    >
      {children}
    </AppShell>
  );
}
