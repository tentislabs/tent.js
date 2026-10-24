import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { describeProject } from '../../build/index.ts'
import { boolean, choice, list, number, TentError, text } from '../../core/index.ts'
import type { Finding } from '../../core/index.ts'
import { finding } from '../../core/internal.ts'
import { findPage } from '../../docs/index.ts'
import type { Command } from '../command.ts'
import { keepLooks } from '../looksKept.ts'
import { budgetOf, compared, kept as keptEvaluation, resultsIn } from '../evals.ts'
import { evalsFromRuns } from '../fromRuns.ts'
import { plannedTest } from '../testPlan.ts'
import { roomOfRun } from '../testRoom.ts'
import { joined, keepReport, shareOf } from '../testShards.ts'
import { testFiles, testsRan } from '../testsRan.ts'
import { watchTests } from '../testWatch.ts'

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
 * app. Answers how many tests passed and failed, the tests not run, and the files, and keeps that report in
 * `results/tests/report.json`. A word after the name runs one test file, or the tests of that name. A test that failed is an error, named with its whole failure: what it threw and
 * where, and what that test wrote out. `--shard <n>/<of>` runs a share of the files, split by their names, and
 * `--join <folders>` answers the one report of the shares that those folders kept. `--plan <screen>` writes a first
 * test of a screen, `--watch` runs the tests again on each save, and `--looks update` keeps the new pictures and
 * the new things heard that the tests wrote.
 */
export const command: Command = {
  name: 'test',
  args: {
    // The first, so that a word after the name of the command is the file or the name to run.
    only: text({ optional: true }),
    ai: boolean({ optional: true }),
    budget: list(text(), { optional: true }),
    compare: boolean({ optional: true }),
    'from-runs': text({ optional: true }),
    below: number({ optional: true }),
    data: text({ optional: true }),
    plan: text({ optional: true }),
    watch: boolean({ optional: true }),
    shard: text({ optional: true }),
    join: list(text(), { optional: true }),
    looks: choice(['update'], { optional: true }),
    room: choice(['program', 'apart'], { optional: true }),
  },
  needs: 'project',
  run: async ({ folder, args }) => {
    // A file or a name to run goes with nothing that runs no test, or every test: a second word falls there too.
    const beside = ['from-runs', 'plan', 'join', 'looks', 'watch', 'shard'].find((name) => args[name] !== undefined)
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
  let files = testFiles(folder, ai)
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
  // The tests of AI behaviour run one after another, with the keys of the project's test data, under one budget
  // for the whole command, and each `evals` writes what it used and what it gave where the command reads it.
  const kept = ai ? mkdtempSync(join(tmpdir(), 'tent-ai-')) : undefined
  const results = kept ? join(kept, 'results.jsonl') : undefined
  if (kept && results) {
    const budget = budgetOf(Array.isArray(args.budget) ? args.budget.map(String) : undefined)
    process.env.TENT_AI_BUDGET = budget === 'none' ? 'none' : JSON.stringify(budget)
    process.env.TENT_AI_LEDGER = join(kept, 'used.jsonl')
    process.env.TENT_AI_RESULTS = results
    process.env.TENT_AI_DATA = join(folder, '.tent')
  }
  const ran = await testsRan(folder, files, { ai, ...(only.name === undefined ? {} : { only: [only.name] }) })
  const { passed, findings, notRun } = ran
  if (only.name !== undefined && passed + findings.length + notRun.length === 0)
    return {
      findings: [misused(`No test file and no test of the project is named "${only.name.slice(0, 120)}".`, 'T0001')],
    }
  if (!kept || !results) {
    const value = { passed, failed: findings.length, ...(notRun.length ? { notRun } : {}), files }
    keepReport(folder, { value, findings })
    return { value, findings }
  }
  for (const name of ['TENT_AI_BUDGET', 'TENT_AI_LEDGER', 'TENT_AI_RESULTS', 'TENT_AI_DATA']) delete process.env[name]
  // The evaluation is kept in `evals/`, and set against the one before where `--compare` asks for it.
  const gave = resultsIn(results)
  const version = String(gave.find((one) => one.version !== undefined)?.version ?? 'unbuilt')
  const evaluation = { version, at: new Date().toISOString(), results: gave }
  const file = keptEvaluation(folder, evaluation)
  rmSync(kept, { recursive: true, force: true })
  if (args.compare === true) findings.push(...compared(folder, file, evaluation))
  return { value: { passed, failed: findings.length, files, evaluation: file }, findings }
}
