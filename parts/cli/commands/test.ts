import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeProject } from '../../build/index.ts'
import { boolean, choice, list, number, TentError, text } from '../../core/index.ts'
import type { Finding } from '../../core/index.ts'
import { finding } from '../../core/internal.ts'
import { findPage } from '../../docs/index.ts'
import type { Command } from '../command.ts'
import { keepLooks } from '../looksKept.ts'
import { budgetOf, compared, kept as keptEvaluation, resultsIn } from '../evals.ts'
import { evalsFromRuns } from '../fromRuns.ts'
import { roomOfRun } from '../testRoom.ts'
import { joined, keepReport, shareOf } from '../testShards.ts'
import type { Kept } from '../testsKept.ts'
import { groundOf, keepRan, keptTests, replaysOf } from '../testsKept.ts'
import { joinedRan, testFiles, testsRan } from '../testsRan.ts'
import { watchTests } from '../testWatch.ts'
import { withText } from '../print.ts'

/** How the command is typed: the line under Usage of its page, which is the one place that holds it. */
const usage = (): string => /## Usage\n+```\n(.+)\n```/.exec(findPage('command.test')?.text ?? '')?.[1] ?? 'tent test'

/** A finding for words that the command does not take as they were typed, with how it is typed. */
const misused = (words: string, code = 'T0038'): Finding =>
  finding(code, `${words} It is typed: ${usage()}`, { fix: 'See `tent docs command.test`.' })

/**
 * Takes the folder of the project, its test files, the word that names what to run, and whether the tests of AI
 * behaviour run. Answers the one file that the word names, or the name of the tests it runs in every file, or
 * nothing where no word was given; and a finding for a file that is none of the test files.
 */
function onlyOf(
  folder: string,
  files: string[],
  word: unknown,
  ai: boolean,
): { file?: string; name?: string } | { findings: Finding[] } {
  if (typeof word !== 'string') return {}
  const file = relative(folder, resolve(folder, word)).split(sep).join('/')
  if (files.includes(file)) return { file }
  if (!existsSync(resolve(folder, word))) return { name: word }
  const kind = ai ? 'a file that ends in `.ai.ts`' : 'a file that does not end in `.ai.ts`'
  return { findings: [misused(`${file} is no test file of the project: one lies under tests/, ${kind}.`)] }
}

/** Runs until the program is told to end, by a signal: what `--watch` runs for. */
function untilEnded(): { stopped: Promise<void>; done(): void } {
  const signals = ['SIGINT', 'SIGTERM'] as const
  let told = (): void => undefined
  const stopped = new Promise<void>((done) => {
    told = done
  })
  for (const signal of signals) process.once(signal, told)
  return {
    stopped,
    done: () => {
      for (const signal of signals) process.removeListener(signal, told)
    },
  }
}

/**
 * Runs the tests of the app: every file under `tests/` of the project, by the test runner of the runtime, each as
 * a program of its own in the folder of the project, where `testApp()` gives it a fresh temporary copy of the
 * app. A test whose result stands on nothing that changed since it passed is replayed, and not run: `--all` runs
 * every test. Answers how many tests passed, failed and were replayed, the tests not run, and the files, and keeps
 * that report in `results/tests/report.json`; what each test touched is kept in `.tent/tests.json`. A word after the
 * name runs one test file, or the tests of that name. A test that failed is an error, named with its whole failure:
 * what it threw and where, and what that test wrote out. `--shard <n>/<of>` runs a share of the files, split by their
 * names, and `--join <folders>` answers the one report of the shares that those folders kept. `--plan <screen>`
 * writes a first test of a screen, `--watch` runs the tests again on each save, and `--looks update` keeps the new
 * pictures and the new things heard that the tests wrote.
 */
