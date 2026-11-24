import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Bot, Layers, ListChecks, Trash2, User } from "lucide-react";
import { useState } from "react";
import { AiSetup } from "@/client/components/AiSetup";
import { BackLink } from "@/client/components/BackLink";
import { ChatComposer } from "@/client/components/ChatComposer";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { StudyShell } from "@/client/components/StudyShell";
import { SubjectSelect } from "@/client/components/SubjectSelect";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Spinner } from "@/client/components/ui/spinner";
import { messageOf, useAction } from "@/client/lib/useAction";
import { cn } from "cn";
import { chatToPractice, deleteChat, getChat, sendMessage } from "@/serverFunctions/tutor";

export const Route = createFileRoute("/tutor/$chatId")({
  loader: ({ params }) => getChat({ data: { id: params.chatId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.chat.title ?? "Tutor" }] }),
  component: ChatPage,
});

function ChatPage() {
  const { chat, messages, subjects } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const del = useAction();
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [setup, setSetup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState<"quiz" | "deck" | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function ask(content: string) {
    setPendingText(content);
    setError(null);
    try {
      const result = await sendMessage({ data: { chatId: chat.id, content } });
      if (!result.ok) {
        setSetup(result.setup);
        return false;
      }
      setSetup(null);
      await router.invalidate();
      return true;
    } catch (cause) {
      setError(messageOf(cause));
      return false;
    } finally {
      setPendingText(null);
    }
  }

  async function make(kind: "quiz" | "deck") {
    setMaking(kind);
    setError(null);
    try {
      const result = await chatToPractice({ data: { chatId: chat.id, kind, subjectId: subjectId ?? undefined } });
      if (!result.ok) setSetup(result.setup);
      else if (result.value.kind === "quiz")
        await navigate({ to: "/quizzes/$quizId", params: { quizId: result.value.id } });
      else await navigate({ to: "/decks/$deckId", params: { deckId: result.value.id } });
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setMaking(null);
    }
  }

  return (
    <StudyShell>
      <PageHeader
        backLink={<BackLink to="/tutor">Tutor</BackLink>}
        title={chat.title}
        description={chat.subject ? <Link to="/subjects/$subjectId" params={{ subjectId: chat.subjectId! }}>{chat.subject}</Link> : null}
        actions={
          <Button variant="ghost" size="icon" aria-label="Delete conversation" data-testid="delete-chat" onClick={() => setDeleting(true)}>
            <Trash2 />
          </Button>
        }
      />
      <div className="space-y-4">
        {messages.map((m) => (
          <Message key={m.id} role={m.role} content={m.content} />
        ))}
        {pendingText ? (
          <>
            <Message role="user" content={pendingText} />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Thinking
            </div>
          </>
        ) : null}
      </div>
      {setup ? <AiSetup setup={setup} /> : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <ChatComposer pending={pendingText !== null} onSend={ask} />
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <span className="text-sm text-muted-foreground">Practise this topic:</span>
        {!chat.subjectId ? (
          <SubjectSelect subjects={subjects} value={subjectId} onChange={setSubjectId} noneLabel="Pick a subject" />
        ) : null}
        <Button variant="outline" size="sm" data-testid="make-quiz" pending={making === "quiz"} disabled={making !== null} onClick={() => make("quiz")}>
          <ListChecks /> Make a quiz
        </Button>
        <Button variant="outline" size="sm" data-testid="make-deck" pending={making === "deck"} disabled={making !== null} onClick={() => make("deck")}>
          <Layers /> Make flashcards
        </Button>
      </div>
      {deleting ? (
        <ConfirmDialog
          title="Delete this conversation?"
          confirmLabel="Delete"
          destructive
          pending={del.pending}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const gone = await del.run(() => deleteChat({ data: { id: chat.id } }));
            if (gone) await navigate({ to: "/tutor" });
          }}
        />
      ) : null}
    </StudyShell>
  );
}

function Message({ role, content }: { role: "user" | "assistant"; content: string }) {
  const Icon = role === "user" ? User : Bot;
  return (
    <div
      data-testid="chat-message"
      data-role={role}
      className={cn(
        "flex gap-3 rounded-xl px-4 py-3",
        role === "user" ? "bg-muted" : "border border-border bg-card shadow-xs",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 text-sm break-words whitespace-pre-wrap">{content}</p>
    </div>
  );
}
