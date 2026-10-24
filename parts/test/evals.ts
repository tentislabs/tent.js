import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { counts } from '../engine/index.ts'
import type { Caller } from '../core/index.ts'
import type { TestCaller } from './as.ts'
import { callerOf } from './as.ts'
import type { Judged } from './judge.ts'
import { isJudged, judged } from './judge.ts'
import type { TestApp } from './testApp.ts'

/** What one run of a case gave, which an expectation is handed. */
export interface Got {
  text?: string
  value?: unknown
  called: string[]
  asked: string[]
  steps: object[]
  used: Record<string, number>
}

/** What a case expects, as a record: a text it holds, a value, the tools it called, did not call, or asked about. */
export interface Expected {
  text?: string | RegExp
  value?: unknown
  called?: string | string[]
  notCalled?: string | string[]
  asked?: string | string[]
}

/** One thing a case expects: a record, a function of what the run gave, or a judgement. */
export type Expectation = Expected | ((got: Got) => boolean | number | Promise<boolean | number>) | Judged

/** One case: what is said to an agent, or the input of a flow or a function, and what is expected. */
export interface Case {
  // A list is said in its order, each a turn on one conversation.
  say?: string | readonly string[]
  input?: unknown
  expect?: Expectation | Expectation[]
  name?: string
  approve?: true
}

/** How `evals` runs the cases. */
export interface EvalsOptions {
  runs?: number
  pass?: number
  as?: TestCaller
  budget?: Record<string, number>
  name?: string
}

/** What `evals` answers of one case. */
export interface CaseResult {
  name: string
  pass: boolean
  score: number
  runs: { pass: boolean; score: number; text?: string; why?: string }[]
}

/** What `evals` answers. */
export interface EvalsResult {
  name: string
  // The version of the app that the cases ran on.
  version?: string
  passed: number
  failed: number
  notRun: number
  score: number
  used: Record<string, number>
  each: CaseResult[]
}

const listOf = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** The sum of each unit that the engine counted so far, read as the system. */
async function totals(app: TestApp): Promise<Record<string, number>> {
  const rows: unknown = await app.read(counts, { as: 'system' })
  const sums: Record<string, number> = {}
  for (const row of Array.isArray(rows) ? rows : []) {
    const unit = String(Reflect.get(Object(row), 'unit'))
    const amount: unknown = Reflect.get(Object(row), 'amount')
    if (typeof amount === 'number') sums[unit] = (sums[unit] ?? 0) + amount
  }
  return sums
}

/** The budget of a call of `evals`: its own, or what the command that runs the tests has left of its own. */
function budgetOf(o: EvalsOptions): Record<string, number> | undefined {
  if (o.budget) return o.budget
  const stated = process.env.TENT_AI_BUDGET
  if (!stated || stated === 'none') return undefined
  const whole: Record<string, number> = JSON.parse(stated)
  const ledger = process.env.TENT_AI_LEDGER
  // What earlier evals of the command used is taken off: the budget is one bound for the whole command.
  if (ledger && existsSync(ledger))
    for (const line of readFileSync(ledger, 'utf8').split('\n').filter(Boolean))
      for (const [unit, amount] of Object.entries<number>(JSON.parse(line))) if (unit in whole) whole[unit] -= amount
  return whole
}

/** Whether what was used reached a budget, in any unit it names. */
const reached = (used: Record<string, number>, budget: Record<string, number> | undefined): boolean =>
  budget !== undefined && Object.entries(budget).some(([unit, most]) => (used[unit] ?? 0) >= most)

/**
 * A new conversation of the caller for an agent that keeps one: a row of the table its memory links to, owned
 * by the caller where the table has an owner, added as the system. Nothing for an agent that keeps none.
 */
