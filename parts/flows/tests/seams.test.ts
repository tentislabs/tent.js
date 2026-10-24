import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fail, mail, TentError } from '../../core/index.ts'
import type { Runtime } from '../../core/internal.ts'
import { runBody, setRuntime } from '../../core/internal.ts'
import type { Driver, FlowBody } from '../index.ts'
import type { Bench } from './bench.ts'
import { bench, codeOf, handClock, openStore, workFolder } from './bench.ts'

const day = 86_400_000

/** A flow whose `run` was read, as the engine hands it to the runner: a function that carries its stored body out. */
const stored =
  (body: object[]): FlowBody =>
  async ({ tick, ...handed }) =>
    runBody(body, handed, tick ? { tick } : {})

test('[23-20] a runner made with a test `env` runs a code flow and a flow whose `run` was read, each as `env.body` hands it, and `told` hears every step begin and end', async (t) => {
  const ran: string[] = []
  const note = (what: string) => (): string => {
    ran.push(what)
    return what
  }
  // The stored body of: const first = await step('first', () => ...); await step.wait('1 day'); return { first, second }
  const body = [
    {
      const: 'first',
      value: { await: { fn: 'step', args: ['first', { arrow: [], do: [{ return: { name: ['input', 'name'] } }] }] } },
    },
    { do: { await: { fn: 'step.wait', args: ['1 day'] } } },
    {
      return: {
        object: [
          ['first', { name: ['first'] }],
          ['second', { await: { fn: 'step', args: ['second', { arrow: [], do: [{ return: 'read' }] }] } }],
        ],
      },
    },
  ]
  const b = bench(t, {
    code: async ({ input, step }) => {
      const first = await step('first', note(String(Object(input).name)))
      await step.wait('1 day')
      return { first, second: await step('second', note('code')) }
    },
    read: stored(body),
  })
  const code = b.start('code', { name: 'Ada' }, { startedBy: { kind: 'user', id: 'ada' } })
  const read = b.start('read', { name: 'Bob' })
  await b.until(code, 'waiting')
  await b.until(read, 'waiting')
  b.clock.advance(day)
  assert.deepEqual(await b.runner.wait(code), { first: 'Ada', second: 'code' })
  assert.deepEqual(
    await b.runner.wait(read),
    { first: 'Bob', second: 'read' },
    'the stored body is carried out as the code is',
  )
  assert.deepEqual(ran, ['Ada', 'code'])
  for (const run of [code, read])
    assert.deepEqual(
      b.runner.read(run)?.steps.map((step) => [step.name, step.repeat, step.state]),
      [
        ['first', 1, 'done'],
        ['wait', 1, 'done'],
        ['second', 1, 'done'],
      ],
    )
  // `told` hears every step begin and end, and each state of its run.
  assert.deepEqual(
    b.told
      .filter((one) => one.run === code)
      .map((one) => (one.kind === 'run' ? one.state : `${one.name} ${one.state}`)),
    [
      'running',
      'first started',
      'first done',
      'wait waiting',
      'waiting',
      'running',
      'wait done',
      'second started',
      'second done',
      'done',
    ],
  )
})

