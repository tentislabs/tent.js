import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { TentError } from '../../core/index.ts'
import type { App, Engine } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { root } from './typed.ts'
import { notDropped } from './started.ts'

// The table of where each value word may stand, for the two places of a flow: inside a step of its body, and
// between two steps. The project that holds each word in both places is written by this file, built once, and
// opened once: each test then asks what its cell of the table says.

/** One word with the values of the test of the words: how it is written around its first value, that value, and what it answers. */
type Case = [name: string, written: (first: string) => string, first: unknown, answer: unknown]

const pure: Case[] = [
  ['concat', (a) => `concat(${a}, 1, null, 1.5)`, 'a', 'a11.5'],
  ['calc', (a) => `calc('+', ${a}, 3)`, 2, 5],
  ['round', (a) => `round(${a}, 2)`, 2.345, 2.35],
  ['floor', (a) => `floor(${a})`, -1.5, -2],
  ['ceil', (a) => `ceil(${a})`, 1.2, 2],
  ['least', (a) => `least(${a}, 1, 2)`, 3, 1],
  ['most', (a) => `most(${a}, '2026-03-01', '2025-12-31')`, '2026-01-02', '2026-03-01'],
  ['lower', (a) => `lower(${a})`, 'ABC def', 'abc def'],
  ['upper', (a) => `upper(${a})`, 'abc def', 'ABC DEF'],
  ['trim', (a) => `trim(${a})`, '  a b \n', 'a b'],
  ['startsWith', (a) => `startsWith(${a}, 'HE')`, 'Hello', true],
  ['contains', (a) => `contains(${a}, 'ELL')`, 'Hello', true],
  ['slice', (a) => `slice(${a}, -3)`, 'hello', 'llo'],
  ['join', (a) => `join(${a}, ', ')`, [1, 'a', null], '1, a, '],
  ['range', (a) => `range(${a}, 0, -2)`, 5, [5, 3, 1]],
  [
    'where',
    (a) => `where(${a}, { a: { above: 1 }, b: { startsWith: 'y' } })`,
    [
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
      { a: 3, b: 'Y' },
    ],
    [
      { a: 2, b: 'y' },
      { a: 3, b: 'Y' },
    ],
  ],
  ['sum', (a) => `sum(${a})`, [1, 2, null, 3], 6],
  ['avg', (a) => `avg(${a})`, [2, 4, null], 3],
  ['min', (a) => `min(${a})`, [3, 1, 2], 1],
  ['max', (a) => `max(${a})`, ['2026-01-02', '2026-03-01', '2025-12-31'], '2026-03-01'],
  ['later', (a) => `later(${a}, '1 month')`, '2026-01-31', '2026-02-28'],
  ['earlier', (a) => `earlier(${a}, '1 day')`, '2026-03-01', '2026-02-28'],
  ['between', (a) => `between(${a}, '2026-02-28', 'months')`, '2026-01-31', 1],
  ['dayOf', (a) => `dayOf(${a}, 'America/New_York')`, '2026-10-08T01:30:00.000Z', '2026-10-07'],
]

const kept: Case[] = [
  [
    'fingerprint',
    (a) => `fingerprint(${a})`,
    'abc',
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  ],
  ['sameSecret', (a) => `sameSecret(${a}, 'secret')`, 'secret', true],
  [
    'chunks',
    (a) => `chunks(${a}, { size: 4, overlap: 0 })`,
    'One.\n\nTwo.',
    [
      { text: 'One.', at: 0 },
      { text: 'Two.', at: 6 },
    ],
  ],
]

const eachCase: Case = ['each', (a) => `each(${a}, (n, i) => n * i)`, [1, 2, 3], [0, 2, 6]]
const settingCase: Case = ['setting', () => 'settings.rate', null, 7]
const everywhere = [...pure, ...kept, eachCase, settingCase]

const cap = (name: string): string => name[0].toUpperCase() + name.slice(1)

