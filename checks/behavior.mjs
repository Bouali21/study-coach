// Behavior: every frozen feature's main path, as a member uses it (F001-F006).
import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { createSubject, createDeck, addCard, createQuiz, addQuizQuestion } from './helpers.mjs';

const runtime = await startRuntime();
try {
  const health = await runtime.fetch('/health', { role: 'member' });
  expect(health.status).toBe(200);
  const db = await runtime.database();
  const page = await (await runtime.context('owner')).newPage();

  // F001: empty home, then a first subject.
  await page.goto('/');
  await expect(page.getByTestId('subjects-empty')).toBeVisible();
  await runtime.assertBackLink(page);
  const subjectUrl = await createSubject(page, 'Biology', 'AP Biology');
  await expect(page.getByText('AP Biology')).toBeVisible();

  // F001: rename, and delete with confirmation removes material.
  const scratchUrl = await createSubject(page, 'Chemestry');
  await page.getByTestId('rename-subject').click();
  await page.getByTestId('subject-name').fill('Chemistry');
  await page.getByTestId('subject-save').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chemistry');
  await createDeck(page, scratchUrl, 'Periodic table');
  await page.goto(scratchUrl);
  await page.getByTestId('delete-subject').click();
  await Promise.all([page.waitForURL((url) => url.pathname === '/'), page.getByTestId('confirm-delete').click()]);
  await expect(page.getByTestId('subject-card')).toHaveCount(1);
  const orphanDecks = await db.prepare("SELECT count(*) AS n FROM decks WHERE title = 'Periodic table'").first();
  expect(orphanDecks.n).toBe(0);

  // F003: a deck with cards, a review, results, then the missed cards again.
  const deckUrl = await createDeck(page, subjectUrl, 'Cell structure');
  await addCard(page, 'What does the mitochondrion do?', 'Releases energy from glucose as ATP');
  await addCard(page, 'Where are ribosomes made?', 'In the nucleolus');
  await addCard(page, 'What controls entry to the cell?', 'The cell membrane');
  await page.getByTestId('card-row').nth(1).getByTestId('edit-card').click();
  await page.getByTestId('card-back').fill('In the nucleolus, inside the nucleus');
  await page.getByTestId('card-save').click();
  await expect(page.getByText('In the nucleolus, inside the nucleus')).toBeVisible();
  await expect(page.getByTestId('due-count')).toContainText('3');
  await page.getByTestId('generate-cards').click();
  await page.getByTestId('generate-source').fill('Organelles of the animal cell');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByTestId('ai-setup')).toBeVisible();
  await page.keyboard.press('Escape');

  await Promise.all([page.waitForURL(/\/review$/), page.getByTestId('start-review').click()]);
  const marks = ['knew-it', 'still-learning', 'knew-it'];
  for (const mark of marks) {
    await expect(page.getByTestId('review-card')).toBeVisible();
    await page.getByTestId('flip').click();
    await page.getByTestId(mark).click();
  }
  await expect(page.getByTestId('review-result')).toContainText('2 of 3');
  await expect(page.getByTestId('review-xp')).toContainText('XP');
  await expect(page.getByTestId('review-time')).toBeVisible();
  await expect(page.getByTestId('known-list').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('missed-list').locator('li')).toHaveCount(1);
  await page.getByTestId('review-missed').click();
  await expect(page.getByTestId('review-card')).toBeVisible();
  await expect(page.getByTestId('review-progress')).toContainText('1 of 1');
  await page.getByTestId('flip').click();
  await page.getByTestId('still-learning').click();
  await expect(page.getByTestId('review-result')).toContainText('0 of 1');
  const boxes = await db.prepare("SELECT box, due_at <= datetime('now') AS due FROM cards ORDER BY box").all();
  expect(boxes.results.map((r) => r.box)).toEqual([1, 2, 2]);
  expect(boxes.results[0].due).toBe(1);
  expect(boxes.results[2].due).toBe(0);
  await page.goto(deckUrl);
  await expect(page.getByTestId('due-count')).toContainText('1');
  await page.getByTestId('card-row').nth(2).getByTestId('delete-card').click();
  await expect(page.getByTestId('card-row')).toHaveCount(2);

  // F004: a quiz written by hand, played with feedback and a streak, then one level harder.
  const quizUrl = await createQuiz(page, subjectUrl, 'Photosynthesis', 'medium');
  await expect(page.getByTestId('quiz-difficulty')).toHaveText(/medium/i);
  await addQuizQuestion(page, { prompt: 'Which gas do plants take in for photosynthesis?', options: ['Oxygen', 'Carbon dioxide', 'Nitrogen'], correct: 1, explanation: 'Carbon dioxide is fixed into sugar in the Calvin cycle.' });
  await addQuizQuestion(page, { prompt: 'Where do the light reactions happen?', options: ['Stroma', 'Thylakoid membranes'], correct: 1, explanation: 'Chlorophyll sits in the thylakoid membranes.' });
  await addQuizQuestion(page, { prompt: 'What is the main product of the Calvin cycle?', options: ['Glucose precursors (G3P)', 'Water'], correct: 0 });
  await page.getByTestId('generate-questions').click();
  await page.getByTestId('generate-submit').click();
  await expect(page.getByTestId('ai-setup')).toBeVisible();
  await page.keyboard.press('Escape');
  await Promise.all([page.waitForURL(/\/play$/), page.getByTestId('play-quiz').click()]);
  await page.getByTestId('answer-option').nth(1).click();
  await expect(page.getByTestId('answer-feedback')).toContainText('Correct');
  await expect(page.getByTestId('streak')).toContainText('1');
  await page.getByTestId('next-question').click();
  await page.getByTestId('answer-option').nth(0).click();
  await expect(page.getByTestId('answer-feedback')).toContainText('Not quite');
  await expect(page.getByTestId('answer-feedback')).toContainText('thylakoid');
  await page.getByTestId('next-question').click();
  await page.getByTestId('answer-option').nth(0).click();
  await expect(page.getByTestId('answer-feedback')).toContainText('Correct');
  await page.getByTestId('next-question').click();
  await expect(page.getByTestId('quiz-score')).toContainText('2/3');
  await expect(page.getByTestId('quiz-mistakes')).toContainText('1');
  await expect(page.getByTestId('quiz-best-streak')).toContainText('1');
  await expect(page.getByTestId('quiz-time')).toBeVisible();
  await expect(page.getByTestId('quiz-xp')).toContainText('XP');
  await expect(page.getByTestId('review-answer')).toHaveCount(3);
  await Promise.all([page.waitForURL((url) => /\/quizzes\/[^/]+$/.test(url.pathname) && url.href !== quizUrl), page.getByTestId('try-harder').click()]);
  await expect(page.getByTestId('quiz-difficulty')).toHaveText(/hard/i);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Photosynthesis');
  await page.goto(quizUrl);
  await expect(page.getByTestId('attempt-row')).toHaveCount(1);
  await expect(page.getByTestId('attempt-row')).toContainText('2/3');

  // F005: a timed practice exam with both kinds of question, self-marked without AI.
  await page.goto(subjectUrl);
  await page.getByTestId('new-exam').click();
  await page.getByTestId('exam-title').fill('Unit 3 mock exam');
  await page.getByTestId('exam-minutes').fill('30');
  await Promise.all([page.waitForURL(/\/exams\/[^/]+$/), page.getByTestId('exam-save').click()]);
  const examUrl = page.url();
  await page.getByTestId('add-exam-question').click();
  await page.getByTestId('eq-section').fill('Section A');
  await page.getByTestId('eq-prompt').fill('Which organelle contains chlorophyll?');
  await page.getByTestId('option-0').fill('Chloroplast');
  await page.getByTestId('option-1').fill('Vacuole');
  await page.getByTestId('correct-0').click();
  await page.getByTestId('eq-points').fill('2');
  await page.getByTestId('eq-save').click();
  await expect(page.getByTestId('exam-question-row')).toHaveCount(1);
  await page.getByTestId('add-exam-question').click();
  await page.getByTestId('eq-section').fill('Section B');
  await page.getByTestId('eq-kind-written').click();
  await page.getByTestId('eq-prompt').fill('Explain why leaves look green.');
  await page.getByTestId('eq-points').fill('3');
  await page.getByTestId('eq-model-answer').fill('Chlorophyll absorbs red and blue light and reflects green light.');
  await page.getByTestId('eq-save').click();
  await expect(page.getByTestId('exam-question-row')).toHaveCount(2);
  await expect(page.getByText('Section B')).toBeVisible();
  await page.getByTestId('generate-exam').click();
  await page.getByTestId('generate-submit').click();
  await expect(page.getByTestId('ai-setup')).toBeVisible();
  await page.keyboard.press('Escape');

  await Promise.all([page.waitForURL(/\/attempts\//), page.getByTestId('start-exam').click()]);
  await expect(page.getByTestId('exam-timer')).toContainText(/2\d:\d\d|30:00/);
  await page.getByTestId('exam-option').nth(1).click();
  await page.getByTestId('exam-option').nth(0).click();
  await page.getByTestId('exam-written').fill('Chlorophyll reflects green light and absorbs red and blue.');
  await expect(page.getByTestId('answer-saved')).toBeVisible();
  await page.getByTestId('submit-exam').click();
  await expect(page.getByTestId('exam-score')).toContainText('2 / 5');
  await expect(page.getByTestId('model-answer')).toContainText('reflects green light');
  await page.getByTestId('self-mark-points').fill('2');
  await page.getByTestId('self-mark-save').click();
  await expect(page.getByTestId('exam-score')).toContainText('4 / 5');

  // F005: time runs out; the attempt submits itself and takes no more answers.
  await page.goto(examUrl);
  await Promise.all([page.waitForURL(/\/attempts\//), page.getByTestId('start-exam').click()]);
  await page.getByTestId('exam-option').nth(0).click();
  await expect(page.getByTestId('answer-saved')).toBeVisible();
  const attemptId = page.url().split('/attempts/')[1];
  await db.prepare("UPDATE exam_attempts SET deadline_at = datetime('now', '-1 minute'), started_at = datetime('now', '-31 minutes') WHERE id = ?").bind(attemptId).run();
  await page.reload();
  await expect(page.getByTestId('time-up')).toBeVisible();
  await expect(page.getByTestId('exam-score')).toContainText('2 / 5');
  await expect(page.getByTestId('exam-written')).toHaveCount(0);
  await page.goto(examUrl);
  await expect(page.getByTestId('exam-attempt-row')).toHaveCount(2);

  // F006: a study plan spread over the days to the exam.
  await page.goto(subjectUrl);
  await page.getByTestId('new-plan').click();
  await page.getByTestId('plan-date-3').click();
  await page.getByTestId('plan-topics').fill('Cell membranes\nMitosis\nEnzymes');
  await Promise.all([page.waitForURL(/\/plans\/[^/]+$/), page.getByTestId('plan-save').click()]);
  const planUrl = page.url();
  await expect(page.getByTestId('plan-day')).toHaveCount(3);
  await expect(page.getByTestId('plan-item')).toHaveCount(9);
  await expect(page.getByTestId('plan-progress')).toContainText('0 of 9');
  await page.getByTestId('plan-item').first().getByRole('checkbox').click();
  await expect(page.getByTestId('plan-progress')).toContainText('1 of 9');
  const flashItem = page.getByTestId('plan-item').filter({ hasText: 'Flashcards' }).first();
  await Promise.all([page.waitForURL(/\/decks\//), flashItem.getByTestId('open-activity').click()]);
  const linkedDeck = page.url();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cell membranes');
  await page.goto(planUrl);
  await Promise.all([page.waitForURL(/\/decks\//), page.getByTestId('plan-item').filter({ hasText: 'Flashcards' }).first().getByTestId('open-activity').click()]);
  expect(page.url()).toBe(linkedDeck);
  await page.goto(planUrl);
  const quizItem = page.getByTestId('plan-item').filter({ hasText: 'Quiz' }).first();
  await Promise.all([page.waitForURL(/\/quizzes\//), quizItem.getByTestId('open-activity').click()]);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Cell membranes');
  await page.goto(planUrl);
  await page.getByTestId('edit-plan').click();
  await page.getByTestId('plan-topics').fill('Cell membranes\nMitosis\nEnzymes\nRespiration');
  await page.getByTestId('plan-save').click();
  await expect(page.getByText('Respiration').first()).toBeVisible();
  await expect(page.getByTestId('plan-progress')).toContainText('1 of');
  // An item from yesterday left undone stays, marked overdue.
  await db.prepare("UPDATE plan_items SET date = date('now', '-1 day') WHERE id = (SELECT id FROM plan_items WHERE done_at IS NULL AND topic = 'Mitosis' LIMIT 1)").run();
  await page.reload();
  await expect(page.getByTestId('overdue').first()).toBeVisible();

  // F002: answer style, then a question while AI is off shows the setup state.
  await page.goto('/tutor');
  await page.getByTestId('tone-direct').click();
  await page.getByTestId('warmth-warm').click();
  await page.getByTestId('emoji-none').click();
  await page.getByTestId('save-style').click();
  await expect(page.getByTestId('style-saved')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('tone-direct')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('chat-input').fill('How do I balance a redox equation?');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('ai-setup')).toBeVisible();

  // F001: the dashboard sums it up.
  await page.goto('/');
  await expect(page.getByTestId('xp-total')).toContainText('XP');
  await expect(page.getByTestId('due-today')).toContainText('1');
  await expect(page.getByTestId('today-activities').getByTestId('today-item').first()).toBeVisible();
  await expect(page.getByTestId('recent-scores')).toContainText('Photosynthesis');
  await expect(page.getByTestId('recent-scores')).toContainText('Unit 3 mock exam');
  const xp = await db.prepare('SELECT xp FROM users').first();
  expect(xp.xp).toBeGreaterThan(0);
  await page.goto(planUrl);
  await expect(page.getByTestId('plan-item').first()).toBeVisible();
  await runtime.screenshot(page);

  // Phone-sized smoke.
  const phone = await (await runtime.context('owner', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto('/');
  await expect(phone.getByTestId('subject-card')).toBeVisible();
  await expect(phone.getByText('All apps')).toBeVisible();
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  console.log('behavior: ok');
} finally {
  await runtime.close();
}
