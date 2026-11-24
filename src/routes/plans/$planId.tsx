import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { BackLink } from "@/client/components/BackLink";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { PlanDialog } from "@/client/components/PlanDialog";
import { panel } from "@/client/components/Section";
import { StudyShell } from "@/client/components/StudyShell";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Progress } from "@/client/components/ui/progress";
import { Textarea } from "@/client/components/ui/textarea";
import { formatDay, localToday, useAction } from "@/client/lib/useAction";
import { deletePlan, getPlanPage, openPlanActivity, savePlanNote, togglePlanItem } from "@/serverFunctions/plans";

export const Route = createFileRoute("/plans/$planId")({
  loader: ({ params }) => getPlanPage({ data: { id: params.planId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.plan.subject} plan` : "Study plan" }] }),
  component: PlanPage,
});

const KIND_LABEL = { quiz: "Quiz", flashcards: "Flashcards", explain: "Explain it in your own words" };
type Item = Awaited<ReturnType<typeof getPlanPage>>["items"][number];

function PlanPage() {
  const { plan, items } = Route.useLoaderData();
  const navigate = useNavigate();
  const { run, pending, error } = useAction();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const today = localToday();
  const done = items.filter((i) => i.done).length;
  const days = [...new Set(items.map((i) => i.date))];

  async function open(item: Item) {
    const target = await run(() => openPlanActivity({ data: { id: item.id } }));
    if (!target) return;
    if (target.kind === "quiz") await navigate({ to: "/quizzes/$quizId", params: { quizId: target.id } });
    else await navigate({ to: "/decks/$deckId", params: { deckId: target.id } });
  }

  return (
    <StudyShell>
      <PageHeader
        backLink={<BackLink to="/subjects/$subjectId" params={{ subjectId: plan.subjectId }}>{plan.subject}</BackLink>}
        title={`${plan.subject} exam plan`}
        description={`Exam ${formatDay(plan.examDate)}`}
        actions={
          <>
            <Button variant="outline" data-testid="edit-plan" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete plan" onClick={() => setDeleting(true)}>
              <Trash2 />
            </Button>
          </>
        }
      />
      <div className="space-y-2">
        <p className="text-sm font-medium" data-testid="plan-progress">
          {done} of {items.length} done
        </p>
        <Progress value={items.length ? (done / items.length) * 100 : 0} />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {days.map((date) => (
        <section key={date} data-testid="plan-day" className="space-y-2">
          <h2 className="text-base font-semibold tracking-tight">
            {date === today ? "Today" : formatDay(date)}
          </h2>
          <ul className={`${panel} divide-y divide-border`}>
            {items
              .filter((i) => i.date === date)
              .map((item) => (
                <PlanRow
                  key={item.id}
                  item={item}
                  overdue={!item.done && item.date < today}
                  busy={pending}
                  onToggle={(value) => run(() => togglePlanItem({ data: { id: item.id, done: value } }))}
                  onOpen={() => open(item)}
                />
              ))}
          </ul>
        </section>
      ))}
      {editing ? <PlanDialog subjectId={plan.subjectId} plan={plan} onClose={() => setEditing(false)} /> : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete this plan?"
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const gone = await run(() => deletePlan({ data: { id: plan.id } }));
            if (gone) await navigate({ to: "/subjects/$subjectId", params: { subjectId: plan.subjectId } });
          }}
        >
          Quizzes and decks it opened are kept.
        </ConfirmDialog>
      ) : null}
    </StudyShell>
  );
}

function PlanRow({
  item,
  overdue,
  busy,
  onToggle,
  onOpen,
}: {
  item: Item;
  overdue: boolean;
  busy: boolean;
  onToggle: (done: boolean) => void;
  onOpen: () => void;
}) {
  const { run } = useAction();
  const [note, setNote] = useState(item.note ?? "");
  const [writing, setWriting] = useState(false);
  const label = `${KIND_LABEL[item.kind]} · ${item.topic}`;
  return (
    <li data-testid="plan-item" className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <Checkbox checked={item.done} aria-label={`Done: ${label}`} onCheckedChange={(value) => onToggle(value)} />
        <span className={`min-w-0 flex-1 ${item.done ? "text-muted-foreground line-through" : ""}`}>
          <span className="font-medium">{KIND_LABEL[item.kind]}</span> · {item.topic}
        </span>
        {overdue ? (
          <Badge variant="destructive" data-testid="overdue">
            Overdue
          </Badge>
        ) : null}
        {item.kind === "explain" ? (
          <Button variant="ghost" size="sm" onClick={() => setWriting(!writing)}>
            {writing ? "Close" : "Write"}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" data-testid="open-activity" disabled={busy} onClick={onOpen}>
            Open <ArrowRight />
          </Button>
        )}
      </div>
      {item.kind === "explain" && writing ? (
        <Textarea
          aria-label={`Your explanation of ${item.topic}`}
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => run(() => savePlanNote({ data: { id: item.id, note } }))}
        />
      ) : null}
    </li>
  );
}