/** The flow that holds one word in both places: between two steps, and inside a step. */
const flowed = ([name, call]: Case): string => `
export const flow${cap(name)} = flow('flow${cap(name)}', {
  input: { first: json({ optional: true }) },
  run: async ({ input, step }) => {
    const outside = ${call('input.first')}
    const inside = await step('work', () => ${call('input.first')})
    return { outside, inside }
  },
})
`

const names = [...pure, ...kept].map(([name]) => name)
const flows = `import { ${names.join(', ')}, each, flow, json, now, random, settings, token } from 'tentjs'
${everywhere.map(flowed).join('')}
// The three words that are drawn, inside a step: each draws there, and its step saves what it drew.
export const insideDrawn = flow('insideDrawn', {
  run: async ({ step }) => {
    const moment = await step('now', () => concat(now()))
    const number = await step('random', () => random())
    const secret = await step('token', () => token())
    const digits = await step('digits', () => token({ digits: 6 }))
    await step.wait('1 day')
    return { moment, number, secret, digits }
  },
})

// And between two steps, where a later pass would draw another value.
export const betweenNow = flow('betweenNow', {
  run: async ({ step }) => {
    const moment = concat(now())
    return step('after', () => moment)
  },
})

export const betweenRandom = flow('betweenRandom', {
  run: async ({ step }) => {
    const number = random()
    return step('after', () => number)
  },
})

export const betweenToken = flow('betweenToken', {
  run: async ({ step }) => {
    const secret = token()
    return step('after', () => secret)
  },
})

// The time and a random number between two steps are those of the step tools, which are saved.
export const betweenSaved = flow('betweenSaved', {
  run: async ({ step }) => {
    const moment = step.now()
    const number = step.random()
    await step.wait('1 day')
    return { moment: concat(moment), number }
  },
})
`

const tent = `import { number, project } from 'tentjs'

export const places = project('places', { title: 'Places', settings: { rate: { type: number({ default: 7 }) } } })
`

const day = 86_400_000

/** The app of the project, opened on a clock that the tests move. */
interface World {
  app: App
  engine: Engine
  forms: Record<string, string>
  advance(ms: number): void
  now(): number
}

let made: Promise<World> | undefined

