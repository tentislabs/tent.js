import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { TentError } from '../../core/index.ts'
import type { At, Driver, FlowBody, Runner } from '../index.ts'
import type { Bench, Made } from './bench.ts'
import { bench, codeOf, handClock, openStore, version, workFolder } from './bench.ts'

const hour = 3_600_000

/**
 * The stand-in for the engine in one making of a step: it counts the calls of each name, asks the runner whether
 * a person agreed to the call at that place, refuses one that nobody agreed to with T7111 and its place, gives an
 * agreed call that was made already the answer it had, and tells the runner of an agreed call that ended well.
 */
function making(runner: Runner, at: At, made: string[]) {
  const counts = new Map<string, number>()
  return {
    /** A call that needs a yes. What is called inside `work` runs as agreed, and is counted nowhere. */
    async call(name: string, input: unknown, work: () => unknown = () => `${name} done`): Promise<unknown> {
      const nth = counts.get(name) ?? 0
      counts.set(name, nth + 1)
      const said = runner.yes(at, { name, nth })
      if (!said.agreed) throw new TentError('T7111', `Nobody agreed to ${name}.`, { place: { name, nth } })
      if (said.made) return said.answer
      const answer = await work()
      made.push(`${name} ${JSON.stringify(input)}`)
      runner.made(at, { name, nth }, answer)
      return answer
    },
    /** A change that was made before and is answered from what was kept of it: it counts the places that were counted inside it. */
    answeredFromOnce(places: Record<string, number>): void {
      for (const [name, count] of Object.entries(places)) counts.set(name, (counts.get(name) ?? 0) + count)
    },
  }
}

/** A bench whose flows are run by a driver: each as the script of its name, which is handed what a driver is. */
function driven(
  t: TestContext,
  scripts: Record<string, Driver>,
  o: {
    flows?: Record<string, Made | FlowBody>
    folder?: string
    clock?: ReturnType<typeof handClock>
    ask?: number
    start?: boolean
  } = {},
): Bench {
  const flows: Record<string, Made | FlowBody> = { ...o.flows }
  for (const name of Object.keys(scripts))
    flows[name] = { record: { agent: { script: name, limits: { ask: o.ask ?? 24 * hour } } } }
  return bench(t, flows, {
    ...(o.folder ? { store: openStore(o.folder) } : {}),
    ...(o.clock ? { clock: o.clock } : {}),
    ...(o.start === false ? { start: false } : {}),
    drivers: { agent: (run) => scripts[scriptOf(run.record)](run) },
  })
}

const scriptOf = (record: object): string => String(Object(Reflect.get(record, 'agent')).script)

/** The step of a run as `read` shows it. */
const stepOf = (b: Bench, run: string, name: string, repeat = 1) =>
  b.runner.read(run)?.steps.find((step) => step.name === name && step.repeat === repeat)

