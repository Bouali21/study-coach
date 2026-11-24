import { Plus, X } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/client/components/ui/radio-group";

/** Two to six answer options, one marked right. */
export function OptionsEditor({
  options,
  correct,
  onChange,
}: {
  options: string[];
  correct: number;
  onChange: (options: string[], correct: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Options (mark the right one)</Label>
      <RadioGroup
        value={String(correct)}
        onValueChange={(value) => onChange(options, Number(value))}
        className="gap-2"
      >
        {options.map((option, i) => (
          <div key={i} className="flex items-center gap-2">
            <RadioGroupItem value={String(i)} aria-label={`Option ${i + 1} is right`} data-testid={`correct-${i}`} />
            <Input
              aria-label={`Option ${i + 1}`}
              data-testid={`option-${i}`}
              value={option}
              onChange={(e) => onChange(options.map((o, j) => (j === i ? e.target.value : o)), correct)}
            />
            {options.length > 2 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove option ${i + 1}`}
                onClick={() =>
                  onChange(
                    options.filter((_, j) => j !== i),
                    correct === i ? 0 : correct > i ? correct - 1 : correct,
                  )
                }
              >
                <X />
              </Button>
            ) : null}
          </div>
        ))}
      </RadioGroup>
      {options.length < 6 ? (
        <Button type="button" variant="ghost" size="sm" data-testid="add-option" onClick={() => onChange([...options, ""], correct)}>
          <Plus /> Add option
        </Button>
      ) : null}
    </div>
  );
}
