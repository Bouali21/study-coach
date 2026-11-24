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
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { formatSeconds, useAction } from "@/client/lib/useAction";
import { deleteQuestion, deleteQuiz, generateQuestions, getQuizPage, saveQuestion } from "@/serverFunctions/quizzes";

export const Route = createFileRoute("/quizzes/$quizId")({
  loader: ({ params }) => getQuizPage({ data: { id: params.quizId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.quiz.topic ?? "Quiz" }] }),
  component: QuizPage,
});

type Question = { id: string; prompt: string; options: string[]; correctIndex: number; explanation: string | null };

function QuizPage() {
  const { quiz, questions, attempts } = Route.useLoaderData();
  const navigate = useNavigate();
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <StudyShell>
      <PageHeader
        backLink={<BackLink to="/subjects/$subjectId" params={{ subjectId: quiz.subjectId }}>{quiz.subject}</BackLink>}
        title={quiz.topic}
        description={
          <Badge variant="outline" className="capitalize" data-testid="quiz-difficulty">
            {quiz.difficulty}
          </Badge>
        }
        actions={
          <>
            <Button
              data-testid="play-quiz"
              disabled={questions.length === 0}
              render={<Link to="/quizzes/$quizId/play" params={{ quizId: quiz.id }} />}
            >
              <Play /> Play
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete quiz" onClick={() => setDeleting(true)}>
              <Trash2 />
            </Button>
          </>
        }
      />
      <Section
        title="Questions"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" data-testid="generate-questions" onClick={() => setGenerating(true)}>
              <Sparkles /> Generate
            </Button>
            <Button variant="outline" size="sm" data-testid="add-question" onClick={() => setEditing("new")}>
              <Plus /> Add question
            </Button>
          </div>
        }
      >
        {questions.length === 0 ? (
          <EmptyState title="No questions yet" description="Write questions, or generate them for this topic and difficulty." />
        ) : (
          <ol className={`${panel} divide-y divide-border`}>
            {questions.map((q, i) => (
              <li key={q.id} data-testid="question-row" className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium break-words">
                    {i + 1}. {q.prompt}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {q.options.length} options · answer: {q.options[q.correctIndex]}
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
                  onClick={() => run(() => deleteQuestion({ data: { quizId: quiz.id, id: q.id } }))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ol>
        )}
      </Section>
      <Section title="Attempts">
        {attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not played yet.</p>
        ) : (
          <ul className={`${panel} divide-y divide-border text-sm`}>
            {attempts.map((a) => (
              <li key={a.id} data-testid="attempt-row" className="flex justify-between gap-3 px-4 py-2">
                <span className="font-medium tabular-nums">
                  {a.score}/{a.total}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  best streak {a.bestStreak} · {formatSeconds(a.seconds ?? 0)} · +{a.xp} XP
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {editing ? (
        <QuestionDialog quizId={quiz.id} question={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />
      ) : null}
      {generating ? (
        <GenerateDialog
          title="Generate questions"
          label="Notes to base them on (optional)"
          onGenerate={(source) => generateQuestions({ data: { quizId: quiz.id, source } })}
          onClose={() => setGenerating(false)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${quiz.topic}?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const done = await run(() => deleteQuiz({ data: { id: quiz.id } }));
            if (done) await navigate({ to: "/subjects/$subjectId", params: { subjectId: quiz.subjectId } });
          }}
        >
          Its questions and attempts are deleted too.
        </ConfirmDialog>
      ) : null}
    </StudyShell>
  );
}

function QuestionDialog({ quizId, question, onClose }: { quizId: string; question?: Question; onClose: () => void }) {
  const { run, pending, error } = useAction();
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [options, setOptions] = useState(question?.options ?? ["", ""]);
  const [correct, setCorrect] = useState(question?.correctIndex ?? 0);
  const [explanation, setExplanation] = useState(question?.explanation ?? "");
  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={question ? "Edit question" : "New question"}
      submitLabel="Save"
      submitTestId="question-save"
      pending={pending}
      error={error}
      onSubmit={async () => {
        const done = await run(() =>
          saveQuestion({ data: { quizId, id: question?.id, prompt, options, correctIndex: correct, explanation } }),
        );
        if (done) onClose();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="question-prompt">Question</Label>
        <Textarea id="question-prompt" data-testid="question-prompt" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} autoFocus />
      </div>
      <OptionsEditor
        options={options}
        correct={correct}
        onChange={(next, right) => {
          setOptions(next);
          setCorrect(right);
        }}
      />
      <div className="space-y-2">
        <Label htmlFor="question-explanation">Explanation (optional)</Label>
        <Textarea id="question-explanation" data-testid="question-explanation" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </div>
    </FormDialog>
  );
}
