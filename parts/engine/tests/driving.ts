import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import type { AiEnv, Provider, Used } from '../../ai/index.ts'
import { agentDriver } from '../../ai/index.ts'
import { guardedFetch } from '../../connect/index.ts'
import { project, TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { describe } from '../../core/internal.ts'
import { sqliteStore } from '../../data/index.ts'
import type { Runner } from '../../flows/index.ts'
import { createRunner, runsTable, scheduleTable, stepsTable } from '../../flows/index.ts'

/** A runner of a test with the driver of `ai` over an env of the test, and what starts and waits for a run. */
export interface Driving {
  env: AiEnv
  description: Description
  runner: Runner
  used: Used[]
  told: object[]
  /** Starts a run of an agent with an input, as the system, waits for it, and answers its answer and its steps. */
  ran(flow: string, input: object): Promise<{ run: string; answer: unknown; steps: string[] }>
}

/** What a test says of the env of the driver. */
export interface DrivingOptions {
  providers?: Record<string, Provider>
  // The answer of `call` of the env, by the name that is called: the tools and the memory of the engine.
  calls?: Record<string, (input: unknown) => unknown>
  allow?: (o: { model: string; run?: string }) => void
}

// How many runners this program made, which names the folder of each.
let made = 0

/**
 * Takes the definitions of a test and what its env is handed. Describes them with a project, and answers a
 * runner of `flows` over a store of its own, with the driver of `ai` for the kind `agent`, made from an env of
 * the test: no engine stands behind it. What the driver tells whoever watches a run is kept in `told`, and each try
 * of a model call in `used`.
 */
export function driving(t: TestContext, definitions: object[], o: DrivingOptions = {}): Driving {
  const described = describe({
    definitions: [{ value: project('drivenApp', {}) }, ...definitions.map((value) => ({ value }))],
  })
  const errors = described.findings.filter((one) => one.level === 'error')
  if (errors.length) throw new Error(`the definitions of the test do not describe: ${errors.map((one) => one.message)}`)
  const { description } = described
  const told: object[] = []
  const used: Used[] = []
  const env: AiEnv = {
    description: () => description,
    fetch: guardedFetch({ mode: 'development', bodyTravels: true }),
    secret: () => 'test-key',
    allow: (asked) => o.allow?.(asked),
    used: (one) => void used.push(one),
    call(name, args) {
      const call = o.calls?.[name]
      if (!call) throw new TentError('T0001', `The test answers no call ${name}.`)
      return call(args[0])
    },
    tell: (run, part) => void told.push({ run, ...part }),
    files: {
      text: () => Promise.reject(new TentError('T2104', 'No file.')),
      bytes: () => Promise.reject(new TentError('T2104', 'No file.')),
      put: () => Promise.reject(new TentError('T0013', 'No file is kept.')),
      info: () => {
        throw new TentError('T2104', 'No file.')
      },
    },
    providers: o.providers ?? {},
    sources: {},
    now: () => Date.now(),
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    kept: () => undefined,
    keep: () => undefined,
    may: () => undefined,
  }
  const store = sqliteStore()
  const folder = join(process.cwd(), 'results', 'engine', `runs-${process.pid}-${made++}`)
  mkdirSync(folder, { recursive: true })
  store.open(folder)
  store.write(() =>
    store.applyTableChanges(
      [runsTable, stepsTable, scheduleTable].map((layout) => ({ do: 'addTable' as const, table: layout.name, layout })),
    ),
  )
  const runner = createRunner({
    store,
    clock: {
      now: () => Date.now(),
      setTimer: (at, fn) => {
        const timer = setTimeout(fn, Math.max(0, at - Date.now()))
        return () => clearTimeout(timer)
      },
    },
    description: () => description,
    body: () => undefined,
    inside: (_at, work) => work(),
    db: () => Object({}),
    caller: () => ({ kind: 'system' }),
    onThread: () => Promise.reject(new Error('no thread')),
    told: () => undefined,
    removed: () => undefined,
  })
  runner.drive('agent', agentDriver(env), { tries: 1 })
  runner.live('v1')
  // The store is closed before its folder is removed: what is open of it holds the folder on Windows.
  t.after(async () => {
    await runner.close()
    store.close()
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  return {
    env,
    description,
    runner,
    used,
    told,
    async ran(flow, input) {
      const run = runner.add({ flow, version: 'v1', startedBy: { kind: 'system' }, input })
      runner.start()
      const answer = await runner.wait(run)
      const steps = runner.read(run)?.steps.map((one) => `${one.name}:${one.state}`) ?? []
      return { run, answer, steps }
    },
  }
}
