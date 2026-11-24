import { Send } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/client/components/ui/button";
import { Textarea } from "@/client/components/ui/textarea";

/** The question box: Enter sends, Shift+Enter adds a line. */
export function ChatComposer({
  pending,
  onSend,
  extra,
}: {
  pending: boolean;
  onSend: (text: string) => Promise<boolean>;
  extra?: ReactNode;
}) {
  const [text, setText] = useState("");
  async function send() {
    const content = text.trim();
    if (!content || pending) return;
    if (await onSend(content)) setText("");
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <Textarea
        data-testid="chat-input"
        aria-label="Your question"
        placeholder="Ask about homework or an exam topic"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">{extra}</div>
        <Button type="submit" data-testid="chat-send" pending={pending}>
          <Send /> Send
        </Button>
      </div>
    </form>
  );
}
