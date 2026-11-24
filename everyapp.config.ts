import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "study-coach",
  name: "Study Coach",
  icon: "/icon.svg",
  description:
    "Study by subject with an AI tutor, flashcards with spaced review, quizzes, timed practice exams and day-by-day exam plans.",
  resources: {
    d1: ["DB"],
  },
  providers: [
    {
      id: "openrouter",
      why: "Answers tutor questions, writes cards, quizzes, exams and plan topics, and marks written exam answers.",
      docs: "https://openrouter.ai/settings/keys",
    },
  ],
  ai: {
    models: ["anthropic/claude-haiku-5.5"],
  },
  features: {
    ai: {
      name: "AI tutor and generation",
      why: "The tutor, AI-written study material and AI marking of written answers.",
      providers: ["openrouter"],
      steps: ["Add an OpenRouter key: https://openrouter.ai/settings/keys"],
    },
  },
});
