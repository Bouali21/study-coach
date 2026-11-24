import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, CalendarCheck, Layers, Plus, Trophy } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { panel, Section } from "@/client/components/Section";
import { StudyShell } from "@/client/components/StudyShell";
import { SubjectDialog } from "@/client/components/SubjectDialog";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { formatDay, localToday } from "@/client/lib/useAction";
import { getDashboard } from "@/serverFunctions/subjects";

export const Route = createFileRoute("/")({
  loader: () => getDashboard({ data: { today: localToday() } }),
  head: () => ({ meta: [{ title: "Study Coach" }] }),
  component: Home,
});

const KIND_LABEL = { quiz: "Quiz", flashcards: "Flashcards", explain: "Explain it" };

function Home() {
  const data = Route.useLoaderData();
  const [creating, setCreating] = useState(false);
  const today = localToday();
  const newSubject = (
    <Button data-testid="new-subject" onClick={() => setCreating(true)}>
      <Plus /> New subject
    </Button>
  );
  return (
    <StudyShell>
      <PageHeader title="Study Coach" actions={data.subjects.length ? newSubject : null} />

      {data.subjects.length === 0 ? (
        <div data-testid="subjects-empty">
          <EmptyState
            icon={BookOpen}
            title="No subjects yet"
            description="Add a subject to keep its flashcards, quizzes, exams and plans together."
            action={newSubject}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={Trophy} label="Total XP" testId="xp-total" value={`${data.xp} XP`} />
            <Stat icon={Layers} label="Cards due" testId="due-today" value={String(data.dueTotal)} />
          </div>

          <Section title="Today's plan" testId="today-activities">
            {data.today.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing planned for today.</p>
            ) : (
              <ul className={`${panel} divide-y divide-border`}>
                {data.today.map((item) => (
                  <li key={item.id} data-testid="today-item">
                    <Link
                      to="/plans/$planId"
                      params={{ planId: item.planId }}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{KIND_LABEL[item.kind]}</span>
                        <span className="text-muted-foreground">
                          {" "}· {item.topic} · {item.subject}
                        </span>
                      </span>
                      {item.date < today ? (
                        <Badge variant="destructive">{formatDay(item.date)}</Badge>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Subjects">
            <div className="grid gap-3 sm:grid-cols-2">
              {data.subjects.map((subject) => (
                <Link
                  key={subject.id}
                  to="/subjects/$subjectId"
                  params={{ subjectId: subject.id }}
                  data-testid="subject-card"
                  className={`${panel} block space-y-1 px-4 py-3 hover:bg-muted/50`}
                >
                  <p className="font-medium">{subject.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[subject.label, subject.due ? `${subject.due} cards due` : null]
                      .filter(Boolean)
                      .join(" · ") || " "}
                  </p>
                </Link>
              ))}
            </div>
          </Section>

          {data.due.length > 0 ? (
            <Section title="Due for review">
              <ul className={`${panel} divide-y divide-border`}>
                {data.due.map((deck) => (
                  <li key={deck.deckId}>
                    <Link
                      to="/decks/$deckId/review"
                      params={{ deckId: deck.deckId }}
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/50"
                    >
                      <span>{deck.title}</span>
                      <Badge variant="secondary">{deck.due} due</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Recent scores" testId="recent-scores">
            {data.scores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Finish a quiz or practice exam to see scores here.</p>
            ) : (
              <ul className={`${panel} divide-y divide-border`}>
                {data.scores.map((score) => (
                  <li key={score.id}>
                    <Link
                      to={score.kind === "quiz" ? "/quizzes/$quizId" : "/exams/$examId"}
                      params={score.kind === "quiz" ? { quizId: score.parentId } : { examId: score.parentId }}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{score.title}</span>
                        <span className="text-muted-foreground">
                          {" "}· {score.kind === "quiz" ? "Quiz" : "Practice exam"}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {score.score}/{score.max}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
      {creating ? <SubjectDialog onClose={() => setCreating(false)} /> : null}
    </StudyShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  testId,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className={`${panel} flex items-center gap-3 px-4 py-3`}>
      <Icon className="size-5 text-primary" aria-hidden />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums" data-testid={testId}>
          {value}
        </p>
      </div>
    </div>
  );
}
