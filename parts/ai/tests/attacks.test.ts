import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import type { FakeAnswer, TestApp } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'
import { notDropped } from './started.ts'

type User = Awaited<ReturnType<TestApp['user']>>

/** A test app of the project of the attacks, with two users and a conversation of the first. */
async function attacked(t: test.TestContext): Promise<{ app: TestApp; maya: User; leo: User; chat: string }> {
  const app = await testApp({ folder: copyOf(t, 'attacked') })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: ['member'] })
  const leo = await app.user({ name: 'Leo', roles: ['member'] })
  const chat = String(Reflect.get(Object(await app.as(maya).call('newChat', {})), 'id'))
  return { app, maya, leo, chat }
}

/** The code that a promise was refused with, or `ok`. */
const codeOf = (call: Promise<unknown>): Promise<string> =>
  call.then(
    () => 'ok',
    (error: unknown) => String(Reflect.get(Object(error), 'code')),
  )

/** A faked model that asks for one tool when a person spoke last, and else answers what the tools answered. */
const oneTool =
  (tool: string, input: unknown = {}) =>
  (request: ReplyRequest): FakeAnswer => {
    const last = request.messages.at(-1)
    if (last?.who === 'user') return { calls: [{ tool, with: input }] }
    return { text: JSON.stringify(last?.error ?? last?.result ?? null) }
  }

/** A step of a run, as `app.runs.read` shows it. */
interface Shown {
  name: string
  state: string
  repeat: number
  show?: unknown
}

const stepsOf = (app: TestApp, run: string): Shown[] => (app.runs.read(run)?.steps ?? []).map((one) => Object(one))

/** Waits until a test holds, a while at most. */
async function until(holds: () => boolean | Promise<boolean>): Promise<void> {
  for (let tries = 0; tries < 500 && !(await holds()); tries++) await new Promise((done) => setTimeout(done, 10))
}

/** Waits until a step of a run waits, and answers it. */
async function waitingStep(app: TestApp, run: string): Promise<Shown | undefined> {
  let found: Shown | undefined
  await until(() => {
    found = stepsOf(app, run).find((one) => one.state === 'waiting')
    return found !== undefined
  })
  return found
}

test('[05-8.3] a start with a file the caller may not download is T2104, as for a file that is not there', async (t) => {
  const { app, maya, leo, chat } = await attacked(t)
  app.fake('writer', [{ text: 'Never.' }])
  const theirs = String(
    await app
      .as(leo)
      .call('keepNote', { words: 'Mine.' })
      .catch(() => 'none'),
  )
  assert.equal(
    await codeOf(app.as(maya).call('guard', { message: 'Read it.', thread: chat, files: [theirs] })),
    'T2104',
  )
  assert.equal(
    await codeOf(
      app.as(maya).call('guard', { message: 'Read it.', thread: chat, files: ['01nosuchfile000000000000'] }),
    ),
    'T2104',
  )
})

test('[05-8.6] a model that names 500 tools in one answer ends the run at limits.toolCalls, and an unknown tool is answered T0001', async (t) => {
  const { app, maya, chat } = await attacked(t)
  const many = app.fake('writer', () => ({
    calls: Array.from({ length: 500 }, () => ({ tool: 'listPeople', with: {} })),
  }))
  assert.equal(await codeOf(app.as(maya).call('guard', { message: 'Go.', thread: chat })), 'T7102')
  assert.equal(many.sent.length, 1)
  const unknown = app.fake('writer', oneTool('dropTables'))
  await app.as(maya).call('guard', { message: 'Go.', thread: chat })
  // A call of a tool that is not offered is handed back with its answer as text.
  assert.match(JSON.stringify(unknown.sent[1].input), /Called dropTables with \{\}.*Error T0001: no such tool/)
})

test('[05-8.8] a tool whose error holds a secret text gives the model and the conversation T0009 and its reference', async (t) => {
  const { app, maya, chat } = await attacked(t)
  app.fake('writer', oneTool('leaky'))
  const answer = String(Reflect.get(Object(await app.as(maya).call('guard', { message: 'Go.', thread: chat })), 'text'))
  assert.match(answer, /Error T0009: Something went wrong\. Reference /)
  assert.doesNotMatch(answer, /sk-secret/)
  const rows = JSON.stringify(await app.rows('messages'))
  assert.doesNotMatch(rows, /sk-secret/)
  assert.match(rows, /T0009/)
})

test('[05-8.9] a flow as a tool reads only the rows its starter may read, and a private column does not reach the model', async (t) => {
  const { app, maya, leo, chat } = await attacked(t)
  await app.as(maya).call('addNote', { words: 'of Maya' })
  await app.as(leo).call('addNote', { words: 'of Leo' })
  await app.as(leo).call('addPerson', { name: 'Ada', salary: 9000 })
  const told: ReplyRequest[] = []
  const notes = oneTool('readNotes')
  app.fake('writer', (request) => {
    told.push(request)
    return notes(request)
  })
  const answer = String(Reflect.get(Object(await app.as(maya).call('guard', { message: 'Go.', thread: chat })), 'text'))
  assert.match(answer, /of Maya/)
  assert.doesNotMatch(answer, /of Leo/)
  app.fake('writer', oneTool('listPeople'))
  const people = String(Reflect.get(Object(await app.as(maya).call('guard', { message: 'Go.', thread: chat })), 'text'))
  assert.match(people, /Ada/)
  // The fields alone are looked at: a row's id is drawn at random, and may hold the digits of the salary.
  const fields = fieldsOf(JSON.parse(people))
  assert.equal(
    fields.some(([key]) => key === 'salary'),
    false,
  )
  assert.equal(
    fields.some(([, value]) => value === 9000 || value === '9000'),
    false,
  )
})

