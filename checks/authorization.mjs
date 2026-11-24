// Authorization: private paths, per-member isolation, no admin reach into study data, no own sign-in (X001).
import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { createSubject, createDeck, addCard, createQuiz, addQuizQuestion } from './helpers.mjs';

const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess(['/', '/tutor']);
  for (const path of ['/health', '/subjects/x', '/decks/x']) {
    expect((await runtime.fetch(path)).status).not.toBe(200);
    expect((await runtime.fetch(path, { role: 'outsider' })).status).not.toBe(200);
  }
  // No sign-in of its own.
  for (const path of ['/login', '/signin', '/sign-in', '/signup', '/register', '/logout', '/auth/login']) {
    const response = await runtime.fetch(path, { role: 'member' });
    expect(response.status).not.toBe(200);
    expect(await response.text()).not.toMatch(/type="password"/);
  }

  const owner = await (await runtime.context('owner')).newPage();
  const member = await (await runtime.context('member')).newPage();
  const db = await runtime.database();

  // The owner's material.
  const subjectUrl = await createSubject(owner, 'History', 'Final exam');
  const deckUrl = await createDeck(owner, subjectUrl, 'Treaties');
  await addCard(owner, 'Treaty of Westphalia year?', '1648');
  const quizUrl = await createQuiz(owner, subjectUrl, 'Cold War', 'easy');
  await addQuizQuestion(owner, { prompt: 'When did the Berlin Wall fall?', options: ['1989', '1991'], correct: 0 });
  await owner.goto(subjectUrl);
  await owner.getByTestId('new-exam').click();
  await owner.getByTestId('exam-title').fill('History mock');
  await owner.getByTestId('exam-minutes').fill('10');
  await Promise.all([owner.waitForURL(/\/exams\/[^/]+$/), owner.getByTestId('exam-save').click()]);
  const examUrl = owner.url();
  await owner.goto(subjectUrl);
  await owner.getByTestId('new-plan').click();
  await owner.getByTestId('plan-date-tomorrow').click();
  await owner.getByTestId('plan-topics').fill('Cold War');
  await Promise.all([owner.waitForURL(/\/plans\/[^/]+$/), owner.getByTestId('plan-save').click()]);
  const planUrl = owner.url();

  // Another member sees none of it, by list or by address.
  await member.goto('/');
  await expect(member.getByTestId('subjects-empty')).toBeVisible();
  await expect(member.getByText('History')).toHaveCount(0);
  for (const url of [subjectUrl, deckUrl, `${deckUrl}/review`, quizUrl, `${quizUrl}/play`, examUrl, planUrl]) {
    await member.goto(url);
    await expect(member.getByTestId('not-found')).toBeVisible();
    await expect(member.getByText('History mock')).toHaveCount(0);
    await expect(member.getByText('Treaty of Westphalia')).toHaveCount(0);
  }

  // A change the owner made, replayed by the member, changes nothing.
  await owner.goto(subjectUrl);
  await owner.getByTestId('rename-subject').click();
  await owner.getByTestId('subject-name').fill('Modern History');
  const [renameRequest] = await Promise.all([
    owner.waitForRequest((request) => request.method() === 'POST' && request.url().includes('_serverFn')),
    owner.getByTestId('subject-save').click(),
  ]);
  await expect(owner.getByRole('heading', { level: 1 })).toHaveText('Modern History');
  await owner.getByTestId('rename-subject').click();
  await owner.getByTestId('subject-name').fill('History');
  await owner.getByTestId('subject-save').click();
  await expect(owner.getByRole('heading', { level: 1 })).toHaveText('History');
  await member.goto('/');
  // Replayed from the member's own page, so it carries the member's identity.
  const replayStatus = await member.evaluate(async ({ url, body, headers }) => {
    const response = await fetch(url, { method: 'POST', headers, body });
    return response.status;
  }, {
    url: new URL(renameRequest.url()).pathname,
    body: renameRequest.postData() ?? '',
    headers: { 'content-type': renameRequest.headers()['content-type'] ?? 'application/json', 'x-tsr-serverfn': 'true', accept: renameRequest.headers()['accept'] ?? 'application/json' },
  });
  expect(replayStatus).not.toBe(0);
  const subject = await db.prepare("SELECT name FROM subjects WHERE id = ?").bind(subjectUrl.split('/subjects/')[1]).first();
  expect(subject.name).toBe('History');

  // The admin (owner) cannot open a member's material either.
  const memberSubject = await createSubject(member, 'Spanish', 'B1');
  const memberDeck = await createDeck(member, memberSubject, 'Verbs');
  await owner.goto(memberSubject);
  await expect(owner.getByTestId('not-found')).toBeVisible();
  await owner.goto(memberDeck);
  await expect(owner.getByTestId('not-found')).toBeVisible();
  await owner.goto('/');
  await expect(owner.getByText('Spanish')).toHaveCount(0);
  console.log('authorization: ok');
} finally {
  await runtime.close();
}
