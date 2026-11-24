// Behavior with AI configured: a local fake answers the Gateway's AI route (F002-F006 AI paths).
import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { createSubject, createDeck, createQuiz } from './helpers.mjs';

const FAKE = `
function reply(content) {
  return Response.json({ id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] });
}
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.endsWith('/chat/completions')) return new Response('not found', { status: 404 });
    const body = await request.json();
    const system = body.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\\n');
    const last = body.messages[body.messages.length - 1].content;
    if (system.includes('TASK:cards')) return reply(JSON.stringify({ cards: [
      { front: 'What is osmosis?', back: 'Diffusion of water across a membrane' },
      { front: 'What is active transport?', back: 'Movement against a gradient using ATP' } ] }));
    if (system.includes('TASK:quiz')) return reply(JSON.stringify({ questions: [
      { prompt: 'Which molecule carries energy in cells?', options: ['ATP', 'DNA', 'Starch'], correct: 0, explanation: 'ATP releases energy when a phosphate is removed.' },
      { prompt: 'Where is DNA kept in a plant cell?', options: ['Cell wall', 'Nucleus'], correct: 1, explanation: 'The nucleus holds the chromosomes.' } ] }));
    if (system.includes('TASK:exam')) return reply(JSON.stringify({ title: 'Generated mock', sections: [
      { name: 'Multiple choice', questions: [ { kind: 'mc', prompt: 'What is the powerhouse of the cell?', options: ['Mitochondrion', 'Golgi body'], correct: 0, points: 1 } ] },
      { name: 'Written', questions: [ { kind: 'written', prompt: 'Describe diffusion.', modelAnswer: 'Net movement of particles from high to low concentration.', points: 4 } ] } ] }));
    if (system.includes('TASK:grade')) return reply(JSON.stringify({ awarded: 3, feedback: 'Good definition; mention concentration gradient.' }));
    if (system.includes('TASK:topics')) return reply(JSON.stringify({ topics: ['Osmosis', 'Diffusion'] }));
    const tone = (system.match(/Tone: (\\w+)/) || [])[1] || 'none';
    return reply('Step 1: write the half-equations. Step 2: balance electrons. [tone ' + tone + '] You asked: ' + last);
  },
};`;

const runtime = await startRuntime({
  bindings: { EVERY_APP_GATEWAY: { type: 'worker', worker: 'fake-ai-gateway' } },
  workers: [{ config: { name: 'fake-ai-gateway', compatibilityDate: '2025-06-01', manifest: { mainModule: 'fake.mjs', modules: { 'fake.mjs': { type: 'esm', contents: Buffer.from(FAKE) } } } } }],
});
try {
  const page = await (await runtime.context('member')).newPage();
  const subjectUrl = await createSubject(page, 'Biology', 'GCSE');
  await runtime.assertBackLink(page);

  // F002: style shapes the reply; history is kept, listed and reopened.
  await page.goto('/tutor');
  await page.getByTestId('tone-relaxed').click();
  await page.getByTestId('save-style').click();
  await expect(page.getByTestId('style-saved')).toBeVisible();
  await page.goto(subjectUrl);
  await Promise.all([page.waitForURL(/\/tutor/), page.getByTestId('ask-tutor').click()]);
  await page.getByTestId('chat-input').fill('How does osmosis work?');
  await Promise.all([page.waitForURL(/\/tutor\/[^/]+$/), page.getByTestId('chat-send').click()]);
  await expect(page.getByTestId('chat-message').filter({ hasText: 'Step 1' })).toBeVisible();
  await expect(page.getByTestId('chat-message').last()).toContainText('[tone relaxed]');
  await page.getByTestId('chat-input').fill('And active transport?');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-message')).toHaveCount(4);
  const chatUrl = page.url();
  await page.goto('/tutor');
  await expect(page.getByTestId('chat-row')).toHaveCount(1);
  await expect(page.getByTestId('chat-row')).toContainText('osmosis');
  await page.getByTestId('chat-row').click();
  await expect(page.getByTestId('chat-message')).toHaveCount(4);

  // F002 to F003/F004: the conversation becomes a deck and a quiz.
  await Promise.all([page.waitForURL(/\/decks\//), page.getByTestId('make-deck').click()]);
  await expect(page.getByTestId('card-row')).toHaveCount(2);
  await page.goto(chatUrl);
  await Promise.all([page.waitForURL(/\/quizzes\//), page.getByTestId('make-quiz').click()]);
  await expect(page.getByTestId('question-row')).toHaveCount(2);

  // F003 and F004: generation from a topic or notes.
  await createDeck(page, subjectUrl, 'Transport');
  await page.getByTestId('generate-cards').click();
  await page.getByTestId('generate-source').fill('Osmosis and active transport across membranes');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByTestId('card-row')).toHaveCount(2);
  await createQuiz(page, subjectUrl, 'Cell energy', 'easy');
  await page.getByTestId('generate-questions').click();
  await page.getByTestId('generate-submit').click();
  await expect(page.getByTestId('question-row')).toHaveCount(2);

  // F005: generated exam, written answer graded with feedback.
  await page.goto(subjectUrl);
  await page.getByTestId('new-exam').click();
  await page.getByTestId('exam-title').fill('Cells mock');
  await page.getByTestId('exam-minutes').fill('20');
  await Promise.all([page.waitForURL(/\/exams\/[^/]+$/), page.getByTestId('exam-save').click()]);
  await page.getByTestId('generate-exam').click();
  await page.getByTestId('generate-source').fill('Cells, diffusion');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByTestId('exam-question-row')).toHaveCount(2);
  await Promise.all([page.waitForURL(/\/attempts\//), page.getByTestId('start-exam').click()]);
  await page.getByTestId('exam-option').nth(0).click();
  await page.getByTestId('exam-written').fill('Particles spread from high to low concentration.');
  await expect(page.getByTestId('answer-saved')).toBeVisible();
  await page.getByTestId('submit-exam').click();
  await expect(page.getByTestId('exam-score')).toContainText('4 / 5');
  await expect(page.getByTestId('ai-feedback')).toContainText('concentration gradient');

  // F006: suggested topics.
  await page.goto(subjectUrl);
  await page.getByTestId('new-plan').click();
  await page.getByTestId('plan-date-tomorrow').click();
  await page.getByTestId('suggest-topics').click();
  await expect(page.getByTestId('plan-topics')).toHaveValue(/Osmosis\nDiffusion/);
  await Promise.all([page.waitForURL(/\/plans\/[^/]+$/), page.getByTestId('plan-save').click()]);
  await expect(page.getByTestId('plan-item')).toHaveCount(6);
  console.log('behavior-ai: ok');
} finally {
  await runtime.close();
}