async function threadFor(app: TestApp, target: string, as: Caller): Promise<string | undefined> {
  const memory: unknown = Reflect.get(Object(app.description.flows[target]?.agent), 'memory')
  const table: unknown = Reflect.get(Object(memory), 'in')
  const column: unknown = Reflect.get(Object(memory), 'thread') ?? 'thread'
  if (typeof table !== 'string' || typeof column !== 'string') return undefined
  const linked: unknown = Reflect.get(
    Object(Reflect.get(Object(app.description.tables[table]?.columns), column)),
    'table',
  )
  if (typeof linked !== 'string') return undefined
  const owner: unknown = app.description.tables[linked]?.owner
  const values = typeof owner === 'string' && as.user ? { [owner]: as.user.id } : {}
  const made: unknown = await app.write([{ add: linked, values }], { as: 'system' })
  return String(Reflect.get(Object(Array.isArray(made) ? made[0] : undefined), 'id'))
}

/**
 * Runs a case of an agent to its end: each of what it says as a run of its own, in order, on one conversation
 * where it says more than one thing and the agent keeps one. Answers what the last run gave, with every tool
 * that the runs called and asked about.
 */
async function agentRun(
  app: TestApp,
  target: string,
  one: Case,
  as: Caller,
): Promise<Omit<Got, 'used'> & { used: Record<string, number> }> {
  const says = typeof one.say === 'string' || one.say === undefined ? [one.say ?? ''] : one.say
  const thread = says.length > 1 ? await threadFor(app, target, as) : undefined
  const turns: Awaited<ReturnType<typeof turnRun>>[] = []
  for (const say of says) turns.push(await turnRun(app, target, one, as, say, thread))
  const last = turns[turns.length - 1]
  return {
    ...last,
    called: turns.flatMap((turn) => turn.called),
    asked: turns.flatMap((turn) => turn.asked),
    steps: turns.flatMap((turn) => turn.steps),
  }
}

/** The tool that a step of a run called, by the name of the step: `tool 1.2 <tool>`, or `tool 1.2.3 <tool>` in a sequence. */
const toolOf = (step: string): string | undefined => /^tool \d+(?:\.\d+)+ (.+)$/.exec(step)?.[1]

/**
 * Follows a run that was started to its end: each ask that waits for a person, in it and in the runs it called, is
 * refused and noted, or let go ahead where the case says `approve`. Answers what the run answered, or the error it
 * ended with, the tools its steps called and asked about, and its steps.
 */
async function ranToEnd(
  app: TestApp,
  run: string,
  one: Case,
): Promise<{ answer?: unknown; error?: unknown; called: string[]; asked: string[]; steps: object[] }> {
  const asked: string[] = []
  const answered = new Set<string>()
  for (;;) {
    const read = app.runs.read(run)
    if (!read) break
    if (read.state === 'done' || read.state === 'failed' || read.state === 'stopped') break
    for (const each of [read, ...(await app.runs.find({ top: run, of: 'all' })).filter((r) => r.id !== run)])
      for (const step of each.steps) {
        const key = `${each.id} ${step.name} ${step.repeat}`
        if (step.state !== 'waiting' || answered.has(key)) continue
        const show: unknown = step.show
        const tool: unknown = Reflect.get(Object(show), 'tool') ?? toolOf(step.name)
        if (typeof tool !== 'string') continue
        answered.add(key)
        asked.push(tool)
        const how = { repeat: step.repeat, ...(step.ask === undefined ? {} : { n: step.ask }) }
        if (one.approve) app.runs.approve(each.id, step.name, undefined, how)
        else app.runs.refuse(each.id, step.name, undefined, how)
      }
    await pause(10)
  }
  const steps = app.runs.read(run)?.steps ?? []
  const ended = await app.runs.wait(run).then(
    (answer: unknown) => ({ answer }),
    (error: unknown) => ({ error }),
  )
  const called = steps.flatMap((step) => toolOf(step.name) ?? [])
  return { ...ended, called, asked, steps }
}