test('[23-28] a call that the engine refuses under a driven run makes its step wait for a yes, which lets that one call pass', async (t) => {
  const made: string[] = []
  let makings = 0
  let b: Bench
  const scripts: Record<string, Driver> = {
    helper: ({ step }) =>
      step('tool 1', async () => {
        makings += 1
        const calls = making(b.runner, b.inside.at(-1) ?? Object(), made)
        // The second making words the mail anew: a yes is for the place of the call, and not for what it is given.
        const mail = await calls.call('mail.send', { text: `making ${makings}` }, () => undefined)
        const refund = await calls.call('refund', { amount: 5 }, () => ({ refunded: 5 }))
        return { mail, refund }
      }),
  }
  b = driven(t, scripts)
  const run = b.start('helper', undefined, { startedBy: { kind: 'user', id: 'ada' } })
  await b.untilStep(run, 'tool 1', 'waiting')
  await b.until(run, 'waiting')
  assert.deepEqual(made, [], 'the call was refused before it did anything')
  assert.deepEqual(
    stepOf(b, run, 'tool 1')?.show,
    { call: 'mail.send' },
    'the step shows the name of the call, and never its input',
  )
  assert.equal(stepOf(b, run, 'tool 1')?.ask, 1)
  assert.deepEqual(
    b.told.findLast((one) => one.kind === 'step'),
    {
      kind: 'step',
      run,
      name: 'tool 1',
      repeat: 1,
      state: 'waiting',
      show: { call: 'mail.send' },
      ask: 1,
    },
  )

  // The yes makes the step again, and the call at that place passes, with the input of the second making.
  b.runner.approve(run, 'tool 1', undefined, { n: 1 })
  await b.untilStep(run, 'tool 1', 'waiting')
  await b.until(run, 'waiting')
  assert.deepEqual(made, ['mail.send {"text":"making 2"}'])
  // A second call that needs a yes makes the step wait again, as ask 2.
  assert.equal(stepOf(b, run, 'tool 1')?.ask, 2)
  assert.deepEqual(stepOf(b, run, 'tool 1')?.show, { call: 'refund' })
  assert.throws(
    () => b.runner.approve(run, 'tool 1', undefined, { n: 1 }),
    { code: 'T0002' },
    'ask 1 is answered, and ask 2 waits',
  )
  assert.throws(
    () => b.runner.approve(run, 'tool 1', undefined, { repeat: 2 }),
    { code: 'T0002' },
    'no second pass of the step waits',
  )

  b.runner.approve(run, 'tool 1', undefined, { repeat: 1, n: 2 })
  assert.deepEqual(await b.runner.wait(run), { refund: { refunded: 5 } })
  // After the second yes the first agreed call is not made again: it is given the answer it had, which was nothing.
  assert.deepEqual(made, ['mail.send {"text":"making 2"}', 'refund {"amount":5}'], 'one yes sends one mail')
  assert.equal(makings, 3)
  assert.equal(stepOf(b, run, 'tool 1')?.state, 'done')
})

test('[23-28] the place of a call is not moved by a call inside an agreed call, nor by a change that is answered from what was kept', async (t) => {
  const made: string[] = []
  let makings = 0
  let b: Bench
  b = driven(t, {
    helper: ({ step }) =>
      step('tool 1', async () => {
        makings += 1
        const calls = making(b.runner, b.inside.at(-1) ?? Object(), made)
        // The first making carries the change out, which makes one call of `notify` inside it that is counted. A
        // later making is answered from what was kept of the change, and counts the place that was counted in it.
        if (makings === 1) await calls.call('notify', 'inside the change').catch(() => undefined)
        else calls.answeredFromOnce({ notify: 1 })
        const first = await calls.call('charge', 1, async () => {
          // What an agreed call calls inside runs as agreed, and is counted nowhere.
          made.push('notify inside the agreed charge')
          return 'charged'
        })
        const second = await calls.call('notify', 'after the charge', () => 'told')
        return [first, second]
      }),
  })
  const run = b.start('helper')
  await b.until(run, 'waiting')
  // The refusal that the code of the step caught is asked about by nobody: the step waits for the charge.
  assert.deepEqual(stepOf(b, run, 'tool 1')?.show, { call: 'charge' })
  b.runner.approve(run, 'tool 1')
  await b.untilStep(run, 'tool 1', 'waiting')
  await b.until(run, 'waiting')
  assert.deepEqual(stepOf(b, run, 'tool 1')?.show, { call: 'notify' })
  b.runner.approve(run, 'tool 1')
  assert.deepEqual(await b.runner.wait(run), ['charged', 'told'])
  assert.deepEqual(made, ['notify inside the agreed charge', 'charge 1', 'notify "after the charge"'])
  // The yes was for the second call of `notify` in the step: the one that the change made is another place.
  assert.deepEqual(b.runner.yes({ ...Object(b.inside.at(-1)) }, { name: 'notify', nth: 0 }), { agreed: false })
  assert.deepEqual(b.runner.yes({ ...Object(b.inside.at(-1)) }, { name: 'notify', nth: 1 }), {
    agreed: true,
    made: true,
    answer: 'told',
  })
})

