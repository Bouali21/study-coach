import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MessageCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { NewMaterialDialog, type MaterialKind } from "@/client/components/NewMaterialDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { panel, Section } from "@/client/components/Section";
import { StudyShell } from "@/client/components/StudyShell";
import { SubjectDialog } from "@/client/components/SubjectDialog";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { formatDay, useAction } from "@/client/lib/useAction";
import { deleteSubject, getSubjectPage } from "@/serverFunctions/subjects";

export const Route = createFileRoute("/subjects/$subjectId")({
  loader: ({ params }) => getSubjectPage({ data: { id: params.subjectId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.subject.name ?? "Subject" }] }),
  component: SubjectPage,
});

function SubjectPage() {
  const data = Route.useLoaderData();
  const { subject } = data;
  const navigate = useNavigate();
  const { run, pending } = useAction();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState<MaterialKind | null>(null);
  const add = (kind: MaterialKind, label: string) => (
    <Button variant="outline" size="sm" data-testid={`new-${kind}`} onClick={() => setCreating(kind)}>
      <Plus /> {label}
    </Button>
  );
  return (
    <StudyShell>
      <PageHeader
        title={subject.name}
        description={subject.label}
        actions={
          <>
            <Button
              variant="outline"
              data-testid="ask-tutor"
              render={<Link to="/tutor" search={{ subject: subject.id }} />}
            >
              <MessageCircle /> Ask the tutor
            </Button>
            <Button variant="ghost" size="icon" aria-label="Edit subject" data-testid="rename-subject" onClick={() => setEditing(true)}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete subject" data-testid="delete-subject" onClick={() => setDeleting(true)}>
              <Trash2 />
            </Button>
          </>
        }
      />

      <Section title="Flashcard decks" action={add("deck", "New deck")}>
        <List empty="No decks yet.">
          {data.decks.map((deck) => (
            <Row key={deck.id} to="/decks/$deckId" params={{ deckId: deck.id }} title={deck.title}>
              <span className="text-muted-foreground">{deck.cards} cards</span>
              {deck.due > 0 ? <Badge variant="secondary">{deck.due} due</Badge> : null}
            </Row>
          ))}
        </List>
      </Section>

      <Section title="Quizzes" action={add("quiz", "New quiz")}>
        <List empty="No quizzes yet.">
          {data.quizzes.map((quiz) => (
            <Row key={quiz.id} to="/quizzes/$quizId" params={{ quizId: quiz.id }} title={quiz.topic}>
              <span className="text-muted-foreground">{quiz.questions} questions</span>
              <Badge variant="outline" className="capitalize">{quiz.difficulty}</Badge>
            </Row>
          ))}
        </List>
      </Section>

      <Section title="Practice exams" action={add("exam", "New exam")}>
        <List empty="No practice exams yet.">
          {data.exams.map((exam) => (
            <Row key={exam.id} to="/exams/$examId" params={{ examId: exam.id }} title={exam.title}>
              <span className="text-muted-foreground">{exam.minutes} min</span>
            </Row>
          ))}
        </List>
      </Section>

      <Section title="Study plans" action={add("plan", "New plan")}>
        <List empty="No study plans yet.">
          {data.plans.map((plan) => (
            <Row key={plan.id} to="/plans/$planId" params={{ planId: plan.id }} title={`Exam ${formatDay(plan.examDate)}`}>
              <span className="text-muted-foreground">
                {plan.done} of {plan.total} done
              </span>
            </Row>
          ))}
        </List>
      </Section>

      {editing ? <SubjectDialog subject={subject} onClose={() => setEditing(false)} /> : null}
      {creating ? (
        <NewMaterialDialog kind={creating} subjectId={subject.id} onClose={() => setCreating(null)} />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${subject.name}?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const done = await run(() => deleteSubject({ data: { id: subject.id } }));
            if (done) await navigate({ to: "/" });
          }}
        >
          Its decks, quizzes, exams, plans and tutor chats are deleted too.
        </ConfirmDialog>
      ) : null}
    </StudyShell>
  );
}

function List({ empty, children }: { empty: string; children: ReactNode[] }) {
  if (children.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return <ul className={`${panel} divide-y divide-border`}>{children}</ul>;
}

function Row({
  to,
  params,
  title,
  children,
}: {
  to: string;
  params: Record<string, string>;
  title: string;
  children: ReactNode;
}) {
  return (
    <li>
      <Link
        to={to}
        params={params}
        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
      >
        <span className="min-w-0 truncate font-medium">{title}</span>
        <span className="flex shrink-0 items-center gap-2 text-sm">{children}</span>
      </Link>
    </li>
  );
}
