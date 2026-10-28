import { describeProject } from '../../build/index.ts'
import { checkProject } from '../../check/index.ts'
import { TentError, text } from '../../core/index.ts'
import type { Description, Facts } from '../../core/internal.ts'
import { finding } from '../../core/internal.ts'
import { readFacts } from '../../engine/index.ts'
import { markChecked } from '../checkMarked.ts'
import type { Command } from '../command.ts'
import { askedOfRunning, dataFolderOf } from '../reach.ts'
import { recordedTouched } from '../testsKept.ts'

/** Whether what an engine answered are the facts of the check. */
const isFacts = (value: unknown): value is Facts =>
  typeof value === 'object' && value !== null && Array.isArray(Reflect.get(value, 'tableFindings'))

/**
 * Takes where a check was typed, and the description of the project as its files now stand. Answers what only the
 * data of the project knows: from the engine that runs on the data folder, through the admin channel, and where
 * none runs by reading the data itself, with no engine started. Beside it, what each test touched in its last run.
 */
async function factsFor(o: { folder: string; data?: unknown }, description: Description): Promise<Facts> {
  const touched = recordedTouched(o.folder)
  const tested = touched ? { touched } : {}
  const running = await askedOfRunning(o, 'facts', { description })
  if (!running) return { ...(await readFacts(dataFolderOf(o), description)), ...tested }
  if (isFacts(running.value)) return { ...running.value, ...tested }
  // The engine refused the command, or answered something else: the check cannot stand in for what it knows.
  const [refused] = running.findings ?? []
  throw new Error(
    `The engine that runs on the data answered no facts${refused ? `: ${refused.code} ${refused.message}` : '.'}`,
  )
}

/**
 * Builds the description, carries out every rule and the type checker, and answers every finding at once. The
 * project is held against its data too: `--data` names the data folder, and `.tent/` holds where none is named.
 * It needs no bundle, and starts no engine. `now` of the history is marked with what it found.
 */
export const command: Command = {
  name: 'check',
  args: { data: text({ optional: true }) },
  needs: 'project',
  run: async ({ args, folder }) => {
    // A project with an error is still described, and so still held against its data.
    const { description, described } = await describeProject(folder)
    let facts: Facts
    try {
      facts = await factsFor({ folder, data: args.data }, description)
    } catch (error) {
      // Data that cannot be opened is a finding, with what mends it, and not a failure of the command.
      if (!(error instanceof TentError) || error.code !== 'T0018') throw error
      return { findings: [finding(error.code, error.message, error.fix === undefined ? {} : { fix: error.fix })] }
    }
    const { findings, forms, why } = await checkProject(folder, { facts })
    // A point keeps the description as it was before the build added what it made, as `tent dev` keeps it.
    markChecked(folder, described, !findings.some((one) => one.level === 'error'))
    // Each definition with its form, `plain` or `code` and no more, and for a code one what made it code, in a
    // field of its own.
    const sorted = <Value>(record: Record<string, Value>): Record<string, Value> =>
      Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)))
    return { value: { definitions: sorted(forms), why: sorted(why) }, findings }
  },
}