test('[23-28] an agreed call that fails is made again by the next try with no new ask, and a refusal and the end of the time fail the step with T7111', async (t) => {
  const made: string[] = []
  let fails = 1
  let b: Bench
  const caught: string[] = []
  b = driven(
    t,
    {
      helper: async ({ step }) => {
        try {
          return await step(
            'tool 1',
            async () => {
              const calls = making(b.runner, b.inside.at(-1) ?? Object(), made)
              return calls.call('charge', 1, () => {
                if (fails-- > 0) throw new Error('the bank did not answer')
                return 'charged'
              })
            },
            { tries: 2 },
          )
        } catch (error) {
          caught.push(error instanceof TentError ? error.code : 'another error')
          return 'went on without the call'
        }
      },
    },
    { ask: hour },
  )
  const tried = b.start('helper')
  await b.until(tried, 'waiting')
  b.runner.approve(tried, 'tool 1')
  await b.untilStep(tried, 'tool 1', 'waiting')
  await b.until(tried, 'waiting')
  // The agreed call failed: its place stays agreed, and the step waits for its next try by the clock, with no ask.
  assert.equal(stepOf(b, tried, 'tool 1')?.ask, undefined)
  assert.deepEqual(made, [])
  b.clock.advance(5000)
  assert.equal(await b.runner.wait(tried), 'charged')
  assert.deepEqual(made, ['charge 1'])

  const refused = b.start('helper')
  await b.until(refused, 'waiting')
  b.runner.refuse(refused, 'tool 1')
  assert.equal(await b.runner.wait(refused), 'went on without the call')
  assert.equal(stepOf(b, refused, 'tool 1')?.state, 'failed')
  assert.equal(stepOf(b, refused, 'tool 1')?.error?.code, 'T7111')

  const late = b.start('helper')
  await b.until(late, 'waiting')
  // Nobody answers within `limits.ask` of the agent at the top: the step gives up.
  b.clock.advance(hour)
  assert.equal(await b.runner.wait(late), 'went on without the call')
  assert.equal(stepOf(b, late, 'tool 1')?.error?.code, 'T7111')
  assert.deepEqual(caught, ['T7111', 'T7111'])
  assert.deepEqual(made, ['charge 1'], 'neither refused call was made')
})

test('[23-28] the program killed between the refusal and the yes, and between the yes and the making, loses neither', async (t) => {
  const folder = workFolder(t)
  const clock = handClock()
  const made: string[] = []
  const benches: Bench[] = []
  const scripts: Record<string, Driver> = {
    helper: ({ step }) =>
      step('tool 1', async () => {
        const b = benches.at(-1)
        if (!b) throw new Error('no bench')
        return making(b.runner, b.inside.at(-1) ?? Object(), made).call('mail.send', 'hello', () => 'sent')
      }),
  }
  const first = driven(t, scripts, { folder, clock })
  benches.push(first)
  const run = first.start('helper')
  await first.until(run, 'waiting')
  // The program is killed between the refusal and the yes.
  await first.runner.close()
  first.store.close()

  const second = driven(t, scripts, { folder, clock, start: false })
  benches.push(second)
  second.runner.start()
  await second.settle()
  assert.equal(stepOf(second, run, 'tool 1')?.ask, 1, 'after the restart the same ask waits')
  assert.deepEqual(stepOf(second, run, 'tool 1')?.show, { call: 'mail.send' })
  // The yes still fits. The program is killed right after it, before the step is made again.
  second.runner.approve(run, 'tool 1', undefined, { n: 1 })
  await second.runner.close()
  second.store.close()
  assert.deepEqual(made, [])

  const third = driven(t, scripts, { folder, clock, start: false })
  benches.push(third)
  third.runner.start()
  assert.equal(await third.runner.wait(run), 'sent', 'the restart takes the step up again, and the agreed call passes')
  assert.deepEqual(made, ['mail.send "hello"'])
})

