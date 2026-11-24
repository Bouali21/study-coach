// Shared steps for the suites: each drives the app the way a person does.
import { expect } from '/home/user/oss-new/control/runtime/index.mjs';

export async function createSubject(page, name, label) {
  await page.goto('/');
  await page.getByTestId('new-subject').click();
  await page.getByTestId('subject-name').fill(name);
  if (label) await page.getByTestId('subject-label').fill(label);
  await Promise.all([page.waitForURL(/\/subjects\/[^/]+$/), page.getByTestId('subject-save').click()]);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  return page.url();
}

export async function createDeck(page, subjectUrl, title) {
  await page.goto(subjectUrl);
  await page.getByTestId('new-deck').click();
  await page.getByTestId('deck-title').fill(title);
  await Promise.all([page.waitForURL(/\/decks\/[^/]+$/), page.getByTestId('deck-save').click()]);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  return page.url();
}

export async function addCard(page, front, back) {
  const before = await page.getByTestId('card-row').count();
  await page.getByTestId('add-card').click();
  await page.getByTestId('card-front').fill(front);
  await page.getByTestId('card-back').fill(back);
  await page.getByTestId('card-save').click();
  await expect(page.getByTestId('card-row')).toHaveCount(before + 1);
}

export async function createQuiz(page, subjectUrl, topic, difficulty) {
  await page.goto(subjectUrl);
  await page.getByTestId('new-quiz').click();
  await page.getByTestId('quiz-topic').fill(topic);
  await page.getByTestId(`difficulty-${difficulty}`).click();
  await Promise.all([page.waitForURL(/\/quizzes\/[^/]+$/), page.getByTestId('quiz-save').click()]);
  return page.url();
}

export async function addQuizQuestion(page, { prompt, options, correct, explanation }) {
  const before = await page.getByTestId('question-row').count();
  await page.getByTestId('add-question').click();
  await page.getByTestId('question-prompt').fill(prompt);
  for (let i = 0; i < options.length; i++) {
    if (i >= 2) await page.getByTestId('add-option').click();
    await page.getByTestId(`option-${i}`).fill(options[i]);
  }
  await page.getByTestId(`correct-${correct}`).click();
  if (explanation) await page.getByTestId('question-explanation').fill(explanation);
  await page.getByTestId('question-save').click();
  await expect(page.getByTestId('question-row')).toHaveCount(before + 1);
}
