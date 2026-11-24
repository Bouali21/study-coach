import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/client/components/ui/select";

const NONE = "none";

/** Picks one of the member's subjects, or none. */
export function SubjectSelect({
  subjects,
  value,
  onChange,
  noneLabel = "No subject",
}: {
  subjects: { id: string; name: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
  noneLabel?: string;
}) {
  const items = [{ value: NONE, label: noneLabel }, ...subjects.map((s) => ({ value: s.id, label: s.name }))];
  return (
    <Select
      items={items}
      value={value ?? NONE}
      onValueChange={(next) => onChange(next === NONE || next === null ? null : String(next))}
    >
      <SelectTrigger aria-label="Subject" data-testid="chat-subject" className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
