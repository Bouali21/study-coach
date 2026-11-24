import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Pencil, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { FormDialog } from "@/client/components/FormDialog";
import { GenerateDialog } from "@/client/components/GenerateDialog";
import { BackLink } from "@/client/components/BackLink";
import { PageHeader } from "@/client/components/PageHeader";
import { panel, Section } from "@/client/components/Section";
import { StudyShell } from "@/client/components/StudyShell";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { formatSeconds, useAction } from "@/client/lib/useAction";
import { deleteCard, deleteDeck, generateCards, getDeckPage, saveCard } from "@/serverFunctions/decks";

export const Route = createFileRoute("/decks/$deckId")({
  loader: ({ params }) => getDeckPage({ data: { id: params.deckId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.deck.title ?? "Deck" }] }),
  component: DeckPage,
});

type Card = { id: string; front: string; back: string };

function DeckPage() {
  const { deck, cards, reviews } = Route.useLoaderData();
  const navigate = useNavigate();
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<Card | "new" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const due = cards.filter((c) => c.due).length;
  return (
    <StudyShell>
      <PageHeader
        backLink={<BackLink to="/subjects/$subjectId" params={{ subjectId: deck.subjectId }}>{deck.subject}</BackLink>}
        title={deck.title}
        description={
          <span data-testid="due-count">
            {due} due · {cards.length} cards
          </span>
        }
        actions={
          <>
            <Button
              data-testid="start-review"
              disabled={cards.length === 0}
              render={<Link to="/decks/$deckId/review" params={{ deckId: deck.id }} search={due === 0 ? { all: true } : {}} />}
            >
              <Play /> {due === 0 && cards.length > 0 ? "Review all" : "Review"}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete deck" onClick={() => setDeleting(true)}>
              <Trash2 />
            </Button>
          </>
        }
      />
      <Section
        title="Cards"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" data-testid="generate-cards" onClick={() => setGenerating(true)}>
              <Sparkles /> Generate
            </Button>
            <Button variant="outline" size="sm" data-testid="add-card" onClick={() => setEditing("new")}>
              <Plus /> Add card
            </Button>
          </div>
        }
      >
        {cards.length === 0 ? (
          <EmptyState title="No cards yet" description="Add cards by hand, or generate them from a topic or your notes." />
        ) : (
          <ul className={`${panel} divide-y divide-border`}>
            {cards.map((card) => (
              <li key={card.id} data-testid="card-row" className="flex items-start gap-3 px-4 py-3">
                <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2 sm:gap-4">
                  <p className="font-medium break-words">{card.front}</p>
                  <p className="text-muted-foreground break-words">{card.back}</p>
                </div>
                {card.due ? <Badge variant="secondary">Due</Badge> : <Badge variant="outline">Box {card.box}</Badge>}
                <Button variant="ghost" size="icon-sm" aria-label="Edit card" data-testid="edit-card" onClick={() => setEditing(card)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete card"
                  data-testid="delete-card"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => run(() => deleteCard({ data: { deckId: deck.id, id: card.id } }))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {reviews.length > 0 ? (
        <Section title="Past reviews">
          <ul className={`${panel} divide-y divide-border text-sm`}>
            {reviews.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 px-4 py-2">
                <span>
                  {r.known} of {r.total} remembered
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {formatSeconds(r.seconds)} · +{r.xp} XP
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {editing ? <CardDialog deckId={deck.id} card={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      {generating ? (
        <GenerateDialog
          title="Generate cards"
          label="Topic or notes"
          required
          onGenerate={(source) => generateCards({ data: { deckId: deck.id, source } })}
          onClose={() => setGenerating(false)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deck.title}?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const done = await run(() => deleteDeck({ data: { id: deck.id } }));
            if (done) await navigate({ to: "/subjects/$subjectId", params: { subjectId: deck.subjectId } });
          }}
        >
          Its cards and review history are deleted too.
        </ConfirmDialog>
      ) : null}
    </StudyShell>
  );
}

function CardDialog({ deckId, card, onClose }: { deckId: string; card?: Card; onClose: () => void }) {
  const { run, pending, error } = useAction();
  const [front, setFront] = useState(card?.front ?? "");
  const [back, setBack] = useState(card?.back ?? "");
  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={card ? "Edit card" : "New card"}
      submitLabel="Save"
      submitTestId="card-save"
      pending={pending}
      error={error}
      onSubmit={async () => {
        const done = await run(() => saveCard({ data: { deckId, id: card?.id, front, back } }));
        if (done) onClose();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="card-front">Front</Label>
        <Textarea id="card-front" data-testid="card-front" rows={2} value={front} onChange={(e) => setFront(e.target.value)} autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="card-back">Back</Label>
        <Textarea id="card-back" data-testid="card-back" rows={3} value={back} onChange={(e) => setBack(e.target.value)} />
      </div>
    </FormDialog>
  );
}
