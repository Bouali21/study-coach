import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { StudyShell } from "@/client/components/StudyShell";
import { Button } from "@/client/components/ui/button";

export function NotFound() {
  return (
    <StudyShell>
      <PageHeader title="Not found" />
      <div data-testid="not-found">
        <EmptyState
          kind="filtered"
          title="Nothing here"
          description="It was deleted, or the link is wrong."
          action={<Button render={<Link to="/" />}>Go home</Button>}
        />
      </div>
    </StudyShell>
  );
}

export function ErrorPage({ error }: { error: unknown }) {
  return (
    <StudyShell>
      <PageHeader title="Something went wrong" />
      <EmptyState kind="error" title="This page didn't load" description={error instanceof Error ? error.message : String(error)} />
    </StudyShell>
  );
}
