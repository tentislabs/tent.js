import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import type { Caller } from '../../core/index.ts'
import type { TestApp } from '../../test/index.ts'
import { evals, judge, testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'
import { notDropped } from './started.ts'

/** A test app of the shop whose runs are rated and scored, with two people. */
async function quality(t: test.TestContext): Promise<{ app: TestApp; maya: Caller; bob: Caller }> {
  const app = await testApp({ folder: copyOf(t, 'rated') })
  t.after(() => app.close())
  return { app, maya: await app.user({ name: 'Maya', roles: [] }), bob: await app.user({ name: 'Bob', roles: [] }) }
}

/** A chat of a person. */
async function chatOf(app: TestApp, person: Caller): Promise<string> {
  const made = await app.write([{ add: 'chats', values: { by: person.user?.id } }], { as: 'system' })
  return String(Reflect.get(Object(Array.isArray(made) ? made[0] : undefined), 'id'))
}

/** A fake that answers each message, and scores an answer where it is asked as a judge, by what the test says. */
function faked(app: TestApp, score = 0.9): ReplyRequest[] {
  const judged: ReplyRequest[] = []
  app.fake('writer', (request) => {
    if (request.shape) {
      judged.push(request)
      return { value: { score, why: 'As asked.' } }
    }
    return { text: `Yes: ${String(request.messages.at(-1)?.text)}` }
  })
  return judged
}

/** The rows of the table that shows the scores, as a caller reads them. */
async function ratingsOf(app: TestApp, as: Caller): Promise<Record<string, unknown>[]> {
  const rows: unknown = await app.read({ from: 'ratings' }, { as })
  return (Array.isArray(rows) ? rows : []).map(Object)
}

test('[47-9] a rating is kept with the run, by `helper.rate` of its starter and by `runs.rate`, and another person cannot rate it', async (t) => {
  const { app, maya, bob } = await quality(t)
  faked(app)
  const { run } = notDropped(await app.start('quiet', { message: 'Hello.' }, { as: maya }))
  await app.runs.wait(run)
  await app.as(maya).call('quiet.rate', { run, score: 2, note: 'Too short.' })
  await assert.rejects(
    app.as(bob).call('quiet.rate', { run, score: 5 }),
    (error: unknown) => Reflect.get(Object(error), 'code') === 'T0001',
  )
  await app.as(maya).call('rateByMail', { run, score: '4' })
  const kept = (await ratingsOf(app, maya)).map((row) => [row.run, row.kind, row.score, row.note, row.agent])
  assert.deepEqual(kept, [
    [run, 'rating', 2, 'Too short.', 'quiet'],
    [run, 'rating', 4, 'by mail', 'quiet'],
  ])
  assert.deepEqual(await ratingsOf(app, bob), [], 'Bob reads no rating of a run of Maya')
})

test('[47-9] a share of the finished runs is scored by the judge after the run ended, in no step of it, and the score is kept', async (t) => {
  const { app, maya } = await quality(t)
  const judged = faked(app, 0.8)
  const chat = await chatOf(app, maya)
  const { run } = notDropped(
    await app.start('helper', { message: 'Is the tent in stock?', thread: chat }, { as: maya }),
  )
  assert.deepEqual(await app.runs.wait(run), { text: 'Yes: Is the tent in stock?' })
  assert.equal(app.runs.read(run)?.state, 'done')
  assert.ok(!(app.runs.read(run)?.steps ?? []).some((one) => one.name === 'score'), 'the score is no step of the run')
  let scored: Record<string, unknown>[] = []
  for (let i = 0; i < 300 && !scored.length; i++) {
    scored = (await ratingsOf(app, maya)).filter((row) => row.kind === 'score')
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.deepEqual(
    scored.map((row) => [row.run, row.score, row.why]),
    [[run, 0.8, 'As asked.']],
  )
  assert.equal(judged.length, 1)
  assert.match(JSON.stringify(judged[0]?.messages), /Answers kindly/)
  assert.match(JSON.stringify(judged[0]?.messages), /Yes: Is the tent in stock\?/)
  // A share of nothing scores no run.
  const quiet = notDropped(await app.start('quiet', { message: 'Hello.' }, { as: maya }))
  await app.runs.wait(quiet.run)
  await new Promise((done) => setTimeout(done, 100))
  assert.equal(judged.length, 1)
})

test('[47-9] a case of three turns runs on one thread, each turn seeing the turns before', async (t) => {
  const { app, maya } = await quality(t)
  const sent: ReplyRequest[] = []
  app.fake('writer', (request) => {
    if (request.shape) return { value: { score: 1, why: 'Fine.' } }
    sent.push(request)
    return { text: `Turn ${sent.length}.` }
  })
  const result = await evals(
    app,
    'helper',
    [{ name: 'three turns', say: ['First.', 'Second.', 'Third.'], expect: { text: 'Turn 3.' } }],
    { as: maya },
  )
  assert.deepEqual([result.passed, result.failed], [1, 0])
  assert.equal(sent.length, 3)
  const said = (sent[2]?.messages ?? []).filter((one) => one.who === 'user').map((one) => one.text)
  assert.deepEqual(said, ['First.', 'Second.', 'Third.'])
})

test('[47-9] `judge.fromTools` fails an answer that holds what no tool answered, and `judge.onTask` holds an answer to the task of the agent', async (t) => {
  const { app, maya } = await quality(t)
  const asked: string[] = []
  app.fake('writer', (request) => {
    const said = JSON.stringify(request.messages)
    if (request.shape) {
      asked.push(said)
      // A judge of what the tools answered gives a low score to an answer of a lamp, which no tool gave.
      const fails = /only what the tools answered/.test(said) && /red lamp/.test(said)
      return { value: fails ? { score: 0.1, why: 'A lamp no tool gave.' } : { score: 0.9, why: 'Fine.' } }
    }
    if (request.messages.at(-1)?.who === 'user') return { calls: [{ tool: 'stock' }] }
    return { text: 'We have a red lamp.' }
  })
  const result = await evals(app, 'quiet', [{ name: 'on the task', say: 'Hello.', expect: judge.onTask('writer') }], {
    as: maya,
  })
  assert.equal(result.passed, 1)
  assert.match(asked[0] ?? '', /Answer briefly\./, 'the judge is told the task of the agent')
  const tools = await evals(
    app,
    'helper',
    [{ name: 'from the tools', say: 'What lamps are there?', expect: judge.fromTools('writer') }],
    { as: maya },
  )
  assert.equal(tools.failed, 1)
  assert.match(asked.at(-1) ?? '', /only what the tools answered/)
  assert.match(asked.at(-1) ?? '', /stock/, 'the judge is told what each tool answered')
})
