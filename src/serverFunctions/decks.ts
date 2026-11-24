import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { aiResult } from "@/server/ai";
import * as decks from "@/server/decks";
import { idInput } from "@/server/subjects";
import { found, memberId } from "./member";

export const getDeckPage = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await decks.deckPage(await memberId(context.user), data.id)),
  );

export const getReviewCards = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.extend({ all: z.boolean() }).parse(data))
  .handler(async ({ data, context }) =>
    found(await decks.reviewCards(await memberId(context.user), data.id, data.all)),
  );

export const createDeck = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => decks.createDeckInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await decks.createDeck(await memberId(context.user), data)),
  );

export const deleteDeck = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await decks.deleteDeck(await memberId(context.user), data.id)),
  );

export const saveCard = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => decks.cardInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await decks.saveCard(await memberId(context.user), data)),
  );

export const deleteCard = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => decks.cardRef.parse(data))
  .handler(async ({ data, context }) =>
    found(await decks.deleteCard(await memberId(context.user), data)),
  );

export const generateCards = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => decks.generateInput.parse(data))
  .handler(async ({ data, context }) => {
    const deck = found(await decks.getDeck(await memberId(context.user), data.deckId));
    return aiResult(async () => {
      const list = await decks.draftCards(data.source, deck.subject);
      await decks.addCards(deck.id, list);
      return list.length;
    });
  });

export const recordReview = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => decks.reviewInput.parse(data))
  .handler(async ({ data, context }) =>
    found(await decks.recordReview(await memberId(context.user), data)),
  );