/** Every field of every object inside a value, as its key and its value. */
function fieldsOf(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) return value.flatMap(fieldsOf)
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, inner]): [string, unknown][] => [[key, inner], ...fieldsOf(inner)])
}

test('[05-8.14] runs started side by side are each held to their own perRun, and all of them to the limits of the model for a day and for a caller', async (t) => {
  const { app, maya, leo } = await attacked(t)
  const faked = app.fake('thrifty', () => ({ calls: [{ tool: 'listPeople', with: {} }] }))
  const runs = await Promise.all(
    [maya, maya, leo, leo].map((who) => app.start('spender', { message: 'Spend.' }, { as: who }).then(notDropped)),
  )
  const ends = await Promise.all(runs.map(({ run }) => codeOf(app.runs.wait(run))))
  assert.deepEqual(
    ends.every((one) => one === 'T7102'),
    true,
  )
  // Two a caller, and five a day at most: four of the two callers.
  assert.equal(faked.sent.length, 4)
  const visitor = notDropped(await app.start('spender', { message: 'Spend.' }, { as: 'nobody' }))
  assert.equal(await codeOf(app.runs.wait(visitor.run)), 'T7102')
  assert.equal(faked.sent.length, 5)
  const late = notDropped(await app.start('spender', { message: 'Spend.' }, { as: 'nobody' }))
  assert.equal(await codeOf(app.runs.wait(late.run)), 'T7102')
  assert.equal(faked.sent.length, 5)
})

test('[05-8.15] a visitor who drops the cookie before every start counts with the callers who have no visitor id, after a restart too', async (t) => {
  const { app } = await attacked(t)
  const faked = app.fake('thrifty', [{ text: 'Spent.' }, { text: 'Spent.' }, { text: 'Spent.' }])
  const start = async (): Promise<number> => {
    // A new browser each time: no cookie, so no visitor id.
    const browser = app.browser()
    const answer = await browser.request('POST', '/_t/call/spender', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { message: 'Spend.' } }),
    })
    return answer.status
  }
  await start()
  await start()
  await until(() => faked.sent.length >= 2)
  await start()
  await new Promise((done) => setTimeout(done, 300))
  assert.equal(faked.sent.length, 2)
  await app.restart()
  app.fake('thrifty', [{ text: 'Spent.' }])
  await start()
  await new Promise((done) => setTimeout(done, 300))
  assert.equal(app.fake('thrifty').sent.length, 0)
})

test('[05-8.16] a tool that asks before it runs runs with the input that was shown, the saved one of its step', async (t) => {
  const { app, maya, chat } = await attacked(t)
  let round = 0
  app.fake('writer', (request) => {
    round++
    const last = request.messages.at(-1)
    if (last?.who === 'tool') return { text: String(last.result) }
    return { calls: [{ tool: 'askFirst', with: { words: round === 1 ? 'shown' : 'another' } }] }
  })
  const { run } = notDropped(await app.start('guard', { message: 'Go.', thread: chat }, { as: maya }))
  const step = await waitingStep(app, run)
  assert.deepEqual(step?.show, { tool: 'askFirst', input: { words: 'shown' } })
  app.runs.approve(run, 'ask 1.1')
  assert.deepEqual(await app.runs.wait(run), { text: 'said shown' })
})

test('[05-8.19] a flow tool whose step runs in a loop, each pass asking: a yes for pass 1 sent twice is T0002, and pass 2 still waits', async (t) => {
  const { app, maya, chat } = await attacked(t)
  app.fake('writer', oneTool('loopMail'))
  const { run } = notDropped(await app.start('guard', { message: 'Go.', thread: chat }, { as: maya }))
  let inner = ''
  await until(async () => {
    const [one] = (await app.runs.find({ top: run, of: 'all' })).filter((found) => found.flow === 'loopMail')
    inner = one?.id ?? ''
    return Boolean(inner && stepsOf(app, inner).some((step) => step.state === 'waiting'))
  })
  app.runs.approve(inner, 'mail', undefined, { repeat: 1 })
  assert.throws(() => app.runs.approve(inner, 'mail', undefined, { repeat: 1 }), { code: 'T0002' })
  await until(() => stepsOf(app, inner).some((step) => step.state === 'waiting' && step.repeat === 2))
  assert.equal(app.mailbox.length, 1)
  app.runs.approve(inner, 'mail', undefined, { repeat: 2 })
  assert.deepEqual(await app.runs.wait(run), { text: '"mailed"' })
  assert.equal(app.mailbox.length, 2)
})

