import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FormDialog } from "@/client/components/FormDialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { useAction } from "@/client/lib/useAction";
import { createSubject, renameSubject } from "@/serverFunctions/subjects";

/** Creates a subject, or renames `subject` when given. */
export function SubjectDialog({
  subject,
  onClose,
}: {
  subject?: { id: string; name: string; label: string | null };
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { run, pending, error } = useAction();
  const [name, setName] = useState(subject?.name ?? "");
  const [label, setLabel] = useState(subject?.label ?? "");
  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={subject ? "Edit subject" : "New subject"}
      submitLabel={subject ? "Save" : "Create subject"}
      submitTestId="subject-save"
      pending={pending}
      error={error}
      onSubmit={async () => {
        if (subject) {
          const done = await run(() =>
            renameSubject({ data: { id: subject.id, name, label } }),
          );
          if (done) onClose();
          return;
        }
        const created = await run(() => createSubject({ data: { name, label } }));
        if (created)
          await navigate({ to: "/subjects/$subjectId", params: { subjectId: created.id } });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="subject-name">Name</Label>
        <Input
          id="subject-name"
          data-testid="subject-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Biology"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="subject-label">Exam or course (optional)</Label>
        <Input
          id="subject-label"
          data-testid="subject-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Final exam, AP, Year 11"
        />
      </div>
    </FormDialog>
  );
}
