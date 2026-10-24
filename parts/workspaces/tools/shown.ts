import { TentError } from '../../core/index.ts'
import { allows, definitionsOf } from '../policy.ts'
import { describedNow } from '../written.ts'
import type { ToolAt } from './face.ts'

/**
 * Takes where a tool works and a path of the project. Answers whether the policy's `read` shows that file: `'*'`,
 * or the kind, with a name where it names one, of a definition the file holds, and `'file'` for a file that holds
 * no definition.
 */
export async function shownFile(at: ToolAt, path: string): Promise<boolean> {
  const { read } = at.policy
  if (read.includes('*')) return true
  const { description } = await describedNow(at)
  const held = [...definitionsOf(description)].filter(([, placed]) => placed.file === path)
  if (!held.length) return allows(read, 'file', path)
  return held.some(([name, placed]) => allows(read, placed.kind, name))
}

/** The error of a file that the policy's `read` does not show: it is not found, as anything a caller may not read. */
export const notShown = (path: string): TentError =>
  new TentError('T0001', `No file ${JSON.stringify(path).slice(0, 120)} is shown to this agent.`, {
    fix: 'Read a file that the policy of the agent shows.',
  })
