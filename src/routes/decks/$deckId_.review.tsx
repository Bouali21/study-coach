import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, RotateCcw, X } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";
import { BackLink } from "@/client/components/BackLink";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { panel, Section } from "@/client/components/Section";
import { StudyShell } from "@/client/components/StudyShell";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Progress } from "@/client/components/ui/progress";
import { formatSeconds, messageOf } from "@/client/lib/useAction";
import { getReviewCards, recordReview } from "@/serverFunctions/decks";

export const Route = createFileRoute("/decks/$deckId_/review")({
  validateSearch: z.object({ all: z.boolean().optional() }),
  loaderDeps: ({ search }) => ({ all: search.all ?? false }),
  loader: ({ params, deps }) => getReviewCards({ data: { id: params.deckId, all: deps.all } }),
  head: ({ loaderData }) => ({ meta: [{ title: `Review · ${loaderData?.deck.title ?? ""}` }] }),
  component: Review,
});

type Card = { id: string; front: string; back: string };
type Result = { known: number; total: number; xp: number; seconds: number };

function Review() {
  const { deck, cards } = Route.useLoaderData();
  const [queue, setQueue] = useState<Card[]>(cards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [marks, setMarks] = useState<{ card: Card; known: boolean }[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const started = useRef(Date.now());

  async function mark(known: boolean) {
    const card = queue[index]!;
    const next = [...marks, { card, known }];
    setMarks(next);
    setFlipped(false);
    if (index + 1 < queue.length) {
      setIndex(index + 1);
      return;
    }
    setSaving(true);
    try {
      const saved = await recordReview({
        data: {
          deckId: deck.id,
          results: next.map((m) => ({ cardId: m.card.id, known: m.known })),
          seconds: Math.round((Date.now() - started.current) / 1000),
        },
      });
      setResult(saved);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  }

  function restart(list: Card[]) {
    setQueue(list);
    setIndex(0);
    setMarks([]);
    setResult(null);
    setFlipped(false);
    started.current = Date.now();
  }

  const back = <BackLink to="/decks/$deckId" params={{ deckId: deck.id }}>{deck.title}</BackLink>;

  if (queue.length === 0) {
    return (
      <StudyShell>
        <PageHeader backLink={back} title="Review" />
        <EmptyState
          title="Nothing due"
          description="Every card is scheduled for later."
          action={
            <Button render={<Link to="/decks/$deckId/review" params={{ deckId: deck.id }} search={{ all: true }} />}>
              Review all cards
            </Button>
          }
        />
      </StudyShell>
    );
  }

  if (result) {
    const known = marks.filter((m) => m.known).map((m) => m.card);
    const missed = marks.filter((m) => !m.known).map((m) => m.card);
    return (
      <StudyShell>
        <PageHeader backLink={back} title="Review done" />
        <div className={`${panel} space-y-3 px-5 py-4`}>
          <p className="text-xl font-semibold" data-testid="review-result">
            You remembered {result.known} of {result.total}
          </p>
          <p className="text-sm text-muted-foreground">
            <span data-testid="review-xp">+{result.xp} XP</span> ·{" "}
            <span data-testid="review-time">{formatSeconds(result.seconds)}</span>
          </p>
          {missed.length > 0 ? (
            <Button data-testid="review-missed" onClick={() => restart(missed)}>
              <RotateCcw /> Review missed
            </Button>
          ) : null}
        </div>
        <Section title="Knew it">
          <CardList testId="known-list" cards={known} />
        </Section>
        <Section title="Needs practice">
          <CardList testId="missed-list" cards={missed} />
        </Section>
      </StudyShell>
    );
  }

  const card = queue[index]!;
  return (
    <StudyShell>
      <PageHeader backLink={back} title="Review" description={<span data-testid="review-progress">Card {index + 1} of {queue.length}</span>} />
      <Progress value={(index / queue.length) * 100} />
      <div data-testid="review-card" className={`${panel} flex min-h-56 flex-col items-center justify-center gap-4 px-6 py-8 text-center`}>
        <p className="text-lg font-medium break-words">{card.front}</p>
        {flipped ? <p className="text-muted-foreground break-words" data-testid="card-answer">{card.back}</p> : null}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {flipped ? (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" size="lg" data-testid="still-learning" disabled={saving} onClick={() => mark(false)}>
            <X /> Still learning
          </Button>
          <Button size="lg" data-testid="knew-it" disabled={saving} onClick={() => mark(true)}>
            <Check /> Knew it
          </Button>
        </div>
      ) : (
        <Button size="lg" className="w-full" data-testid="flip" onClick={() => setFlipped(true)}>
          Show answer
        </Button>
      )}
    </StudyShell>
  );
}

function CardList({ cards, testId }: { cards: Card[]; testId: string }) {
  if (cards.length === 0) return <p className="text-sm text-muted-foreground" data-testid={testId}>None</p>;
  return (
    <ul className={`${panel} divide-y divide-border text-sm`} data-testid={testId}>
      {cards.map((c) => (
        <li key={c.id} className="grid gap-1 px-4 py-2 sm:grid-cols-2 sm:gap-4">
          <span className="font-medium">{c.front}</span>
          <span className="text-muted-foreground">{c.back}</span>
        </li>
      ))}
    </ul>
  );
}
