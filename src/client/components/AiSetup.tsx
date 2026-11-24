import { Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";

/** Where an AI feature would be while AI isn't set up: the Gateway's sentence. */
export function AiSetup({ setup }: { setup: string }) {
  return (
    <Alert data-testid="ai-setup">
      <Sparkles />
      <AlertTitle>AI isn't set up</AlertTitle>
      <AlertDescription>{setup}</AlertDescription>
    </Alert>
  );
}