/** Runs one run of an agent to its end, as `ranToEnd` follows it. Answers what the run gave. */
async function turnRun(
  app: TestApp,
  target: string,
  one: Case,
  as: Caller,
  say: string,
  thread: string | undefined,
): Promise<Omit<Got, 'used'> & { used: Record<string, number> }> {
  const started = await app.start(target, { message: say, ...(thread ? { thread } : {}) }, { as })
  // A start that the pace of the agent dropped gave nothing but that.
  if (!('run' in started)) return { value: started, called: [], asked: [], steps: [], used: {} }
  const { answer, error: _, ...ran } = await ranToEnd(app, started.run, one)
  const text: unknown = Reflect.get(Object(answer), 'text')
  // An agent that states `output` answers a value beside its text: that value is what a case expects.
  const value: unknown = Object.hasOwn(Object(answer), 'value') ? Reflect.get(Object(answer), 'value') : answer
  return { ...(typeof text === 'string' ? { text } : {}), value, ...ran, used: {} }
}

/** Runs a flow with the input of a case to its end, as `ranToEnd` follows it. Answers what the flow answered. */
async function flowRun(
  app: TestApp,
  target: string,
  one: Case,
  as: Caller,
): Promise<Omit<Got, 'used'> & { used: Record<string, number> }> {
  const started = await app.start(target, one.input ?? {}, { as })
  if (!('run' in started)) return { value: started, called: [], asked: [], steps: [], used: {} }
  const { answer, error, ...ran } = await ranToEnd(app, started.run, one)
  // A flow that failed gives its error as its value, as a function that throws does.
  const value = error ?? answer
  return { ...(typeof value === 'string' ? { text: value } : {}), value, ...ran, used: {} }
}

/** What a judge of our own reads of a run of a target beside its answer: what each of its tools answered, and its task. */
function judgedOf(app: TestApp, got: Got, target: string): Parameters<typeof judged>[4] {
  const tools = got.steps.flatMap((step) => {
    const name = Reflect.get(Object(step), 'name')
    const tool = toolOf(String(name))
    return tool ? [{ tool, answer: Reflect.get(Object(step), 'result') }] : []
  })
  const agent: unknown = app.description.flows[target]?.agent
  const about: unknown = app.description.flows[target]?.about
  const instructions: unknown = Reflect.get(Object(agent), 'instructions')
  return {
    tools,
    agent: {
      ...(typeof about === 'string' ? { about } : {}),
      ...(typeof instructions === 'string' ? { instructions } : {}),
    },
  }
}

/** The score of one expectation for what a run of a target gave, with the reason a judge gave. */
async function scoreOf(
  app: TestApp,
  expectation: Expectation,
  got: Got,
  o: { task: unknown; target: string },
): Promise<{ score: number; pass: boolean; why?: string }> {
  if (isJudged(expectation)) {
    const { score, why } = await judged(app, expectation, o.task, got.text ?? got.value, judgedOf(app, got, o.target))
    return { score, pass: score >= expectation.judge.pass, why }
  }
  if (typeof expectation === 'function') {
    const said = await expectation(got)
    const score = typeof said === 'number' ? said : said ? 1 : 0
    return { score, pass: typeof said === 'number' ? said >= 0.7 : said }
  }
  const checks: boolean[] = []
  const { text } = expectation
  if (text !== undefined)
    checks.push(typeof text === 'string' ? (got.text ?? '').includes(text) : text.test(got.text ?? ''))
  if ('value' in expectation) checks.push(JSON.stringify(got.value) === JSON.stringify(expectation.value))
  for (const tool of listOf(expectation.called)) checks.push(got.called.includes(tool))
  for (const tool of listOf(expectation.notCalled)) checks.push(!got.called.includes(tool))
  for (const tool of listOf(expectation.asked)) checks.push(got.asked.includes(tool))
  const pass = checks.every(Boolean)
  return { score: pass ? 1 : 0, pass }
}

/**
 * Takes a test app, an agent, a flow or a function, the cases, and how they run. Runs each case as often as
 * `runs` says, each run from the app's data as it was when `evals` was called, and holds what each run gave to
 * what the case expects. A case passes where the share of its runs that passed reaches `pass`. Stops at the first
 * unit of `budget` that is reached: the cases left are counted in `notRun`. Answers the result, with what the
 * model layer counted while the cases ran, the calls of a judge among it.
 */
