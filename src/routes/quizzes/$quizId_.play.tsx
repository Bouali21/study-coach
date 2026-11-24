import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Flame, TrendingUp, X } from "lucide-react";
import { useState } from "react";
import { BackLink } from "@/client/components/BackLink";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { panel, Section } from "@/client/components/Section";
import { StudyShell } from "@/client/components/StudyShell";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Progress } from "@/client/components/ui/progress";
import { formatSeconds, messageOf } from "@/client/lib/useAction";
import { cn } from "cn";
import { answerQuestion, finishQuiz, startQuiz, tryHarder } from "@/serverFunctions/quizzes";

export const Route = createFileRoute("/quizzes/$quizId_/play")({
  loader: ({ params }) => startQuiz({ data: { id: params.quizId } }),
  staleTime: Infinity,
  shouldReload: false,
  head: ({ loaderData }) => ({ meta: [{ title: `Play · ${loaderData?.quiz.topic ?? ""}` }] }),
  component: Play,
});

type Feedback = { choice: number; correct: boolean; correctIndex: number; explanation: string | null };
type Finished = NonNullable<Awaited<ReturnType<typeof finishQuiz>>>;

function Play() {
  const { quiz, attemptId, questions } = Route.useLoaderData();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [streak, setStreak] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Finished | null>(null);
  const back = <BackLink to="/quizzes/$quizId" params={{ quizId: quiz.id }}>{quiz.topic}</BackLink>;

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!attemptId) {
    return (
      <StudyShell>
        <PageHeader backLink={back} title={quiz.topic} />
        <EmptyState title="No questions yet" description="Add questions to this quiz first." />
      </StudyShell>
    );
  }

  if (result) {
    const mistakes = result.total - result.score;
    return (
      <StudyShell>
        <PageHeader
          backLink={back}
          title="Quiz finished"
          actions={
            <Button
              data-testid="try-harder"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const made = await tryHarder({ data: { id: quiz.id } });
                  await navigate({ to: "/quizzes/$quizId", params: { quizId: made.id } });
                })
              }
            >
              <TrendingUp /> Try harder
            </Button>
          }
        />
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Score" value={`${result.score}/${result.total}`} testId="quiz-score" />
          <Stat label="Mistakes" value={String(mistakes)} testId="quiz-mistakes" />
          <Stat label="Best streak" value={String(result.bestStreak)} testId="quiz-best-streak" />
          <Stat label="Time" value={formatSeconds(result.seconds)} testId="quiz-time" />
          <Stat label="Earned" value={`${result.xp} XP`} testId="quiz-xp" />
        </div>
        <Section title="Your answers">
          <ol className={`${panel} divide-y divide-border`}>
            {result.review.map((q, i) => {
              const right = q.choice === q.correctIndex;
              return (
                <li key={q.id} data-testid="review-answer" className="space-y-1 px-4 py-3 text-sm">
                  <p className="font-medium">
                    {i + 1}. {q.prompt}
                  </p>
                  <p className={right ? "text-primary" : "text-destructive"}>
                    {right ? <Check className="inline size-4" /> : <X className="inline size-4" />}{" "}
                    {q.choice === null ? "Not answered" : q.options[q.choice]}
                  </p>
                  {!right ? <p>Right answer: {q.options[q.correctIndex]}</p> : null}
                  {q.explanation ? <p className="text-muted-foreground">{q.explanation}</p> : null}
                </li>
              );
            })}
          </ol>
        </Section>
      </StudyShell>
    );
  }

  const question = questions[index]!;
  const last = index + 1 === questions.length;
  return (
    <StudyShell>
      <PageHeader
        backLink={back}
        title={quiz.topic}
        description={`Question ${index + 1} of ${questions.length}`}
        actions={
          <span data-testid="streak" className="inline-flex items-center gap-1 text-sm font-medium">
            <Flame className="size-4 text-primary" aria-hidden /> Streak {streak}
          </span>
        }
      />
      <Progress value={(index / questions.length) * 100} />
      <div className={`${panel} space-y-4 px-5 py-5`}>
        <p className="text-lg font-medium break-words">{question.prompt}</p>
        <div className="grid gap-2">
          {question.options.map((option, i) => {
            const isRight = feedback && i === feedback.correctIndex;
            const isWrongPick = feedback && i === feedback.choice && !feedback.correct;
            return (
              <Button
                key={i}
                variant="outline"
                data-testid="answer-option"
                disabled={busy || feedback !== null}
                className={cn(
                  "h-auto justify-start py-3 text-left whitespace-normal",
                  isRight && "border-primary bg-primary/10 disabled:opacity-100",
                  isWrongPick && "border-destructive bg-destructive/10 disabled:opacity-100",
                )}
                onClick={() =>
                  act(async () => {
                    const checked = await answerQuestion({ data: { attemptId, questionId: question.id, choice: i } });
                    setFeedback({ choice: i, ...checked });
                    setStreak(checked.correct ? streak + 1 : 0);
                  })
                }
              >
                {option}
              </Button>
            );
          })}
        </div>
        {feedback ? (
          <div data-testid="answer-feedback" className="space-y-1 text-sm">
            <p className={feedback.correct ? "font-medium text-primary" : "font-medium text-destructive"}>
              {feedback.correct ? "Correct" : `Not quite. The answer is ${question.options[feedback.correctIndex]}.`}
            </p>
            {feedback.explanation ? <p className="text-muted-foreground">{feedback.explanation}</p> : null}
          </div>
        ) : null}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {feedback ? (
        <Button
          size="lg"
          className="w-full"
          data-testid="next-question"
          disabled={busy}
          onClick={() =>
            last
              ? act(async () => setResult(await finishQuiz({ data: { attemptId } })))
              : (setIndex(index + 1), setFeedback(null))
          }
        >
          {last ? "See results" : "Next question"} <ArrowRight />
        </Button>
      ) : null}
    </StudyShell>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className={`${panel} px-4 py-3`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}