test('[23-20] a driver given with `drive` is called for a flow record of its kind, and a run that wakes asks `env.caller` again', async (t) => {
  const driven: unknown[] = []
  const driver: Driver = async (run) => {
    driven.push([run.id === run.top, run.record, run.input, run.starter.kind, typeof run.worked(), run.signal.aborted])
    const first = await run.step('think', () => 'thought')
    await run.step.wait('1 day')
    return { text: `${first} and answered` }
  }
  const b = bench(
    t,
    {
      helper: { record: { agent: { model: 'writer' } } },
      plain: async ({ step }) => {
        await step.wait('1 day')
        return 'a flow of its own'
      },
    },
    { drivers: { agent: driver } },
  )
  const starter = { kind: 'user', id: 'ada' } as const
  const run = b.start('helper', { message: 'hello' }, { startedBy: starter })
  const plain = b.start('plain', undefined, { startedBy: starter })
  await b.until(run, 'waiting')
  await b.until(plain, 'waiting')
  // The record of the kind is run by its driver, as the starter, and a flow with no such record by its own `run`.
  assert.equal(b.runner.read(run)?.kind, 'agent')
  assert.equal(b.runner.read(run)?.as, 'starter')
  assert.equal(b.runner.read(plain)?.kind, 'flow')
  assert.deepEqual(b.asked, [starter], 'the engine was asked for the caller of the run that runs as its starter')
  b.clock.advance(day)
  assert.deepEqual(await b.runner.wait(run), { text: 'thought and answered' })
  assert.equal(await b.runner.wait(plain), 'a flow of its own')
  assert.deepEqual(b.asked, [starter, starter], 'the run that woke asked for its caller again')
  const record = { form: 'code', export: 'helper', agent: { model: 'writer' } }
  assert.deepEqual(driven, [
    [true, record, { message: 'hello' }, 'user', 'number', false],
    [true, record, { message: 'hello' }, 'user', 'number', false],
  ])
  // A starter who is gone: the engine knows nobody of that id, and the run fails with what it threw.
  const gone = b.start('helper', {}, { startedBy: { kind: 'user', id: 'gone' } })
  assert.equal(await codeOf(b.runner.wait(gone)), 'T3101')
})

test('[23-16] a refused wait-for saves `{ approved: false }`, and the flow goes on', async (t) => {
  const b = bench(t, {
    asks: async ({ step }) => {
      const said = await step.waitFor('approval', { show: { amount: 5 }, timeout: '2 days' })
      const after = await step('after', () => (said.approved ? 'approved' : 'refused'))
      return { said, after }
    },
  })
  const run = b.start('asks')
  await b.until(run, 'waiting')
  const [waiting] = b.runner.find({ states: ['waiting'] })
  assert.deepEqual(waiting.steps, [{ name: 'approval', repeat: 1, state: 'waiting', show: { amount: 5 } }])
  b.runner.refuse(run, 'approval', { why: 'too much' })
  const refused = { approved: false, data: { why: 'too much' }, shown: { amount: 5 } }
  assert.deepEqual(await b.runner.wait(run), { said: refused, after: 'refused' })
  assert.deepEqual(b.runner.read(run)?.steps[0].result, refused, 'the refusal is saved as the result of the step')
  // An answer for a step that waits no more is refused.
  assert.throws(() => b.runner.approve(run, 'approval'), { code: 'T0002' })
  // A wait-for that nobody answers gives up at its `timeout`.
  const late = b.start('asks')
  await b.until(late, 'waiting')
  b.clock.advance(2 * day)
  assert.deepEqual(await b.runner.wait(late), { said: { timedOut: true }, after: 'refused' })
})

test('[23-17] a flow that states `output` answers only what the type names, and an answer that does not fit fails the run', async (t) => {
  const output = { kind: 'object', shape: { name: { kind: 'text' }, total: { kind: 'number' } } }
  const b = bench(t, {
    fits: { record: { output }, run: async () => ({ name: 'Ada', total: 3, secret: 'no caller is handed this' }) },
    misfits: { record: { output }, run: async () => ({ name: 'Ada', total: 'three' }) },
    free: async () => ({ name: 'Ada', anything: true }),
    viaDone: { record: { output }, run: async ({ step }) => step.done({ name: 'Bob', total: 1, more: 'left out' }) },
  })
  assert.deepEqual(await b.runner.wait(b.start('fits')), { name: 'Ada', total: 3 })
  assert.deepEqual(await b.runner.wait(b.start('viaDone')), { name: 'Bob', total: 1 })
  assert.deepEqual(await b.runner.wait(b.start('free')), { name: 'Ada', anything: true })
  const misfit = b.start('misfits')
  assert.equal(await codeOf(b.runner.wait(misfit)), 'T0009')
  assert.equal(b.runner.read(misfit)?.state, 'failed')
  assert.match(String(b.runner.read(misfit)?.error?.message), /does not fit its output/)
})

