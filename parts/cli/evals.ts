import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Finding } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { finding, isStored } from '../core/internal.ts'

/** What one case of a result of `evals` holds, as an evaluation keeps it. */
interface KeptCase {
  name: string
  pass: boolean
  score: number
}

/** One result of `evals`, as an evaluation keeps it. */
interface KeptResult {
  name: string
  version?: string
  each: KeptCase[]
}

/** What `tent test --ai` keeps of one evaluation, in `evals/`. */
interface Evaluation {
  version: string
  at: string
  results: KeptResult[]
}

/**
 * Reads `--budget`: each `<unit>=<most>` is one bound, and `none` is no budget. Left out it is
 * `tokensOut=500000`. Throws T0002 for a word of another form.
 */
export function budgetOf(words: string[] | undefined): Record<string, number> | 'none' {
  if (!words?.length) return { tokensOut: 500_000 }
  if (words.length === 1 && words[0] === 'none') return 'none'
  const budget: Record<string, number> = {}
  for (const word of words) {
    const [unit, most] = word.split('=')
    const amount = Number(most)
    if (!unit || !/^[a-zA-Z]+$/.test(unit) || !Number.isFinite(amount) || amount < 0)
      throw new TentError('T0002', `--budget takes <unit>=<most>, or none, and was given ${word.slice(0, 40)}.`, {
        fix: 'Write it as --budget tokensOut=200000, once for each unit it bounds.',
      })
    budget[unit] = amount
  }
  return budget
}

/** A result as an evaluation keeps it: whole, with what a comparison reads of it held to its form. */
const resultOf = (one: Record<string, unknown>): KeptResult => ({
  ...one,
  name: String(one.name),
  ...(typeof one.version === 'string' ? { version: one.version } : {}),
  each: (Array.isArray(one.each) ? one.each : []).filter(isStored).map((kept) => ({
    ...kept,
    name: String(kept.name),
    pass: kept.pass === true,
    score: typeof kept.score === 'number' ? kept.score : 0,
  })),
})

/** The results that the cases of a run of the tests wrote, one on each line. */
export function resultsIn(file: string): KeptResult[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter(isStored)
    .map(resultOf)
}

/** The folder of the evaluations: `evals/` of the engine's own folder, which no file of the project holds. */
const evalsOf = (folder: string): string => join(folder, '.tent', 'evals')

/**
 * Keeps an evaluation in `evals/` of the engine's own folder of the project, in a file named by its time and its
 * version id, and answers the path of the file.
 */
export function kept(folder: string, evaluation: Evaluation): string {
  const evals = evalsOf(folder)
  mkdirSync(evals, { recursive: true })
  const file = join(evals, `${evaluation.at.replaceAll(':', '-')}-${evaluation.version}.json`)
  writeFileSync(file, `${JSON.stringify(evaluation, null, 2)}\n`)
  return file
}

/** The newest evaluation that `evals/` held before this one, where there is one. */
function earlier(folder: string, but: string): Evaluation | undefined {
  const evals = evalsOf(folder)
  if (!existsSync(evals)) return undefined
  const [newest] = readdirSync(evals)
    .filter((name) => name.endsWith('.json') && join(evals, name) !== but)
    .sort()
    .reverse()
  if (!newest) return undefined
  const read: unknown = JSON.parse(readFileSync(join(evals, newest), 'utf8'))
  return isStored(read) && Array.isArray(read.results)
    ? { version: String(read.version), at: String(read.at), results: read.results.filter(isStored).map(resultOf) }
    : undefined
}

/**
 * Sets an evaluation against the newest earlier one, matching results and cases by name. Answers a finding of
 * each case that passed before and fails now, or whose score fell by more than 0.1: an error, so the command ends
 * with 1 where there is one.
 */
export function compared(folder: string, file: string, now: Evaluation): Finding[] {
  const before = earlier(folder, file)
  if (!before) return []
  const found: Finding[] = []
  for (const result of now.results) {
    const was = before.results.find((one) => one.name === result.name)
    if (!was) continue
    for (const one of result.each) {
      const then = was.each.find((kept) => kept.name === one.name)
      if (!then) continue
      if ((then.pass && !one.pass) || then.score - one.score > 0.1)
        found.push(
          finding(
            'T0009',
            `${result.name}: the case "${one.name}" ${then.pass && !one.pass ? 'passed before and fails now' : 'scores lower than before'}: ${then.score.toFixed(2)} then, ${one.score.toFixed(2)} now.`,
            {
              fix: 'Look at what changed in the prompt, the tools or the model since the evaluation it is set against.',
            },
          ),
        )
    }
  }
  return found
}
