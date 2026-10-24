import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import type { Caller, Db } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Clock, Description } from '../../core/internal.ts'
import type { Store, TableLayout } from '../../data/index.ts'
import { sqliteStore } from '../../data/index.ts'
import type { At, By, Driver, FlowBody, Runner, RunnerEnv, RunState, Told } from '../index.ts'
import { createRunner, replayTo, runsTable, scheduleTable, stepsTable } from '../index.ts'

/** The version that the flows of a bench are held under. */
export const version = 'v1'

/** A flow of a bench: its `run`, with its record as the description holds it and its own `onFail` where it has them. */
export interface Made {
  run?: FlowBody
  record?: Record<string, unknown>
  onFail?: FlowBody
}

/** A clock that a test moves by hand: the time stands still but for `advance`, which calls each timer that falls due. */
export interface HandClock extends Clock {
  advance(ms: number): void
  timers(): number[]
}

/** Makes a clock that a test moves by hand, at the first moment of 2026 in UTC. */
export function handClock(start = Date.UTC(2026, 0, 1)): HandClock {
  let now = start
  let timers: { at: number; run: () => void }[] = []
  return {
    now: () => now,
    setTimer(at, run) {
      const timer = { at, run }
      timers.push(timer)
      return () => {
        timers = timers.filter((one) => one !== timer)
      }
    },
    advance(ms) {
      const to = now + ms
      for (;;) {
        const [first] = timers.sort((a, b) => a.at - b.at)
        if (!first || first.at > to) break
        timers = timers.filter((one) => one !== first)
        now = Math.max(now, first.at)
        first.run()
      }
      now = to
    },
    timers: () => timers.map((one) => one.at).sort((a, b) => a - b),
  }
}

/** The description of an app that holds the given flows and nothing else. */
function describing(
  flows: Record<string, Record<string, unknown>>,
  project: Record<string, unknown> = {},
): Description {
  return {
    format: 'tent.description/1',
    app: { name: 'bench', needsEngine: '1' },
    project,
    tables: {},
    functions: {},
    flows,
    screens: {},
    components: {},
    services: {},
    models: {},
    routes: {},
    incoming: {},
    commands: {},
    messages: {},
    assets: {},
    sources: {},
    places: {},
  }
}

// What each test undoes when it ends, the last thing first: a store is closed before its folder is removed.
const undone = new WeakMap<TestContext, (() => void | Promise<void>)[]>()

/** Has a piece of work carried out when the test ends, before everything that was asked for earlier. */
export function atEnd(t: TestContext, work: () => void | Promise<void>): void {
  let works = undone.get(t)
  if (!works) {
    const made: (() => void | Promise<void>)[] = []
    works = made
    undone.set(t, made)
    t.after(async () => {
      for (const one of made.reverse()) await one()
    })
  }
  works.push(work)
}

