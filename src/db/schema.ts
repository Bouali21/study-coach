import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`);

// One row per Gateway user (`user.id`), created on first sight.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  tone: text("tone").notNull().default("friendly"),
  warmth: text("warmth").notNull().default("balanced"),
  emoji: text("emoji").notNull().default("some"),
  xp: integer("xp").notNull().default(0),
  createdAt: createdAt(),
});

export const subjects = sqliteTable(
  "subjects",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    label: text("label"),
    createdAt: createdAt(),
  },
  (t) => [index("subjects_owner").on(t.ownerId)],
);

const subjectRef = () =>
  text("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" });
const ownerRef = () => text("owner_id").notNull();

export const chats = sqliteTable(
  "chats",
  {
    id: id(),
    ownerId: ownerRef(),
    subjectId: text("subject_id").references(() => subjects.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("chats_owner").on(t.ownerId, t.updatedAt)],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: id(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    seq: integer("seq").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("chat_messages_chat").on(t.chatId, t.seq)],
);

export const decks = sqliteTable(
  "decks",
  {
    id: id(),
    ownerId: ownerRef(),
    subjectId: subjectRef(),
    title: text("title").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("decks_owner").on(t.ownerId, t.subjectId)],
);

export const cards = sqliteTable(
  "cards",
  {
    id: id(),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    front: text("front").notNull(),
    back: text("back").notNull(),
    box: integer("box").notNull().default(1),
    dueAt: text("due_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    seq: integer("seq").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("cards_deck").on(t.deckId, t.dueAt)],
);

export const deckReviews = sqliteTable("deck_reviews", {
  id: id(),
  deckId: text("deck_id")
    .notNull()
    .references(() => decks.id, { onDelete: "cascade" }),
  ownerId: ownerRef(),
  known: integer("known").notNull(),
  total: integer("total").notNull(),
  seconds: integer("seconds").notNull(),
  xp: integer("xp").notNull(),
  createdAt: createdAt(),
});

export const quizzes = sqliteTable(
  "quizzes",
  {
    id: id(),
    ownerId: ownerRef(),
    subjectId: subjectRef(),
    topic: text("topic").notNull(),
    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] })
      .notNull()
      .default("medium"),
    createdAt: createdAt(),
  },
  (t) => [index("quizzes_owner").on(t.ownerId, t.subjectId)],
);

export const quizQuestions = sqliteTable(
  "quiz_questions",
  {
    id: id(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    prompt: text("prompt").notNull(),
    options: text("options", { mode: "json" }).$type<string[]>().notNull(),
    correctIndex: integer("correct_index").notNull(),
    explanation: text("explanation"),
  },
  (t) => [index("quiz_questions_quiz").on(t.quizId, t.seq)],
);

export const quizAttempts = sqliteTable(
  "quiz_attempts",
  {
    id: id(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    ownerId: ownerRef(),
    startedAt: text("started_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    finishedAt: text("finished_at"),
    score: integer("score"),
    total: integer("total").notNull(),
    bestStreak: integer("best_streak"),
    seconds: integer("seconds"),
    xp: integer("xp"),
  },
  (t) => [index("quiz_attempts_quiz").on(t.quizId)],
);

export const quizAnswers = sqliteTable(
  "quiz_answers",
  {
    id: id(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => quizAttempts.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => quizQuestions.id, { onDelete: "cascade" }),
    choice: integer("choice").notNull(),
    correct: integer("correct", { mode: "boolean" }).notNull(),
    seq: integer("seq").notNull(),
  },
  (t) => [uniqueIndex("quiz_answers_once").on(t.attemptId, t.questionId)],
);

export const exams = sqliteTable(
  "exams",
  {
    id: id(),
    ownerId: ownerRef(),
    subjectId: subjectRef(),
    title: text("title").notNull(),
    minutes: integer("minutes").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("exams_owner").on(t.ownerId, t.subjectId)],
);

export const examQuestions = sqliteTable(
  "exam_questions",
  {
    id: id(),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    seq: integer("seq").notNull(),
    kind: text("kind", { enum: ["mc", "written"] }).notNull(),
    prompt: text("prompt").notNull(),
    options: text("options", { mode: "json" }).$type<string[]>(),
    correctIndex: integer("correct_index"),
    modelAnswer: text("model_answer"),
    points: integer("points").notNull(),
  },
  (t) => [index("exam_questions_exam").on(t.examId, t.seq)],
);

export const examAttempts = sqliteTable(
  "exam_attempts",
  {
    id: id(),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    ownerId: ownerRef(),
    startedAt: text("started_at").notNull(),
    deadlineAt: text("deadline_at").notNull(),
    submittedAt: text("submitted_at"),
    timedOut: integer("timed_out", { mode: "boolean" })
      .notNull()
      .default(false),
    maxScore: integer("max_score").notNull(),
    xp: integer("xp"),
  },
  (t) => [index("exam_attempts_exam").on(t.examId)],
);

export const examAnswers = sqliteTable(
  "exam_answers",
  {
    id: id(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => examAttempts.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => examQuestions.id, { onDelete: "cascade" }),
    choice: integer("choice"),
    text: text("text"),
    awarded: integer("awarded"),
    feedback: text("feedback"),
  },
  (t) => [uniqueIndex("exam_answers_once").on(t.attemptId, t.questionId)],
);

export const plans = sqliteTable(
  "plans",
  {
    id: id(),
    ownerId: ownerRef(),
    subjectId: subjectRef(),
    examDate: text("exam_date").notNull(),
    topics: text("topics", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("plans_owner").on(t.ownerId, t.subjectId)],
);

export const planItems = sqliteTable(
  "plan_items",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    topic: text("topic").notNull(),
    kind: text("kind", { enum: ["quiz", "flashcards", "explain"] }).notNull(),
    seq: integer("seq").notNull(),
    doneAt: text("done_at"),
    note: text("note"),
    linkedId: text("linked_id"),
  },
  (t) => [index("plan_items_plan").on(t.planId, t.date)],
);
