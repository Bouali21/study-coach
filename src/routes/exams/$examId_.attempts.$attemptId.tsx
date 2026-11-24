import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Check, Clock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BackLink } from "@/client/components/BackLink";
import { PageHeader } from "@/client/components/PageHeader";
import { panel } from "@/client/components/Section";
import { StudyShell } from "@/client/components/StudyShell";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { formatSeconds, messageOf, useAction } from "@/client/lib/useAction";
import { getAttempt, saveExamAnswer, selfMark, submitExam } from "@/serverFunctions/exams";

export const Route = createFileRoute("/exams/$examId_/attempts/$attemptId")({
  loader: ({ params }) => getAttempt({ data: { id: params.attemptId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.exam.title ?? "Practice exam" }] }),
  component: AttemptPage,
});

type View = Awaited<ReturnType<typeof getAttempt>>;

function AttemptPage() {
  const view = Route.useLoaderData();
  const back = <BackLink to="/exams/$examId" params={{ examId: view.exam.id }}>{view.exam.title}</BackLink>;
  return view.state === "open" ? (
    <Taking key={view.attemptId} view={view} back={back} />
  ) : (
    <Result view={view} back={back} />
  );
}

type Answer = { choice: number | null; text: string | null };

function Taking({ view, back }: { view: Extract<View, { state: "open" }>; back: React.ReactNode }) {
  const router = useRouter();
  const skew = useRef(view.serverNow - Date.now());
  const [left, setLeft] = useState(() => Math.max(0, view.deadlineAt - (Date.now() + skew.current)));
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(view.questions.map((q) => [q.id, { choice: q.choice, text: q.text }])),
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitted = useRef(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  async function submit() {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    try {
      await submitExam({
        data: {
          attemptId: view.attemptId,
          answers: Object.entries(answers).map(([questionId, a]) => ({ questionId, ...a })),
        },
      });
      await router.invalidate();
    } catch (cause) {
      submitted.current = false;
      setError(messageOf(cause));
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const tick = setInterval(() => {
      const remaining = Math.max(0, view.deadlineAt - (Date.now() + skew.current));
      setLeft(remaining);
      if (remaining === 0) void submit();
    }, 1000);
    return () => clearInterval(tick);
  });

  async function save(questionId: string, answer: Answer) {
    setSaved(false);
    try {
      await saveExamAnswer({ data: { attemptId: view.attemptId, questionId, ...answer } });
      setSaved(true);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  function change(questionId: string, answer: Answer, delay: number) {
    setAnswers((all) => ({ ...all, [questionId]: answer }));
    clearTimeout(timers.current[questionId]);
    timers.current[questionId] = setTimeout(() => void save(questionId, answer), delay);
  }

  const sections = [...new Set(view.questions.map((q) => q.section))];
  return (
    <StudyShell>
      <PageHeader
        backLink={back}
        title={view.exam.title}
        actions={
          <span
            data-testid="exam-timer"
            className={`inline-flex items-center gap-1 text-lg font-semibold tabular-nums ${left < 60_000 ? "text-destructive" : ""}`}
          >
            <Clock className="size-5" aria-hidden />
            {formatSeconds(Math.ceil(left / 1000))}
          </span>
        }
      />
      {sections.map((section) => (
        <section key={section} className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">{section}</h2>
          {view.questions
            .filter((q) => q.section === section)
            .map((q) => {
              const answer = answers[q.id]!;
              return (
                <div key={q.id} className={`${panel} space-y-3 px-5 py-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium break-words">{q.prompt}</p>
                    <Badge variant="outline">{q.points} pts</Badge>
                  </div>
                  {q.kind === "mc" ? (
                    <div className="grid gap-2">
                      {(q.options ?? []).map((option, i) => (
                        <Button
                          key={i}
                          variant={answer.choice === i ? "secondary" : "outline"}
                          aria-pressed={answer.choice === i}
                          data-testid="exam-option"
                          className="h-auto justify-start py-2 text-left whitespace-normal aria-pressed:border-primary"
                          onClick={() => change(q.id, { choice: i, text: null }, 0)}
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Textarea
                      data-testid="exam-written"
                      aria-label="Your answer"
                      rows={5}
                      value={answer.text ?? ""}
                      onChange={(e) => change(q.id, { choice: null, text: e.target.value }, 600)}
                    />
                  )}
                </div>
              );
            })}
        </section>
      ))}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex items-center justify-end gap-3">
        {saved ? (
          <span data-testid="answer-saved" className="text-sm text-muted-foreground">
            Saved
          </span>
        ) : null}
        <Button size="lg" data-testid="submit-exam" pending={submitting} onClick={() => void submit()}>
          Submit
        </Button>
      </div>
    </StudyShell>
  );
}

function Result({ view, back }: { view: Extract<View, { state: "done" }>; back: React.ReactNode }) {
  const unmarked = view.questions.filter((q) => q.kind === "written" && q.awarded === null).length;
  return (
    <StudyShell>
      <PageHeader backLink={back} title={view.exam.title} />
      {view.timedOut ? (
        <Alert data-testid="time-up">
          <Clock />
          <AlertTitle>Time ran out</AlertTitle>
          <AlertDescription>The exam was submitted with the answers saved by then.</AlertDescription>
        </Alert>
      ) : null}
      <div className={`${panel} px-5 py-4`}>
        <p className="text-xs text-muted-foreground">Score</p>
        <p className="text-2xl font-semibold tabular-nums" data-testid="exam-score">
          {view.score} / {view.maxScore}
        </p>
        {unmarked > 0 ? (
          <p className="text-sm text-muted-foreground">
            {unmarked} written {unmarked === 1 ? "answer needs" : "answers need"} your mark below.
          </p>
        ) : null}
      </div>
      {view.questions.map((q, n) => (
        <div key={q.id} data-testid="exam-review-item" className={`${panel} space-y-2 px-5 py-4 text-sm`}>
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium break-words">
              {n + 1}. {q.prompt}
            </p>
            <Badge variant="outline" className="tabular-nums">
              {q.awarded ?? "–"} / {q.points}
            </Badge>
          </div>
          {q.kind === "mc" ? (
            <>
              <p className={q.choice === q.correctIndex ? "text-primary" : "text-destructive"}>
                {q.choice === q.correctIndex ? <Check className="inline size-4" /> : <X className="inline size-4" />}{" "}
                {q.choice === null ? "Not answered" : q.options?.[q.choice]}
              </p>
              {q.choice !== q.correctIndex ? <p>Right answer: {q.options?.[q.correctIndex ?? 0]}</p> : null}
              {q.modelAnswer ? <p className="text-muted-foreground">{q.modelAnswer}</p> : null}
            </>
          ) : (
            <>
              <p className="break-words whitespace-pre-wrap">{q.text || "Not answered"}</p>
              <div className="rounded-lg bg-muted px-3 py-2" data-testid="model-answer">
                <p className="text-xs font-medium text-muted-foreground">Model answer</p>
                <p className="whitespace-pre-wrap">{q.modelAnswer}</p>
              </div>
              {q.feedback ? (
                <p data-testid="ai-feedback" className="text-muted-foreground">
                  {q.feedback}
                </p>
              ) : null}
              {q.awarded === null ? <SelfMark attemptId={view.attemptId} questionId={q.id} points={q.points} /> : null}
            </>
          )}
        </div>
      ))}
    </StudyShell>
  );
}

function SelfMark({ attemptId, questionId, points }: { attemptId: string; questionId: string; points: number }) {
  const { run, pending, error } = useAction();
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => selfMark({ data: { attemptId, questionId, awarded: Number(value) || 0 } }));
      }}
    >
      <Input
        type="number"
        min={0}
        max={points}
        aria-label="Your mark"
        data-testid="self-mark-points"
        className="w-20"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <span className="text-muted-foreground">of {points}</span>
      <Button type="submit" size="sm" pending={pending} data-testid="self-mark-save">
        Mark
      </Button>
      {error ? <span className="text-destructive">{error}</span> : null}
    </form>
  );
}