/** Makes an empty folder for the data of one test, under the folder of results. It is removed when the test ends. */
export function workFolder(t: TestContext): string {
  const all = join(process.cwd(), 'results', 'flows')
  mkdirSync(all, { recursive: true })
  const folder = mkdtempSync(join(all, 'work-'))
  atEnd(t, () => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  return folder
}

/** Opens a store that holds the run tables, and the tables a test adds: in memory, or on a folder. */
export function openStore(folder = ':memory:', tables: TableLayout[] = []): Store {
  const store = sqliteStore()
  store.open(folder)
  // A test closes its store where it must, and the end of the test closes it once more.
  let closed = false
  const close = store.close.bind(store)
  store.close = () => {
    if (!closed) close()
    closed = true
  }
  const there = new Set(store.layout().map((one) => one.name))
  const missing = [runsTable, stepsTable, scheduleTable, ...tables].filter((one) => !there.has(one.name))
  if (missing.length)
    store.write(() =>
      store.applyTableChanges(missing.map((layout) => ({ do: 'addTable', table: layout.name, layout }))),
    )
  return store
}

/** What a test holds of a runner that runs over a test `env`. */
export interface Bench {
  runner: Runner
  env: RunnerEnv
  store: Store
  clock: HandClock
  // Everything the runner told, in order.
  told: Told[]
  // Each place that work was carried out in, in order: the body of a pass, with no step, and the work of each step.
  inside: At[]
  // Each step that the runner asked the engine to carry out on a thread.
  threads: At[]
  // Each starter that the runner asked the engine to build a caller for.
  asked: By[]
  // Starts a run of a flow and answers its id.
  start(flow: string, input?: unknown, more?: { startedBy?: By }): string
  // Waits until a run stands in one of the given states, and answers that state.
  until(run: string, ...states: RunState[]): Promise<RunState>
  // Waits until a step of a run stands in the given state.
  untilStep(run: string, name: string, state: string): Promise<void>
  // Lets everything that can go on without the clock go on.
  settle(): Promise<void>
}

const system: Caller = { kind: 'system' }

/** Lets the work that is queued in the runtime go on, a few rounds of it. */
export async function settle(rounds = 20): Promise<void> {
  for (let round = 0; round < rounds; round += 1) await new Promise<void>((resolve) => setImmediate(resolve))
}

/**
 * Makes a runner over a test `env`: a store of its own, a clock that the test moves, the given flows as its one
 * version, and stand-ins for what the engine does. The runner is started, and closed when the test ends.
 */
export function bench(
  t: TestContext,
  flows: Record<string, Made | FlowBody>,
  o: {
    store?: Store
    clock?: HandClock
    start?: boolean
    project?: Record<string, unknown>
    drivers?: Record<string, Driver>
    env?: Partial<RunnerEnv>
  } = {},
): Bench {
  const made: Record<string, Made> = Object.fromEntries(
    Object.entries(flows).map(([name, one]) => [name, typeof one === 'function' ? { run: one } : one]),
  )
  const description = describing(
    Object.fromEntries(
      Object.entries(made).map(([name, one]) => [name, { form: 'code', export: name, ...one.record }]),
    ),
    o.project,
  )
  const store = o.store ?? openStore()
  const clock = o.clock ?? handClock()
  const told: Told[] = []
  const inside: At[] = []
  const asked: By[] = []
  const threads: At[] = []
  const none: Db = Object.create(null)
  const env: RunnerEnv = {
    store,
    clock,
    description: (asked) => {
      if (asked !== version) throw new TentError('T0007', `The version ${asked} is gone.`)
      return description
    },
    body: (_version, flow, which) => (which === 'onFail' ? made[flow]?.onFail : made[flow]?.run),
    inside: (at, work) => {
      inside.push(at)
      return work()
    },
    db: () => none,
    caller: (by) => {
      asked.push(by)
      if (by.kind === 'user' && by.id === 'gone') throw new TentError('T3101', 'The starter of the run is gone.')
      return by.kind === 'user' ? { kind: 'user', user: { id: String(by.id), roles: [] } } : system
    },
    onThread: (at) => {
      threads.push(at)
      const run = bench.runner.read(at.run)
      const body = made[at.flow]?.run
      if (!run || !body || !at.step) throw new Error('nothing to carry out on a thread')
      return replayTo(body, {
        event: run.event,
        input: run.input,
        db: none,
        step: at.step,
        saved: (name, repeat) => {
          const step = run.steps.find((one) => one.name === name && one.repeat === repeat && one.state === 'done')
          return step ? { result: step.result } : undefined
        },
        // As the engine hands them on.
        ...(at.ended ? { ended: at.ended } : {}),
      })
    },
    told: (what) => void told.push(what),
    removed: () => undefined,
    ...o.env,
  }
  const runner = createRunner(env)
  for (const [kind, driver] of Object.entries(o.drivers ?? {})) runner.drive(kind, driver)
  runner.live(version)
  if (o.start !== false) runner.start()
  // A runner that the test closed itself, as before it closes the store, is closed no second time.
  let shut = false
  const close = runner.close.bind(runner)
  runner.close = (how) => {
    shut = true
    return close(how)
  }
  atEnd(t, async () => {
    if (!shut) await close()
    store.close()
  })
  const bench: Bench = {
    runner,
    env,
    store,
    clock,
    told,
    inside,
    threads,
    asked,
    start: (flow, input, more) =>
      runner.add({
        flow,
        version,
        startedBy: more?.startedBy ?? { kind: 'system' },
        ...(input === undefined ? {} : { input }),
      }),
    async until(run, ...states) {
      for (let round = 0; round < 2000; round += 1) {
        const state = runner.read(run)?.state
        if (state && states.includes(state)) return state
        await settle(1)
      }
      throw new Error(`the run ${run} stands at ${runner.read(run)?.state}, and not at ${states.join(' or ')}`)
    },
    async untilStep(run, name, state) {
      const found = (): string | undefined => runner.read(run)?.steps.find((step) => step.name === name)?.state
      for (let round = 0; round < 2000; round += 1) {
        if (found() === state) return
        await settle(1)
      }
      throw new Error(`the step ${name} of the run ${run} stands at ${found()}, and not at ${state}`)
    },
    settle: () => settle(),
  }
  return bench
}

/** Answers the code of what a promise is refused with, or nothing where it is not refused with an error that has one. */
export async function codeOf(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work
  } catch (error) {
    return error instanceof TentError ? error.code : undefined
  }
  return undefined
}
