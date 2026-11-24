import { useState } from "react";
import { AiSetup } from "@/client/components/AiSetup";
import { FormDialog } from "@/client/components/FormDialog";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { useAction } from "@/client/lib/useAction";

type Outcome = { ok: true; value: unknown } | { ok: false; setup: string };

/** Asks AI to write material from a topic or notes; shows setup when AI is off. */
export function GenerateDialog({
  title,
  label,
  required,
  onGenerate,
  onClose,
}: {
  title: string;
  label: string;
  required?: boolean;
  onGenerate: (source: string) => Promise<Outcome>;
  onClose: () => void;
}) {
  const { run, pending, error, setError } = useAction();
  const [source, setSource] = useState("");
  const [setup, setSetup] = useState<string | null>(null);
  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      submitLabel="Generate"
      submitTestId="generate-submit"
      pending={pending}
      error={error}
      onSubmit={async () => {
        if (required && !source.trim()) {
          setError("Give a topic or paste notes.");
          return;
        }
        const outcome = await run(() => onGenerate(source));
        if (!outcome) return;
        if (outcome.ok) onClose();
        else setSetup(outcome.setup);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="generate-source">{label}</Label>
        <Textarea
          id="generate-source"
          data-testid="generate-source"
          rows={6}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
      </div>
      {setup ? <AiSetup setup={setup} /> : null}
    </FormDialog>
  );
}