export const command: Command = {
  name: 'test',
  args: {
    // The first, so that a word after the name of the command is the file or the name to run.
    only: text({ optional: true }),
    ai: boolean({ optional: true }),
    all: boolean({ optional: true }),
    budget: list(text(), { optional: true }),
    compare: boolean({ optional: true }),
    'from-runs': text({ optional: true }),
    below: number({ optional: true }),
    data: text({ optional: true }),
    plan: text({ optional: true }),
    watch: boolean({ optional: true }),
    declared: boolean({ optional: true }),
    update: boolean({ optional: true }),
    shard: text({ optional: true }),
    join: list(text(), { optional: true }),
    looks: choice(['update'], { optional: true }),
    room: choice(['program', 'apart'], { optional: true }),
  },
  needs: 'project',
  run: async ({ folder, args }) => {
    // A file or a name to run goes with nothing that runs no test, or every test: a second word falls there too.
    const beside = ['from-runs', 'plan', 'join', 'looks', 'watch', 'shard', 'declared'].find(
      (name) => args[name] !== undefined,
    )
    if (typeof args.only === 'string' && beside !== undefined)
      return { findings: [misused(`tent test runs one file or the tests of one name, and no --${beside} beside it.`)] }
    // The kept runs that people rated are written as a file of evals, and no test is run.
    if (typeof args['from-runs'] === 'string')
      return {
        value: await evalsFromRuns(folder, {
          agent: args['from-runs'],
          ...(typeof args.below === 'number' ? { below: args.below } : {}),
          ...(typeof args.data === 'string' ? { data: args.data } : {}),
        }),
      }
    try {
      if (args.looks === 'update') return { value: { kept: keepLooks(folder) } }
      if (Array.isArray(args.join)) {
        const report = joined(args.join.map((one) => resolve(folder, String(one))))
        return { value: report.value, findings: report.findings }
      }
      if (typeof args.plan === 'string') {
        const { description } = await describeProject(folder)
        // The plan reads the samples of the test helpers, which a run of the tests loads in programs of their own.
        const { plannedTest } = await import('../testPlan.ts')
        return { value: { file: plannedTest(folder, description, args.plan) } }
      }
    } catch (error) {
      if (!(error instanceof TentError)) throw error
      return { findings: [finding(error.code, error.message, error.fix === undefined ? {} : { fix: error.fix })] }
    }
    // The room the tests of the app run their code in, for every test the command starts.
    const stood = roomOfRun(args.room)
    try {
      return await testsOf(folder, args)
    } finally {
      stood()
    }
  },
}

/** Runs the tests of the app as the words of the command ask: watched, or once, with the tests of AI behaviour or without. */
async function testsOf(
  folder: string,
  args: Record<string, unknown>,
): Promise<{ value?: unknown; findings?: Finding[] }> {
  if (args.declared === true) return declaredOf(folder, args.update === true)
  if (args.update === true)
    return { findings: [misused('`--update` keeps what `--declared` made, and goes with it alone.')] }
  if (args.watch === true) {
    const ended = untilEnded()
    try {
      await watchTests(folder, { out: (line) => console.log(line), stopped: ended.stopped })
    } finally {
      ended.done()
    }
    return { value: { watched: true } }
  }
  const ai = args.ai === true
  const every = testFiles(folder, ai)
  let files = every
  const only = onlyOf(folder, files, args.only, ai)
  if ('findings' in only) return only
  if (only.file !== undefined) files = [only.file]
  if (typeof args.shard === 'string')
    try {
      files = shareOf(files, args.shard)
    } catch (error) {
      if (!(error instanceof TentError)) throw error
      return { findings: [finding(error.code, error.message, error.fix === undefined ? {} : { fix: error.fix })] }
    }
  if (!ai) return recorded(folder, files, every, { all: args.all === true, ...only })
  // The tests of AI behaviour run one after another, with the keys of the project's test data, under one budget
  // for the whole command, and each `evals` writes what it used and what it gave where the command reads it.
  const kept = mkdtempSync(join(tmpdir(), 'tent-ai-'))
  const results = join(kept, 'results.jsonl')
  const budget = budgetOf(Array.isArray(args.budget) ? args.budget.map(String) : undefined)
  process.env.TENT_AI_BUDGET = budget === 'none' ? 'none' : JSON.stringify(budget)
  process.env.TENT_AI_LEDGER = join(kept, 'used.jsonl')
  process.env.TENT_AI_RESULTS = results
  process.env.TENT_AI_DATA = join(folder, '.tent')
  const ran = await testsRan(folder, files, { ai, ...(only.name === undefined ? {} : { only: [only.name] }) })
  const { passed, findings, notRun } = ran
  if (only.name !== undefined && passed + findings.length + notRun.length === 0)
    return {
      findings: [misused(`No test file and no test of the project is named "${only.name.slice(0, 120)}".`, 'T0001')],
    }
  for (const name of ['TENT_AI_BUDGET', 'TENT_AI_LEDGER', 'TENT_AI_RESULTS', 'TENT_AI_DATA']) delete process.env[name]
  // The evaluation is kept in `evals/`, and set against the one before where `--compare` asks for it.
  const gave = resultsIn(results)
  const version = String(gave.find((one) => one.version !== undefined)?.version ?? 'unbuilt')
  const evaluation = { version, at: new Date().toISOString(), results: gave }
  const file = keptEvaluation(folder, evaluation)
  rmSync(kept, { recursive: true, force: true })
  if (args.compare === true) findings.push(...compared(folder, file, evaluation))
  return { value: { passed, failed: findings.length, replayed: 0, files, evaluation: file }, findings }
}

