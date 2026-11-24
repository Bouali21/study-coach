import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FormDialog } from "@/client/components/FormDialog";
import { PlanDialog } from "@/client/components/PlanDialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { useAction } from "@/client/lib/useAction";
import { createDeck } from "@/serverFunctions/decks";
import { createExam } from "@/serverFunctions/exams";
import { createQuiz } from "@/serverFunctions/quizzes";

export type MaterialKind = "deck" | "quiz" | "exam" | "plan";
type Difficulty = "easy" | "medium" | "hard";

/** Creates a deck, quiz, exam or plan in the subject and opens it. */
export function NewMaterialDialog({
  kind,
  subjectId,
  onClose,
}: {
  kind: MaterialKind;
  subjectId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { run, pending, error } = useAction();
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [minutes, setMinutes] = useState("45");
  if (kind === "plan") return <PlanDialog subjectId={subjectId} onClose={onClose} />;

  const titles = { deck: "New deck", quiz: "New quiz", exam: "New practice exam" };
  async function submit() {
    if (kind === "deck") {
      const made = await run(() => createDeck({ data: { subjectId, title } }));
      if (made) await navigate({ to: "/decks/$deckId", params: { deckId: made.id } });
    } else if (kind === "quiz") {
      const made = await run(() => createQuiz({ data: { subjectId, topic: title, difficulty } }));
      if (made) await navigate({ to: "/quizzes/$quizId", params: { quizId: made.id } });
    } else {
      const made = await run(() =>
        createExam({ data: { subjectId, title, minutes: Number(minutes) || 0 } }),
      );
      if (made) await navigate({ to: "/exams/$examId", params: { examId: made.id } });
    }
  }
  const field = { deck: "deck-title", quiz: "quiz-topic", exam: "exam-title" }[kind];
  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={titles[kind]}
      submitLabel="Create"
      submitTestId={`${kind}-save`}
      pending={pending}
      error={error}
      onSubmit={submit}
    >
      <div className="space-y-2">
        <Label htmlFor={field}>{kind === "quiz" ? "Topic" : "Title"}</Label>
        <Input
          id={field}
          data-testid={field}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>
      {kind === "quiz" ? (
        <div className="space-y-2">
          <Label>Difficulty</Label>
          <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        </div>
      ) : null}
      {kind === "exam" ? (
        <div className="space-y-2">
          <Label htmlFor="exam-minutes">Time limit (minutes)</Label>
          <Input
            id="exam-minutes"
            data-testid="exam-minutes"
            type="number"
            min={1}
            max={600}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
      ) : null}
    </FormDialog>
  );
}

export function DifficultyPicker({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
}) {
  return (
    <ToggleGroup
      variant="outline"
      value={[value]}
      onValueChange={(next) => next[0] && onChange(next[0] as Difficulty)}
    >
      {(["easy", "medium", "hard"] as const).map((level) => (
        <ToggleGroupItem key={level} value={level} data-testid={`difficulty-${level}`} className="capitalize">
          {level}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