test('[23-28] of two calls that are refused side by side the first waits, and a T7111 from a called run makes the step above wait for nobody', async (t) => {
  const made: string[] = []
  let b: Bench
  const leaves: unknown[] = []
  b = driven(
    t,
    {
      both: ({ step }) =>
        step('tool 1', async () => {
          const calls = making(b.runner, b.inside.at(-1) ?? Object(), made)
          return Promise.all([calls.call('first', 1), calls.call('second', 2)])
        }),
      above: ({ step }) =>
        step('tool 1', async () => {
          const at = b.inside.at(-1) ?? Object()
          const id = b.runner.add({
            flow: 'refusing',
            version,
            startedBy: { kind: 'system' },
            parent: at,
            call: 'refusing\n-\n0',
          })
          return b.runner.wait(id)
        }),
      starting: ({ step }) =>
        step('tool 1', async () => {
          const at = b.inside.at(-1) ?? Object()
          const calls = making(b.runner, at, made)
          // An agreed `start`: the engine hands the run it starts on as agreed.
          return calls.call('started', undefined, () =>
            b.runner.add({
              flow: 'started',
              version,
              startedBy: { kind: 'system' },
              from: at,
              call: 'started\n-\n0',
              leave: 'agreed',
            }),
          )
        }),
    },
    {
      flows: {
        refusing: async () => {
          throw new TentError('T7111', 'A person refused inside the called run.')
        },
        started: async ({ step }) => step('work', () => void leaves.push(b.inside.at(-1)?.leave)),
      },
    },
  )
  const both = b.start('both')
  await b.until(both, 'waiting')
  assert.deepEqual(stepOf(b, both, 'tool 1')?.show, { call: 'first' })
  assert.equal(stepOf(b, both, 'tool 1')?.ask, 1)

  const above = b.start('above')
  assert.equal(await codeOf(b.runner.wait(above)), 'T7111')
  assert.equal(stepOf(b, above, 'tool 1')?.state, 'failed', 'the step above fails, and is not tried again')
  assert.equal(stepOf(b, above, 'tool 1')?.ask, undefined, 'and waits for nobody')

  const starting = b.start('starting')
  await b.until(starting, 'waiting')
  b.runner.approve(starting, 'tool 1')
  const started = String(await b.runner.wait(starting))
  await b.runner.wait(started)
  assert.deepEqual(leaves, ['agreed'], 'a run that an agreed `start` starts is agreed')
  assert.equal(b.runner.read(started)?.parent, undefined, "and is nobody's child")
})

test('[23-28] in a run with no driven run at its top the step fails at once, and a step that failed for good answers the same error on a later pass', async (t) => {
  const made: string[] = []
  let works = 0
  const caught: string[] = []
  let b: Bench
  b = bench(t, {
    plain: async ({ step }) => {
      try {
        await step('send', async () => {
          works += 1
          return making(b.runner, b.inside.at(-1) ?? Object(), made).call('mail.send', 'hello')
        })
      } catch (error) {
        caught.push(error instanceof TentError ? `${error.code} ${error.message}` : 'another error')
      }
      await step.wait('1 day')
      return 'went on'
    },
  })
  const run = b.start('plain')
  await b.until(run, 'waiting')
  // Nobody can be asked: the step failed with T7111 at its first try, and waits for no yes.
  assert.equal(stepOf(b, run, 'send')?.state, 'failed')
  assert.equal(stepOf(b, run, 'send')?.ask, undefined)
  assert.equal(works, 1)
  b.clock.advance(86_400_000)
  assert.equal(await b.runner.wait(run), 'went on')
  assert.equal(works, 1, 'the work of the failed step is not carried out again')
  assert.deepEqual(caught, ['T7111 Nobody agreed to mail.send.', 'T7111 Nobody agreed to mail.send.'])
  assert.deepEqual(made, [])
})
