# Study Coach

Study Coach keeps each member's study material by subject: an AI tutor for homework and exam questions, flashcards with spaced review, quizzes, timed practice exams and day-by-day plans for an exam date.

Inspired by https://knowunity.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Keep subjects with an optional exam or course label, and see due cards, today's plan, recent scores and total XP on the home page.
- Ask an AI tutor step-by-step questions, keep and reopen conversations, set its tone, warmth and emojis, and turn a conversation into a quiz or deck.
- Build flashcard decks by hand or with AI and review them; missed cards come back first and known ones wait longer.
- Write or generate multiple-choice quizzes at three difficulties, play with instant feedback and streaks, and try a harder one.
- Take timed practice exams with multiple-choice and written questions, marked automatically, by AI or by yourself against model answers.
- Plan the days to an exam with quiz, flashcard and explain-it activities per topic, and tick them off.

Left out: accounts and sign-in, which your Gateway handles; mobile apps and photo scanning; a shared notes library; ready-made plans; creator, referral and parent features; billing; file uploads in the tutor.

## Setup

- Install: `pnpm install`
- Run locally: `pnpm dev`
- Test: `pnpm test` for unit tests; the browser checks in `checks/` run against a packaged release.
- Deploy: `pnpm run deploy` to your EveryApp Gateway. The D1 database and its migrations come with the app.

There are no required secrets or settings. The optional "AI tutor and generation" feature needs an OpenRouter key on the Gateway (`everyapp provider add openrouter`). It powers the tutor, AI-written cards, quizzes, exams and plan topics, and AI marking of written answers.

## Limitations

- Without the OpenRouter key the tutor and every Generate button show what to set up; cards, quizzes, exams and plans can still be written by hand, and written exam answers are marked by the member.
- AI calls use one model, `anthropic/claude-haiku-5.5`, through OpenRouter.
- Each member's material is private to them; nothing is shared between members.
- Successful AI calls were checked locally against a stand-in for the provider, not a real one; a real deployment was not tested.
