import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { AiSetup } from "@/client/components/AiSetup";
import { ChatComposer } from "@/client/components/ChatComposer";
import { PageHeader } from "@/client/components/PageHeader";
import { panel, Section } from "@/client/components/Section";
import { StudyShell } from "@/client/components/StudyShell";
import { SubjectSelect } from "@/client/components/SubjectSelect";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { messageOf } from "@/client/lib/useAction";
import { getTutorHome, saveStyle, sendMessage } from "@/serverFunctions/tutor";

export const Route = createFileRoute("/tutor/")({
  validateSearch: z.object({ subject: z.string().optional() }),
  loader: () => getTutorHome(),
  head: () => ({ meta: [{ title: "Tutor" }] }),
  component: TutorHome,
});

function TutorHome() {
  const { chats, style, subjects } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [subjectId, setSubjectId] = useState<string | null>(
    subjects.some((s) => s.id === search.subject) ? search.subject! : null,
  );
  const [pending, setPending] = useState(false);
  const [setup, setSetup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(content: string) {
    setPending(true);
    setError(null);
    try {
      const result = await sendMessage({ data: { content, subjectId: subjectId ?? undefined } });
      if (!result.ok) {
        setSetup(result.setup);
        return false;
      }
      await navigate({ to: "/tutor/$chatId", params: { chatId: result.value.chatId } });
      return true;
    } catch (cause) {
      setError(messageOf(cause));
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <StudyShell>
      <PageHeader title="Tutor" />
      <div className="space-y-3">
        <ChatComposer
          pending={pending}
          onSend={ask}
          extra={<SubjectSelect subjects={subjects} value={subjectId} onChange={setSubjectId} />}
        />
        {setup ? <AiSetup setup={setup} /> : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <Section title="Conversations">
        {chats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No conversations yet.</p>
        ) : (
          <ul className={`${panel} divide-y divide-border`}>
            {chats.map((chat) => (
              <li key={chat.id}>
                <Link
                  to="/tutor/$chatId"
                  params={{ chatId: chat.id }}
                  data-testid="chat-row"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  <MessageCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {chat.subject ? `${chat.subject} · ` : ""}
                    {new Date(`${chat.updatedAt.replace(" ", "T")}Z`).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <StyleSection key={`${style.tone}-${style.warmth}-${style.emoji}`} initial={style} />
    </StudyShell>
  );
}

type Style = { tone: "friendly" | "relaxed" | "direct"; warmth: "neutral" | "balanced" | "warm"; emoji: "none" | "some" | "lots" };

const CHOICES = {
  tone: ["friendly", "relaxed", "direct"],
  warmth: ["neutral", "balanced", "warm"],
  emoji: ["none", "some", "lots"],
} as const;
const LABELS = { tone: "Tone", warmth: "Warmth", emoji: "Emojis" };

function StyleSection({ initial }: { initial: Style }) {
  const [style, setStyle] = useState<Style>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <Section title="Answer style">
      <div className={`${panel} space-y-4 px-5 py-4`}>
        {(Object.keys(CHOICES) as (keyof typeof CHOICES)[]).map((key) => (
          <div key={key} className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">{LABELS[key]}</span>
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[style[key]]}
              onValueChange={(next) => {
                if (!next[0]) return;
                setStyle({ ...style, [key]: next[0] });
                setState("idle");
              }}
            >
              {CHOICES[key].map((choice) => (
                <ToggleGroupItem key={choice} value={choice} data-testid={`${key}-${choice}`} className="capitalize">
                  {choice}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ))}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex items-center justify-end gap-3">
          {state === "saved" ? (
            <span className="text-sm text-muted-foreground" data-testid="style-saved">
              Saved
            </span>
          ) : null}
          <Button
            data-testid="save-style"
            pending={state === "saving"}
            onClick={async () => {
              setState("saving");
              setError(null);
              try {
                await saveStyle({ data: style });
                setState("saved");
              } catch (cause) {
                setError(messageOf(cause));
                setState("idle");
              }
            }}
          >
            Save style
          </Button>
        </div>
      </div>
    </Section>
  );
}