export async function evals(app: TestApp, target: unknown, list: Case[], o: EvalsOptions = {}): Promise<EvalsResult> {
  const name = typeof target === 'string' ? target : String(Reflect.get(Object(target), 'definition'))
  const kind: unknown = typeof target === 'string' ? undefined : Reflect.get(Object(target), 'kind')
  const isAgent = kind === 'agent' || Reflect.get(Object(app.description.flows[name]), 'agent') !== undefined
  // A flow is started as a run of its own, and its answer is what the run answered.
  const isFlow = !isAgent && (kind === 'flow' || Object.hasOwn(app.description.flows, name))
  const as = await callerOf(app, o.as ?? 'system')
  const runs = o.runs ?? 1
  const needed = o.pass ?? 0.8
  const budget = budgetOf(o)
  const mark = await app.mark()
  const base = await totals(app)
  const used: Record<string, number> = {}
  const each: CaseResult[] = []
  let notRun = 0
  for (const one of list) {
    const said = typeof one.say === 'string' || one.say === undefined ? one.say : one.say.join(' / ')
    const caseName = one.name ?? said ?? JSON.stringify(one.input ?? {})
    if (reached(used, budget)) {
      notRun++
      continue
    }
    const made: CaseResult['runs'] = []
    for (let n = 0; n < runs && !reached(used, budget); n++) {
      await app.back(mark)
      const got: Got = isAgent
        ? await agentRun(app, name, one, as)
        : isFlow
          ? await flowRun(app, name, one, as)
          : await app.call(name, one.input ?? {}, { as }).then(
              (value) => ({
                value,
                ...(typeof value === 'string' ? { text: value } : {}),
                called: [],
                asked: [],
                steps: [],
                used: {},
              }),
              (error: unknown) => ({ value: error, called: [], asked: [], steps: [], used: {} }),
            )
      const expectations = one.expect === undefined ? [] : Array.isArray(one.expect) ? one.expect : [one.expect]
      const scored = []
      for (const expectation of expectations)
        scored.push(await scoreOf(app, expectation, got, { task: one.say ?? one.input, target: name }))
      // What the run and its judges used: the counts as they stand now, past those at the mark.
      const now = await totals(app)
      for (const [unit, amount] of Object.entries(now)) used[unit] = (used[unit] ?? 0) + amount - (base[unit] ?? 0)
      const why = scored.flatMap((one) => (one.why ? [one.why] : [])).join(' ')
      made.push({
        pass: scored.every((one) => one.pass),
        score: scored.length ? scored.reduce((sum, one) => sum + one.score, 0) / scored.length : 1,
        ...(got.text === undefined ? {} : { text: got.text }),
        ...(why ? { why } : {}),
      })
    }
    const passing = made.filter((run) => run.pass).length
    each.push({
      name: caseName,
      pass: made.length > 0 && passing / made.length >= needed,
      score: made.length ? made.reduce((sum, run) => sum + run.score, 0) / made.length : 0,
      runs: made,
    })
  }
  await app.back(mark)
  const version = app.versions().find((one) => one.running)?.id
  const result: EvalsResult = {
    name: o.name ?? name,
    ...(version === undefined ? {} : { version }),
    passed: each.filter((one) => one.pass).length,
    failed: each.filter((one) => !one.pass).length,
    notRun,
    score: each.length ? each.reduce((sum, one) => sum + one.score, 0) / each.length : 0,
    used,
    each,
  }
  // The command that runs the tests of AI behaviour keeps what each call used, and what it gave.
  if (process.env.TENT_AI_LEDGER) appendFileSync(process.env.TENT_AI_LEDGER, `${JSON.stringify(used)}\n`)
  if (process.env.TENT_AI_RESULTS) appendFileSync(process.env.TENT_AI_RESULTS, `${JSON.stringify(result)}\n`)
  return result
}