test('[23-22] a step that states `onFail: goOn` and whose tries are used up answers `{ failed, code, message }` on the pass it failed in and on every later one', async (t) => {
  const answers: unknown[] = []
  let works = 0
  const b = bench(t, {
    goesOn: async ({ step }) => {
      const own = await step('own', () => fail('no-stock', 'There is none left.'), { onFail: 'goOn' })
      const broken = await step(
        'broken',
        () => {
          works += 1
          throw new Error('a line of the code is wrong')
        },
        { onFail: 'goOn', tries: 2 },
      )
      const fine = await step('fine', () => undefined, { onFail: 'goOn' })
      answers.push([own, broken, Object(fine).failed])
      await step.wait('1 day')
      return 'went on'
    },
  })
  const run = b.start('goesOn')
  await b.until(run, 'waiting')
  // The second step is tried twice, with its wait between, before it has failed for good.
  assert.equal(works, 1)
  b.clock.advance(5000)
  await b.untilStep(run, 'wait', 'waiting')
  assert.equal(works, 2)
  b.clock.advance(day)
  assert.equal(await b.runner.wait(run), 'went on')
  const failed = [
    { failed: true, code: 'no-stock', message: 'There is none left.' },
    // An error in the code of the app is what no caller is shown: its words stay in the row of the step.
    { failed: true, code: 'T0009', message: 'Something went wrong.' },
    undefined,
  ]
  assert.deepEqual(answers.at(-2), failed, 'on the pass that the step failed in')
  assert.deepEqual(answers.at(-1), failed, 'and on a later pass')
  assert.equal(works, 2, 'the work of a failed step is not carried out again')
  assert.equal(
    b.runner.read(run)?.steps.find((step) => step.name === 'broken')?.error?.message,
    'a line of the code is wrong',
  )
})

test("[23-22] a flow's own `onFail`, read and as code, is carried out once when a run fails for good and is handed the failure; the run is failed with its first error, and a stopped run carries none out", async (t) => {
  const handed: unknown[] = []
  const order: string[] = []
  const failing: FlowBody = async ({ input, step }) => {
    await step('fine', () => 'fine')
    await step('breaks', () => fail('not-paid', `The invoice of ${Object(input).name} is not paid.`))
  }
  // The stored body of: await step('tell', () => ...); await step.wait('1 day'); await step('tell again', ...)
  const body = [
    { do: { await: { fn: 'step', args: ['tell', { arrow: [], do: [{ return: { name: ['failure'] } }] }] } } },
    { do: { await: { fn: 'step.wait', args: ['1 day'] } } },
    {
      do: {
        await: { fn: 'step', args: ['tell again', { arrow: [], do: [{ return: { name: ['failure', 'code'] } }] }] },
      },
    },
  ]
  const b = bench(t, {
    asCode: {
      record: { onFail: { module: 'server/flows.js', export: 'asCode_onFail' } },
      run: failing,
      onFail: async ({ input, failure, step }) => {
        handed.push([input, failure])
        await step('tell', () => void order.push('onFail told'))
        // A failure inside `onFail` changes nothing of how the run ends.
        throw new Error('the onFail itself breaks')
      },
    },
    asRead: { record: { onFail: body }, run: failing, onFail: stored(body) },
    outside: {
      record: { onFail: { module: 'server/flows.js', export: 'outside_onFail' } },
      run: async () => {
        throw new TentError('T0002', 'The run fails outside a step.')
      },
      onFail: async ({ failure }) => void handed.push(failure),
    },
    waits: {
      record: { onFail: { module: 'server/flows.js', export: 'waits_onFail' } },
      run: async ({ step }) => step.wait('1 day'),
      onFail: async () => void order.push('the onFail of a stopped run'),
    },
  })
  const run = b.start('asCode', { name: 'Ada' })
  const waiter = b.runner.wait(run).catch((error: unknown) => {
    order.push('the caller that waits is answered')
    return error instanceof TentError ? error.code : 'another error'
  })
  assert.equal(await waiter, 'not-paid', 'the run is failed with its first error')
  assert.deepEqual(
    order,
    ['onFail told', 'the caller that waits is answered'],
    'a caller that waits is answered after `onFail`',
  )
  assert.deepEqual(handed, [
    [{ name: 'Ada' }, { step: 'breaks', code: 'not-paid', message: 'The invoice of Ada is not paid.' }],
  ])
  const view = b.runner.read(run)
  assert.equal(view?.state, 'failed')
  assert.equal(view?.error?.code, 'not-paid')
  // The steps of `onFail` are saved under their names with `onFail.` in front, beside the steps of the run.
  assert.deepEqual(
    view?.steps.map((step) => [step.name, step.state]),
    [
      ['fine', 'done'],
      ['breaks', 'failed'],
      ['onFail.tell', 'done'],
    ],
  )

  // An `onFail` that was read is carried out as the code is. While it waits, its run waits, and is not failed yet.
  const read = b.start('asRead', { name: 'Bob' })
  await b.until(read, 'waiting')
  assert.equal(b.runner.read(read)?.error?.code, 'not-paid', 'the run keeps its error from the moment it failed')
  assert.deepEqual(b.runner.read(read)?.steps.at(-2)?.result, {
    step: 'breaks',
    code: 'not-paid',
    message: 'The invoice of Bob is not paid.',
  })
  b.clock.advance(day)
  assert.equal(await codeOf(b.runner.wait(read)), 'not-paid')
  assert.equal(b.runner.read(read)?.steps.at(-1)?.result, 'not-paid')

  // A run that failed outside a step names no step, and a stopped run carries no `onFail` out.
  assert.equal(await codeOf(b.runner.wait(b.start('outside'))), 'T0002')
  assert.deepEqual(handed.at(-1), { code: 'T0002', message: 'The run fails outside a step.' })
  const stopped = b.start('waits')
  await b.until(stopped, 'waiting')
  b.runner.stop(stopped)
  await b.settle()
  assert.equal(order.includes('the onFail of a stopped run'), false)
})