test('[05-8.20] a row changed between an ask on demand and its yes sends the agreed mail to the new receiver: a yes on demand agrees to a name', async (t) => {
  const { app, maya, chat } = await attacked(t)
  const friend = String(Reflect.get(Object(await app.as(maya).call('addFriend', { email: 'old@example.com' })), 'id'))
  app.fake('writer', oneTool('mailFriend', { friend }))
  const { run } = notDropped(await app.start('guard', { message: 'Go.', thread: chat }, { as: maya }))
  const step = await waitingStep(app, run)
  assert.deepEqual(step?.show, { call: 'mail.send' })
  await app.as(maya).call('moveFriend', { friend, email: 'new@example.com' })
  app.runs.approve(run, String(step?.name))
  await app.runs.wait(run)
  assert.deepEqual(
    app.mailbox.map((one) => JSON.stringify(Reflect.get(Object(one), 'to'))),
    ['[{"address":"new@example.com"}]'],
  )
})

test("[05-8.21] [05-8.22] an agreed function with a mail in it, then two mails of the tool's own over three makings: each mail is sent once, and a yes never passes the next", async (t) => {
  for (const tool of ['threeMails', 'quietThree']) {
    const { app, maya, chat } = await attacked(t)
    app.fake('writer', oneTool(tool))
    const { run } = notDropped(await app.start('guard', { message: 'Go.', thread: chat }, { as: maya }))
    for (let ask = 1; ask <= 3; ask++) {
      let step: Shown | undefined
      await until(() => {
        step = stepsOf(app, run).find((one) => one.state === 'waiting')
        return step !== undefined && app.mailbox.length === ask - 1
      })
      assert.equal(app.mailbox.length, ask - 1, `${tool}, before the yes ${ask}`)
      assert.ok(step, `${tool} waits for its yes ${ask}`)
      app.runs.approve(run, step.name)
      await until(() => app.mailbox.length >= ask)
    }
    assert.deepEqual(await app.runs.wait(run), { text: '"mailed"' })
    assert.equal(app.mailbox.length, 3, tool)
  }
})

test('[05-8.24] runs.approve sent twice for one ask of a step that runs in a loop, with the repeat and the n that runs.read gave, is T0002 the second time', async (t) => {
  const { app, maya, chat } = await attacked(t)
  app.fake('writer', oneTool('loopMail'))
  const { run } = notDropped(await app.start('guard', { message: 'Go.', thread: chat }, { as: maya }))
  let inner = ''
  await until(async () => {
    const [one] = (await app.runs.find({ top: run, of: 'all' })).filter((found) => found.flow === 'loopMail')
    inner = one?.id ?? ''
    return Boolean(inner && stepsOf(app, inner).some((step) => step.state === 'waiting'))
  })
  const waiting = (app.runs.read(inner)?.steps ?? []).find((one) => one.state === 'waiting')
  const how = {
    repeat: Number(Reflect.get(Object(waiting), 'repeat')),
    n: Number(Reflect.get(Object(Reflect.get(Object(waiting), 'ask')), 'n') ?? 1),
  }
  app.runs.approve(inner, 'mail', undefined, how)
  assert.throws(() => app.runs.approve(inner, 'mail', undefined, how), { code: 'T0002' })
})

test("[05-8.25] with then: stop, a message of a second person who may open the conversation stops the first one's run; one who may not open it is T2103", async (t) => {
  const { app, maya, leo, chat } = await attacked(t)
  let release = (): void => undefined
  const held = new Promise<void>((done) => {
    release = done
  })
  let asked = 0
  app.fake('writer', async () => {
    asked++
    if (asked === 1) await held
    return { text: `Answer ${asked}.` }
  })
  const first = notDropped(await app.start('steered', { message: 'One.', thread: chat }, { as: maya }))
  await until(() => asked === 1)
  const second = notDropped(await app.start('steered', { message: 'Two.', thread: chat }, { as: leo }))
  await until(() => app.runs.read(first.run)?.state === 'stopped')
  release()
  assert.equal(await codeOf(app.runs.wait(first.run)), 'T5106')
  assert.deepEqual(await app.runs.wait(second.run), { text: 'Answer 2.' })
  const ola = await app.user({ name: 'Ola', roles: [] })
  assert.equal(await codeOf(app.start('steered', { message: 'Three.', thread: chat }, { as: ola })), 'T2103')
})

test('[05-8.26] [05-8.26@9a] the eleventh queued start on one conversation is T7103', async (t) => {
  const { app, maya, chat } = await attacked(t)
  let release = (): void => undefined
  const held = new Promise<void>((done) => {
    release = done
  })
  app.fake('writer', async () => {
    await held
    return { text: 'Done.' }
  })
  await app.start('queued', { message: 'First.', thread: chat }, { as: maya })
  for (let n = 1; n <= 10; n++) await app.start('queued', { message: `Then ${n}.`, thread: chat }, { as: maya })
  assert.equal(await codeOf(app.start('queued', { message: 'One too many.', thread: chat }, { as: maya })), 'T7103')
  release()
})
