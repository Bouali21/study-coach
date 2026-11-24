import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { AiSetup } from "@/client/components/AiSetup";
import { FormDialog } from "@/client/components/FormDialog";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { localToday, messageOf, useAction } from "@/client/lib/useAction";
import { createPlan, editPlan, suggestTopics } from "@/serverFunctions/plans";

const QUICK = [
  { value: "tomorrow", label: "Tomorrow", days: 1 },
  { value: "2", label: "In 2 days", days: 2 },
  { value: "3", label: "In 3 days", days: 3 },
] as const;

/** Creates a plan for the subject, or edits `plan`'s date and topics. */
export function PlanDialog({
  subjectId,
  plan,
  onClose,
}: {
  subjectId: string;
  plan?: { id: string; examDate: string; topics: string[] };
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { run, pending, error } = useAction();
  const [choice, setChoice] = useState<string>(plan ? "custom" : "3");
  const [custom, setCustom] = useState(plan?.examDate ?? localToday(7));
  const [topics, setTopics] = useState(plan?.topics.join("\n") ?? "");
  const [suggesting, setSuggesting] = useState(false);
  const [aiSetup, setAiSetup] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const examDate =
    choice === "custom" ? custom : localToday(QUICK.find((q) => q.value === choice)!.days);
  const topicList = topics.split("\n").map((t) => t.trim()).filter(Boolean);

  async function suggest() {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const result = await suggestTopics({ data: { subjectId, hint: topics } });
      if (result.ok) setTopics(result.value.join("\n"));
      else setAiSetup(result.setup);
    } catch (cause) {
      setSuggestError(messageOf(cause));
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={plan ? "Edit plan" : "New study plan"}
      submitLabel={plan ? "Save" : "Create plan"}
      submitTestId="plan-save"
      pending={pending}
      error={error ?? suggestError}
      onSubmit={async () => {
        const today = localToday();
        if (plan) {
          const done = await run(() =>
            editPlan({ data: { id: plan.id, today, examDate, topics: topicList } }),
          );
          if (done) onClose();
          return;
        }
        const made = await run(() =>
          createPlan({ data: { subjectId, today, examDate, topics: topicList } }),
        );
        if (made) await navigate({ to: "/plans/$planId", params: { planId: made.id } });
      }}
    >
      <div className="space-y-2">
        <Label>Exam date</Label>
        <ToggleGroup
          variant="outline"
          className="flex-wrap"
          value={[choice]}
          onValueChange={(next) => next[0] && setChoice(next[0])}
        >
          {QUICK.map((q) => (
            <ToggleGroupItem key={q.value} value={q.value} data-testid={`plan-date-${q.value}`}>
              {q.label}
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem value="custom" data-testid="plan-date-custom">
            Pick a date
          </ToggleGroupItem>
        </ToggleGroup>
        {choice === "custom" ? (
          <Input
            type="date"
            aria-label="Exam date"
            data-testid="plan-date-input"
            min={localToday()}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        ) : null}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="plan-topics">Topics, one per line</Label>
          <Button type="button" variant="ghost" size="sm" pending={suggesting} data-testid="suggest-topics" onClick={suggest}>
            <Sparkles /> Suggest
          </Button>
        </div>
        <Textarea
          id="plan-topics"
          data-testid="plan-topics"
          rows={6}
          value={topics}
          onChange={(e) => setTopics(e.target.value)}
        />
      </div>
      {aiSetup ? <AiSetup setup={aiSetup} /> : null}
      {plan ? (
        <p className="text-sm text-muted-foreground">
          Days from today are planned again. Finished and overdue activities stay.
        </p>
      ) : null}
    </FormDialog>
  );
}
