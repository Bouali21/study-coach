// Persistence: study material and progress survive a restart.
import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { createSubject, createDeck, addCard } from './helpers.mjs';

const runtime = await startRuntime();
try {
  let page = await (await runtime.context('member')).newPage();
  const subjectUrl = await createSubject(page, 'Geography', 'Mock exams');
  const deckUrl = await createDeck(page, subjectUrl, 'Rivers');
  await addCard(page, 'Longest river in Africa?', 'The Nile');
  await Promise.all([page.waitForURL(/\/review$/), page.getByTestId('start-review').click()]);
  await page.getByTestId('flip').click();
  await page.getByTestId('knew-it').click();
  await expect(page.getByTestId('review-result')).toContainText('1 of 1');

  await runtime.restart();
  page = await (await runtime.context('member')).newPage();
  await page.goto('/');
  await expect(page.getByTestId('subject-card')).toContainText('Geography');
  await expect(page.getByTestId('xp-total')).not.toContainText(/^0 XP$/);
  await page.goto(deckUrl);
  await expect(page.getByTestId('card-row')).toContainText('The Nile');
  await expect(page.getByTestId('due-count')).toContainText('0');
  console.log('persistence: ok');
} finally {
  await runtime.close();
}