/**
 * `tent test --declared`: runs the cases made from the declarations of the app, in a program of their own in the
 * folder of the project, as a test file of it runs: what each caller gets of each definition, held to
 * `tests/declared/access.json`, which `update` keeps anew, the edges of each input, and each form. Nothing of it is
 * kept in the record of the tests, and nothing is replayed. Answers what a run of the tests answers.
 */
async function declaredOf(folder: string, update: boolean): Promise<{ value?: unknown; findings?: Finding[] }> {
  const program = fileURLToPath(new URL('../declaredTests.ts', import.meta.url))
  const label = 'tests/declared'
  process.env.TENT_DECLARED = update ? 'update' : 'run'
  try {
    const ran = await testsRan(folder, [program], { as: label })
    const { passed, findings, notRun } = ran
    const value = {
      passed,
      failed: findings.length,
      replayed: 0,
      ...(notRun.length ? { notRun } : {}),
      files: [label],
      failures: ran.failures,
    }
    const lines = [
      ...ran.ended.map((one) => `${one.passed ? 'passed' : 'failed'} ${one.test}`),
      `${passed} passed, ${findings.length} failed`,
    ]
    return { value: withText(value, lines.join('\n')), findings }
  } finally {
    delete process.env.TENT_DECLARED
  }
}

/**
 * Runs the tests of the app that are not of AI behaviour, and replays each whose result stands on nothing that
 * changed since it passed, unless `all` asks for every one: a file all of whose tests are replayed is not started,
 * and one with some is started alone with those left out. Keeps what each test touched, and the report of the run.
 * Answers the run, with each test that ended and each that was replayed in its text.
 */
async function recorded(
  folder: string,
  files: string[],
  every: string[],
  o: { all: boolean; file?: string; name?: string },
): Promise<{ value?: unknown; findings?: Finding[] }> {
  const kept: Kept = keptTests(folder)
  const ground = await groundOf(folder, files)
  const replays = new Map<string, string[]>()
  // Of a run of the tests of one name, the tests of that name alone are replayed.
  if (!o.all)
    for (const [file, names] of replaysOf(folder, kept, ground, files)) {
      const asked = names.filter((name) => o.name === undefined || name === o.name)
      if (asked.length) replays.set(file, asked)
    }
  const only = o.name === undefined ? {} : { only: [o.name] }
  // A file whose every kept test is replayed is not started: a new test in it changed its file, and so its keys.
  const whole = files.filter((file) => !replays.has(file))
  const some = files.filter(
    (file) => replays.has(file) && (replays.get(file) ?? []).length < Object.keys(kept.tests[file] ?? {}).length,
  )
  let ran = await testsRan(folder, whole, only)
  for (const file of some)
    ran = joinedRan(ran, await testsRan(folder, [file], { ...only, but: replays.get(file) ?? [] }))
  const { passed, findings, notRun } = ran
  const replayed = [...replays].flatMap(([file, names]) =>
    names.flatMap((name) => (kept.tests[file]?.[name] ?? []).map(() => `${file}: ${name}`)),
  )
  if (o.name !== undefined && passed + findings.length + notRun.length + replayed.length === 0)
    return {
      findings: [misused(`No test file and no test of the project is named "${o.name.slice(0, 120)}".`, 'T0001')],
    }
  keepRan(folder, {
    kept,
    ground,
    ran,
    replays,
    whole: o.name === undefined ? files : [],
    files: every,
    all: o.all,
  })
  const value = {
    passed,
    failed: findings.length,
    replayed: replayed.length,
    ...(notRun.length ? { notRun } : {}),
    files,
    failures: ran.failures,
  }
  keepReport(folder, { value, findings })
  // Each test as it stands: run and passed or failed, or replayed, and how many of each.
  const lines = [
    ...ran.ended.map((one) => `${one.passed ? 'passed' : 'failed'} ${one.test}`),
    ...replayed.map((test) => `replayed ${test}`),
    ...notRun.map((one) => `not run ${one.test}: ${one.why}`),
    // A test that reached outside the program, which no replay and no held clock or random seed of its app reaches.
    ...ran.ended.flatMap((one) => {
      const outside = ran.noted.get(JSON.stringify([one.file, one.name, one.nth]))?.outside ?? []
      return outside.length ? [`reached outside ${one.test}: ${outside.join(', ')}`] : []
    }),
    // A test whose app's clock was held, and that reached what runs on a time of its own.
    ...ran.ended.flatMap((one) => {
      const unheld = ran.noted.get(JSON.stringify([one.file, one.name, one.nth]))?.unheld ?? []
      return unheld.length ? [`reached outside the held clock ${one.test}: ${unheld.join(', ')}`] : []
    }),
    `${passed} passed, ${findings.length} failed, ${replayed.length} replayed`,
  ]
  return { value: withText(value, lines.join('\n')), findings }
}
