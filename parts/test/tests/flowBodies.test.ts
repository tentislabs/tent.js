import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { buildProject } from '../../build/index.ts'
import { TentError } from '../../core/index.ts'
import type { Clock } from '../../core/internal.ts'
import type { App, Engine } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { notDropped } from './started.ts'

const hour = 3_600_000
const system = { as: { kind: 'system' } } as const

/** What a test hands over to be closed when it ends, before its folder is removed. */
type Ends = { after(work: () => void | Promise<void>): void }

// The engines of each test, which are closed before the folder of the test is removed.
const engines = new WeakMap<object, Engine[]>()

/** Makes an empty folder for one test, which is removed when the test ends, after its engines were closed. */
function workFolder(t: Ends): string {
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const folder = mkdtempSync(join(all, 'flow-bodies-'))
  engines.set(t, [])
  t.after(async () => {
    for (const engine of engines.get(t) ?? []) await engine.close()
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  return folder
}

/** Makes an engine on a clock that the test moves, which is closed when the test ends. */
function engineOn(t: Ends, clock: Clock): Engine {
  const engine = createEngine({ port: 0, makers: { clock: () => clock } })
  engines.get(t)?.push(engine)
  return engine
}

/** Copies a project of the tests into a folder and builds it. */
async function built(work: string, project: string, o: { change?: (folder: string) => void } = {}) {
  const folder = join(work, `${project}-${Math.random().toString(36).slice(2, 8)}`)
  cpSync(join(import.meta.dirname, project), folder, { recursive: true })
  o.change?.(folder)
  return buildProject(folder, { for: 'release' })
}

/** A clock that stands still until the test moves it. */
function handClock(): { clock: Clock; advance(ms: number): void } {
  let now = Date.UTC(2031, 0, 1)
  let timers: { at: number; run: () => void }[] = []
  const clock: Clock = {
    now: () => now,
    setTimer(at, run) {
      const timer = { at, run }
      timers.push(timer)
      return () => {
        timers = timers.filter((one) => one !== timer)
      }
    },
  }
  return {
    clock,
    advance(ms) {
      const to = now + ms
      for (;;) {
        const due = timers.filter((one) => one.at <= to).sort((a, b) => a.at - b.at)[0]
        if (!due) break
        timers = timers.filter((one) => one !== due)
        now = Math.max(now, due.at)
        due.run()
      }
      now = to
    },
  }
}

/** Waits until a run stands in a state. */
async function untilState(app: App, run: string, state: string): Promise<void> {
  const ends = performance.now() + 20_000
  while (app.runs.read(run)?.state !== state) {
    assert.ok(performance.now() < ends, `the run stands at ${app.runs.read(run)?.state}, and not at ${state}`)
    await new Promise<void>((resolve) => setTimeout(resolve, 2))
  }
}

/** The code of what a promise is refused with. */
async function codeOf(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work
  } catch (error) {
    return error instanceof TentError ? error.code : `no code: ${error}`
  }
  return undefined
}

test('[12-7] a flow whose `run` was read is stored with `body` and `stepNames` and with no module, and killed after each step in turn and started again it ends with every step having run exactly once, as the same flow made code does', async (t) => {
  const work = workFolder(t)
  const made = await built(work, 'flowBodies')
  assert.deepEqual(made.findings, [])
  const { plainFive, codeFive } = made.description.flows
  assert.equal(plainFive.form, 'plain')
  assert.ok(Array.isArray(plainFive.body), 'the run that was read is stored')
  assert.deepEqual(plainFive.stepNames, [{ repeated: true, name: 'note' }])
  assert.equal(plainFive.module, undefined, 'and is built into no module')
  assert.equal(codeFive.form, 'code')
  assert.equal(typeof codeFive.module, 'string')
  assert.equal(codeFive.body, undefined)

  const program = join(import.meta.dirname, 'killed', 'flow.ts')
  const expected = {
    answer: 'Ada',
    // A step in a repeat gets its repeat number by itself.
    steps: [1, 2, 3, 4, 5].map((n) => `note ${n} done`),
    marks: [1, 2, 3, 4, 5].map((n) => `Ada ${n}`),
    noted: [1, 2, 3, 4, 5].map((n) => `Ada ${n}`),
  }
  for (const flow of ['plainFive', 'codeFive'])
    for (const step of [1, 2, 3, 4, 5]) {
      const dataFolder = join(work, `${flow}-${step}`, 'data')
      mkdirSync(dataFolder, { recursive: true })
      const args = [made.bundleFolder, dataFolder, flow, String(step)]
      const killed = await runKilled(program, { times: 1, when: `saved step ${step}`, args })
      const [second] = killed.ended
      assert.equal(second.code, 0, `${flow}, killed after step ${step}: ${second.out}`)
      const found = /^ended: (.*)$/m.exec(second.out)
      assert.ok(found, second.out)
      assert.deepEqual(JSON.parse(found[1]), expected, `${flow}, killed after step ${step}: each step ran exactly once`)
    }
})

test('[12-7] a wait, a second try and a move to another version treat a flow whose `run` was read as a code flow, and a pass that works past `limits.pass` between two steps is ended with T5104', async (t) => {
  const work = workFolder(t)
  const made = await built(work, 'flowBodies')
  // The same project with one sentence more: another version, in which every step of the flow still stands.
  const next = await built(work, 'flowBodies', {
    change: (folder) => {
      const file = join(folder, 'flows.ts')
      const written = readFileSync(file, 'utf8')
      writeFileSync(file, written.replace("moveRuns: 'whenSafe',", "moveRuns: 'whenSafe',\n  about: 'It waits.',"))
    },
  })
  assert.notEqual(next.versionId, made.versionId)
  assert.equal(made.description.flows.plainWaits.form, 'plain')
  const { clock, advance } = handClock()
  const engine = engineOn(t, clock)
  const app = await engine.open(made.bundleFolder, { dataFolder: join(work, 'data'), mode: 'test' })

  const run = notDropped(await app.start('plainWaits', undefined, system)).run
  await untilState(app, run, 'waiting')
  assert.deepEqual(
    app.runs.read(run)?.steps.map((step) => [step.name, step.state]),
    [
      ['before', 'done'],
      ['wait', 'waiting'],
    ],
  )
  // A switch moves the waiting run to the new version, since its saved steps still match there.
  await app.switch(await app.add(next.bundleFolder))
  assert.equal(app.runs.read(run)?.version, next.versionId)
  // The wait ends at its time, and the step that fails at its first try is tried again after its wait.
  advance(hour)
  const flaky = (): string | undefined => app.runs.read(run)?.steps.find((step) => step.name === 'flaky')?.state
  const ends = performance.now() + 20_000
  while (flaky() !== 'waiting') {
    assert.ok(performance.now() < ends, `the step stands at ${flaky()}`)
    await new Promise<void>((resolve) => setTimeout(resolve, 2))
  }
  advance(5000)
  assert.equal(await app.runs.wait(run), 'worked at try 2')
  assert.deepEqual(
    await app.call('allMarks', {}, system).then((rows) => Object(rows).length),
    1,
    'the first step ran once',
  )

  // A stored body is ended at its next statement or entry once it worked too long between two steps.
  const slow = notDropped(await app.start('plainSlow', undefined, system)).run
  assert.equal(await codeOf(app.runs.wait(slow)), 'T5104')
  assert.match(String(app.runs.read(slow)?.error?.message), /`limits\.pass`/)
  assert.deepEqual(
    app.runs.read(slow)?.steps.map((step) => [step.name, step.state]),
    [['first', 'done']],
  )
})

test("[12-7] [23-13] a plain flow file is read and never run: a plain flow builds and is carried out with no module, and a `run` of a flow that states plain: true and calls a function of the file's own is refused, naming the call", async (t) => {
  const work = workFolder(t)
  const made = await built(work, 'flowPlain')
  assert.deepEqual(made.findings, [])
  const { welcome } = made.description.flows
  assert.equal(welcome.form, 'plain')
  assert.ok(Array.isArray(welcome.body) && Array.isArray(welcome.onFail), 'the run and the onFail were both read')
  assert.deepEqual(welcome.stepNames, [{ name: 'mark' }, { name: 'wait' }, { name: 'mark again' }])
  assert.equal(made.description.server, undefined, 'a file all of whose definitions are plain gives no server module')
  // The flow is carried out from the description alone.
  const { clock, advance } = handClock()
  const engine = engineOn(t, clock)
  const app = await engine.open(made.bundleFolder, { dataFolder: join(work, 'data'), mode: 'test' })
  const run = notDropped(await app.start('welcome', { name: 'Ada' }, system)).run
  await untilState(app, run, 'waiting')
  advance(24 * hour)
  assert.equal(await app.runs.wait(run), 'Ada')
  assert.deepEqual(
    Object(
      await app.call('addMark', { what: 'last' }, system).then(() => app.read({ from: 'marks' }, { as: 'system' })),
    ).map((row: { what: string }) => row.what),
    ['welcome Ada', 'still welcome Ada', 'last'],
  )

  const refused = await built(work, 'flowOwn')
  const own = refused.findings.filter((one) => one.where?.file === 'flows.ts')
  assert.deepEqual(
    own.map((one) => [one.code, one.where?.line]),
    [['T1010', 10]],
    'the run that calls the function of its own',
  )
  assert.match(own[0].message, /a call of `shout`, a function of the file's own/)
})
