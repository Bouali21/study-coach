import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Pencil, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { BackLink } from "@/client/components/BackLink";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { FormDialog } from "@/client/components/FormDialog";
import { GenerateDialog } from "@/client/components/GenerateDialog";
import { OptionsEditor } from "@/client/components/OptionsEditor";
import { PageHeader } from "@/client/components/PageHeader";
import { panel, Section } from "@/client/components/Section";
import { StudyShell } from "@/client/components/StudyShell";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { useAction } from "@/client/lib/useAction";
import {
  deleteExam,
  deleteExamQuestion,
  generateExam,
  getExamPage,
  saveExamQuestion,
  startExam,
} from "@/serverFunctions/exams";

export const Route = createFileRoute("/exams/$examId")({
  loader: ({ params }) => getExamPage({ data: { id: params.examId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.exam.title ?? "Practice exam" }] }),
  component: ExamPage,
});

type Question = Awaited<ReturnType<typeof getExamPage>>["questions"][number];

function ExamPage() {
  const { exam, questions, attempts } = Route.useLoaderData();
  const navigate = useNavigate();
  const { run, pending, error } = useAction();
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const maxScore = questions.reduce((sum, q) => sum + q.points, 0);
  const sections = [...new Set(questions.map((q) => q.section))];
  const lastSection = questions.at(-1)?.section ?? "Section A";
  return (
    <StudyShell>
      <PageHeader
        backLink={<BackLink to="/subjects/$subjectId" params={{ subjectId: exam.subjectId }}>{exam.subject}</BackLink>}
        title={exam.title}
        description={`${exam.minutes} minutes · ${maxScore} points`}
        actions={
          <>
            <Button
              data-testid="start-exam"
              disabled={questions.length === 0}
              pending={pending}
              onClick={async () => {
                const started = await run(() => startExam({ data: { id: exam.id } }));
                if (started)
                  await navigate({
                    to: "/exams/$examId/attempts/$attemptId",
                    params: { examId: exam.id, attemptId: started.id },
                  });
              }}
            >
              <Play /> Start
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete exam" onClick={() => setDeleting(true)}>
              <Trash2 />
            </Button>
          </>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Section
        title="Questions"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" data-testid="generate-exam" onClick={() => setGenerating(true)}>
              <Sparkles /> Generate
            </Button>
            <Button variant="outline" size="sm" data-testid="add-exam-question" onClick={() => setEditing("new")}>
              <Plus /> Add question
            </Button>
          </div>
        }
      >
        {questions.length === 0 ? (
          <EmptyState title="No questions yet" description="Write sections of questions, or generate an exam from topics." />
        ) : (
          sections.map((section) => (
            <div key={section} className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">{section}</h3>
              <ol className={`${panel} divide-y divide-border`}>
                {questions
                  .filter((q) => q.section === section)
                  .map((q) => (
                    <li key={q.id} data-testid="exam-question-row" className="flex items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-medium break-words">{q.prompt}</p>
                        <p className="text-sm text-muted-foreground">
                          {q.kind === "mc" ? "Multiple choice" : "Written"} · {q.points} pts
                        </p>
                      </div>
                      <Button variant="ghost" size="icon-sm" aria-label="Edit question" onClick={() => setEditing(q)}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete question"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => run(() => deleteExamQuestion({ data: { examId: exam.id, id: q.id } }))}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
              </ol>
            </div>
          ))
        )}
      </Section>
      <Section title="Attempts">
        {attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not taken yet.</p>
        ) : (
          <ul className={`${panel} divide-y divide-border text-sm`}>
            {attempts.map((a) => (
              <li key={a.id} data-testid="exam-attempt-row">
                <Link
                  to="/exams/$examId/attempts/$attemptId"
                  params={{ examId: exam.id, attemptId: a.id }}
                  className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-muted/50"
                >
                  <span className="text-muted-foreground">{new Date(`${a.startedAt.replace(" ", "T")}Z`).toLocaleString()}</span>
                  <span className="flex items-center gap-2">
                    {a.submittedAt ? (
                      <span className="font-medium tabular-nums">
                        {a.score} / {a.maxScore}
                      </span>
                    ) : (
                      <Badge variant="secondary">In progress</Badge>
                    )}
                    {a.timedOut ? <Badge variant="outline">Time ran out</Badge> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {editing ? (
        <ExamQuestionDialog
          examId={exam.id}
          question={editing === "new" ? undefined : editing}
          defaultSection={lastSection}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {generating ? (
        <GenerateDialog
          title="Generate exam questions"
          label="Topics (optional)"
          onGenerate={(source) => generateExam({ data: { examId: exam.id, source } })}
          onClose={() => setGenerating(false)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${exam.title}?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const done = await run(() => deleteExam({ data: { id: exam.id } }));
            if (done) await navigate({ to: "/subjects/$subjectId", params: { subjectId: exam.subjectId } });
          }}
        >
          Its questions and attempts are deleted too.
        </ConfirmDialog>
      ) : null}
    </StudyShell>
  );
}

function ExamQuestionDialog({
  examId,
  question,
  defaultSection,
  onClose,
}: {
  examId: string;
  question?: Question;
  defaultSection: string;
  onClose: () => void;
}) {
  const { run, pending, error } = useAction();
  const [section, setSection] = useState(question?.section ?? defaultSection);
  const [kind, setKind] = useState<"mc" | "written">(question?.kind ?? "mc");
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [options, setOptions] = useState(question?.options ?? ["", ""]);
  const [correct, setCorrect] = useState(question?.correctIndex ?? 0);
  const [points, setPoints] = useState(String(question?.points ?? 1));
  const [modelAnswer, setModelAnswer] = useState(question?.modelAnswer ?? "");
  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={question ? "Edit question" : "New question"}
      submitLabel="Save"
      submitTestId="eq-save"
      pending={pending}
      error={error}
      onSubmit={async () => {
        const done = await run(() =>
          saveExamQuestion({
            data: {
              examId,
              id: question?.id,
              section,
              kind,
              prompt,
              points: Number(points) || 0,
              modelAnswer,
              ...(kind === "mc" ? { options, correctIndex: correct } : {}),
            },
          }),
        );
        if (done) onClose();
      }}
    >
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <div className="space-y-2">
          <Label htmlFor="eq-section">Section</Label>
          <Input id="eq-section" data-testid="eq-section" value={section} onChange={(e) => setSection(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="eq-points">Points</Label>
          <Input id="eq-points" data-testid="eq-points" type="number" min={1} max={100} value={points} onChange={(e) => setPoints(e.target.value)} />
        </div>
      </div>
      <ToggleGroup variant="outline" value={[kind]} onValueChange={(next) => next[0] && setKind(next[0] as "mc" | "written")}>
        <ToggleGroupItem value="mc" data-testid="eq-kind-mc">
          Multiple choice
        </ToggleGroupItem>
        <ToggleGroupItem value="written" data-testid="eq-kind-written">
          Written answer
        </ToggleGroupItem>
      </ToggleGroup>
      <div className="space-y-2">
        <Label htmlFor="eq-prompt">Question</Label>
        <Textarea id="eq-prompt" data-testid="eq-prompt" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </div>
      {kind === "mc" ? (
        <OptionsEditor
          options={options}
          correct={correct}
          onChange={(next, right) => {
            setOptions(next);
            setCorrect(right);
          }}
        />
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="eq-model-answer">{kind === "mc" ? "Explanation (optional)" : "Model answer"}</Label>
        <Textarea id="eq-model-answer" data-testid="eq-model-answer" rows={3} value={modelAnswer} onChange={(e) => setModelAnswer(e.target.value)} />
      </div>
    </FormDialog>
  );
}
