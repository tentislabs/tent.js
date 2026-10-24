import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../core/index.ts'
import { asked } from './reach.ts'

/** One run that people rated, as the engine tells it. */
interface Rated {
  run: string
  rating: number
  message?: string
  answer?: string
}

/** The text of a file of evals of an agent: each rated run as a case, with what it answered beside it. */
function casesText(agent: string, runs: Rated[]): string {
  const named = JSON.stringify(agent)
  const lines = runs.map((one) => {
    const answered = one.answer === undefined ? 'nothing' : JSON.stringify(one.answer).slice(0, 200)
    return [
      `    // Rated ${one.rating}. It answered ${answered}.`,
      `    { name: ${JSON.stringify(one.run)}, say: ${JSON.stringify(one.message ?? '')}, expect: {} },`,
    ].join('\n')
  })
  return [
    "import assert from 'node:assert/strict'",
    "import { test } from 'node:test'",
    "import { evals, testApp } from 'tentjs/test'",
    '',
    `// The runs of ${agent} that people rated low, kept as cases. Write in \`expect\` what each should give.`,
    `test(${JSON.stringify(`${agent}, from its rated runs`)}, async () => {`,
    '  const app = await testApp()',
    `  const result = await evals(app, ${named.replaceAll('"', "'")}, [`,
    ...lines,
    '  ])',
    '  assert.equal(result.failed, 0)',
    '})',
    '',
  ].join('\n')
}

/**
 * `tent test --ai --from-runs <agent>`: asks the engine that runs the app for the kept runs of the agent
 * that people rated, below `below` where it is given, and writes them as a file of evals that the builder edits,
 * `tests/<agent>.runs.ai.ts`. Answers the file and how many cases it holds. Throws what the engine refused.
 */
export async function evalsFromRuns(
  folder: string,
  o: { agent: string; below?: number; data?: string },
): Promise<{ file: string; cases: number }> {
  const answer = await asked({ folder, data: o.data }, 'rated', {
    agent: o.agent,
    ...(o.below === undefined ? {} : { below: o.below }),
  })
  const refused = answer.findings?.[0]
  if (refused) throw new TentError(refused.code, refused.message)
  const runs: unknown = Reflect.get(Object(answer.value), 'runs')
  const rated = (Array.isArray(runs) ? runs : []).map((one): Rated => Object(one))
  const file = `tests/${o.agent}.runs.ai.ts`
  mkdirSync(join(folder, 'tests'), { recursive: true })
  writeFileSync(join(folder, file), casesText(o.agent, rated))
  return { file, cases: rated.length }
}