async function make(): Promise<World> {
  const folder = join(root, 'results', 'cli', 'flowWords', 'places')
  rmSync(join(folder, '..'), { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  for (const [path, text] of [
    ['tent.ts', tent],
    ['flows/places.ts', flows],
  ]) {
    mkdirSync(join(folder, path, '..'), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  const built = await buildProject(folder, { for: 'dev' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  let moment = Date.UTC(2031, 0, 2, 3, 4, 5)
  let timers: { at: number; run: () => void }[] = []
  const engine = createEngine({
    port: 0,
    makers: {
      clock: () => ({
        now: () => moment,
        setTimer(at, run) {
          const timer = { at, run }
          timers.push(timer)
          return () => {
            timers = timers.filter((one) => one !== timer)
          }
        },
      }),
    },
  })
  const advance = (ms: number): void => {
    const to = moment + ms
    for (;;) {
      const due = timers.filter((one) => one.at <= to).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      timers = timers.filter((one) => one !== due)
      moment = Math.max(moment, due.at)
      due.run()
    }
    moment = to
  }
  try {
    const app = await engine.open(built.bundleFolder, { dataFolder: join(folder, '..', 'data'), mode: 'development' })
    const forms = Object.fromEntries(
      Object.entries(built.description.flows).map(([name, one]) => [name, String(one.form)]),
    )
    return { app, engine, forms, advance, now: () => moment }
  } catch (error) {
    await engine.close()
    throw error
  }
}

const world = (): Promise<World> => {
  made ??= make()
  return made
}

after(async () => {
  const held = await made?.catch(() => undefined)
  await held?.engine.close()
  rmSync(join(root, 'results', 'cli', 'flowWords'), { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

/** Starts a run of a flow as the system and answers the id of the run. */
async function started(flow: string, first?: unknown): Promise<string> {
  const { app } = await world()
  return notDropped(await app.start(flow, first === undefined ? {} : { first }, { as: 'system' })).run
}

/** Answers the code of what a promise is refused with, or nothing where it is kept. */
async function codeOf(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work
  } catch (error) {
    return error instanceof TentError ? error.code : `no code: ${error}`
  }
  return undefined
}

/** Two tests for a row of words that says yes in both places of a flow: each word answers the value of its inputs there. */
function bothPlaces(row: string, cases: Case[]): void {
  for (const place of ['inside a step of the body of a flow', 'between two steps of a flow'] as const)
    test(`[12-6@7b] ${row}, ${place}: each answers its value`, async () => {
      const { app, forms } = await world()
      for (const [name, , first, answer] of cases) {
        assert.equal(forms[`flow${cap(name)}`], 'plain', `the run that holds ${name} was read`)
        const run = await started(`flow${cap(name)}`, first === null ? undefined : first)
        const answered = Object(await app.runs.wait(run))
        assert.deepEqual(answered[place.startsWith('inside') ? 'inside' : 'outside'], answer, name)
        // Inside a step the value is the result of the step, as it was saved.
        if (place.startsWith('inside')) assert.deepEqual(app.runs.read(run)?.steps[0].result, answer, name)
      }
    })
}

bothPlaces('the words that work on what they are handed', pure)
bothPlaces('each', [eachCase])
bothPlaces('fingerprint, sameSecret and chunks', kept)
bothPlaces('a setting', [settingCase])

test('[12-6@7b] now(), random() and token(), inside a step of the body of a flow: each draws there, and a later pass reads what the step saved', async () => {
  const { app, forms, advance, now } = await world()
  assert.equal(forms.insideDrawn, 'plain')
  const at = now()
  const run = await started('insideDrawn')
  const waiting = async (): Promise<boolean> => app.runs.read(run)?.state === 'waiting'
  for (let round = 0; !(await waiting()); round += 1) {
    assert.ok(round < 5000, 'the run came to its wait')
    await new Promise<void>((resolve) => setTimeout(resolve, 2))
  }
  const saved = Object.fromEntries((app.runs.read(run)?.steps ?? []).map((step) => [step.name, step.result]))
  // Inside a step `now()` is the present moment, by the clock of the app.
  assert.equal(saved.now, new Date(at).toISOString())
  assert.ok(typeof saved.random === 'number' && saved.random >= 0 && saved.random < 1)
  assert.match(String(saved.token), /^[A-Za-z0-9_-]{43}$/)
  assert.match(String(saved.digits), /^\d{6}$/)
  // A day later the run is carried out from its top: each step answers what it saved, and draws nothing anew.
  advance(day)
  assert.deepEqual(await app.runs.wait(run), {
    moment: saved.now,
    number: saved.random,
    secret: saved.token,
    digits: saved.digits,
  })
})

test('[12-6@7b] now(), random() and token(), between two steps of a flow: each is T5001, and `step.now()` and `step.random()` are the saved ones', async () => {
  const { app, advance, now } = await world()
  for (const flow of ['betweenNow', 'betweenRandom', 'betweenToken']) {
    const run = await started(flow)
    assert.equal(await codeOf(app.runs.wait(run)), 'T5001', flow)
    assert.deepEqual(app.runs.read(run)?.steps, [], `${flow}: the pass ended before its step`)
  }
  const at = now()
  const run = await started('betweenSaved')
  for (let round = 0; app.runs.read(run)?.state !== 'waiting'; round += 1) {
    assert.ok(round < 5000, 'the run came to its wait')
    await new Promise<void>((resolve) => setTimeout(resolve, 2))
  }
  const number = app.runs.read(run)?.steps.find((step) => step.name === 'random')?.result
  advance(day)
  // The pass after the wait reads the moment and the number of the first pass, though a day has passed.
  assert.deepEqual(await app.runs.wait(run), { moment: new Date(at).toISOString(), number })
  assert.ok(typeof number === 'number' && number >= 0 && number < 1)
})