test("[23-22] the program stopped in the middle of a flow's own `onFail` carries it on after the restart, once", async (t) => {
  const folder = workFolder(t)
  const clock = handClock()
  const told: string[] = []
  const flows = {
    fails: {
      record: { onFail: { module: 'server/flows.js', export: 'fails_onFail' } },
      run: (async ({ step }) => step('breaks', () => fail('broken', 'It broke.'))) satisfies FlowBody,
      onFail: (async ({ failure, step }) => {
        await step('first', () => void told.push(`first ${failure?.code}`))
        await step.wait('1 day')
        await step('second', () => void told.push(`second ${failure?.step}`))
      }) satisfies FlowBody,
    },
  }
  const first: Bench = bench(t, flows, { store: openStore(folder), clock })
  const run = first.start('fails')
  await first.until(run, 'waiting')
  assert.deepEqual(told, ['first broken'])
  // The program stops while `onFail` waits: the run is not failed yet, and keeps its error.
  await first.runner.close()
  first.store.close()
  clock.advance(day)

  const second = bench(t, flows, { store: openStore(folder), clock })
  assert.equal(await codeOf(second.runner.wait(run)), 'broken')
  assert.deepEqual(told, ['first broken', 'second breaks'], 'each step of `onFail` was carried out once')
  assert.equal(second.runner.read(run)?.state, 'failed')
})

test('[22-15@7b] `mail.send` inside a step of a flow is sent by the step, once, and not again on a later pass', async (t) => {
  const sent: unknown[] = []
  const runtime: Runtime = {
    call: () => undefined,
    handle: (name) => {
      assert.equal(name, 'mail')
      return { send: async (message: unknown) => void sent.push(message) }
    },
    start: () => undefined,
    emit: () => undefined,
    draw: () => undefined,
  }
  setRuntime(runtime)
  t.after(() => setRuntime(null))
  const b = bench(t, {
    welcome: async ({ input, step }) => {
      await step('send the mail', () => mail.send({ to: String(Object(input).to), subject: 'Welcome', text: 'Hello' }))
      await step.wait('1 day')
      return 'sent'
    },
  })
  const run = b.start('welcome', { to: 'ada@example.com' })
  await b.until(run, 'waiting')
  assert.deepEqual(sent, [{ to: 'ada@example.com', subject: 'Welcome', text: 'Hello' }])
  // The mail was sent by the work of the step, in the call context of that step.
  assert.deepEqual(b.inside.at(-1)?.step, { name: 'send the mail', repeat: 1 })
  b.clock.advance(day)
  assert.equal(await b.runner.wait(run), 'sent')
  assert.equal(sent.length, 1, 'the later pass answers the saved step, and sends nothing')
})
