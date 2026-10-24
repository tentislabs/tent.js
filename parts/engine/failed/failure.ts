import { TentError } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import type { Placed } from './mapped.ts'
import { inSource } from './mapped.ts'
import { ownersBy } from './owners.ts'
import { framesOf } from './stack.ts'
import { spanNow } from '../trace/span.ts'

/** One call of the chain that led to a failure: a place of the project, or a run of calls folded away. */
type ChainCall =
  | { name?: string; file: string; line: number; column: number }
  | { folded: number; of: 'framework' }
  | { folded: number; of: 'package'; package: string; file: string }

/**
 * A failure while running, as the overlay and the terminal show it, as a finding is: its code, its words, what
 * failed, the file, the line and the column of the project's source, the lines around it, and the chain of calls
 * that led there with the calls of the framework and of packages folded away.
 */
export interface Failure {
  code: string
  level: 'error'
  message: string
  failed: string
  where?: { file: string; line: number; column: number }
  lines?: { line: number; text: string }[]
  calls: ChainCall[]
  // The trace the failure happened in, which `tent logs --trace` prints as a tree.
  trace?: string
}

// How many lines before and after the line that failed are shown.
const around = 2

/** The chain of calls, each in the project, and each run of calls of the framework or of one file of a package as one. */
function chainOf(placedCalls: Placed[]): ChainCall[] {
  const calls: ChainCall[] = []
  for (const one of placedCalls) {
    const last = calls.at(-1)
    if (one.of === 'project') {
      calls.push({ ...(one.name ? { name: one.name } : {}), file: one.file, line: one.line, column: one.column })
      continue
    }
    if (one.of === 'framework') {
      if (last && 'folded' in last && last.of === 'framework') last.folded += 1
      else calls.push({ folded: 1, of: 'framework' })
      continue
    }
    if (last && 'folded' in last && last.of === 'package' && last.file === one.file) last.folded += 1
    else calls.push({ folded: 1, of: 'package', package: one.package, file: one.file })
  }
  return calls
}

/**
 * Takes an app, the name of what failed, what was thrown, and the trace of a failure in a browser where it is one.
 * Answers the failure as it is shown: each call of its trace led back to its source by the maps of the bundle. A
 * view that failed in a component of a package, where no call of its trace lies in the project, is shown at the
 * tag of the project's file that used the component, as React of development told the tags that drew it.
 */
export function shownFailure(
  o: Opened,
  name: string,
  error: unknown,
  browser?: { message: string; stack: string; owners?: string },
): Failure {
  const message = browser?.message ?? (error instanceof Error ? error.message : String(error))
  const stack = browser?.stack ?? (error instanceof Error ? (error.stack ?? '') : '')
  const owners = browser?.owners ?? (typeof error === 'object' && error !== null ? ownersBy.get(error) : undefined)
  const placedCalls = [...framesOf(stack), ...framesOf(owners ?? '')].map((frame) => inSource(o, frame))
  const first = placedCalls.find((one) => one.of === 'project')
  const trace = browser ? undefined : spanNow()?.trace
  const lines =
    first?.text === undefined
      ? undefined
      : first.text
          .split('\n')
          .map((text, place) => ({ line: place + 1, text }))
          .slice(Math.max(0, first.line - 1 - around), first.line + around)
  return {
    code: error instanceof TentError ? error.code : 'T0009',
    level: 'error',
    message,
    failed: name,
    ...(first ? { where: { file: first.file, line: first.line, column: first.column } } : {}),
    ...(lines ? { lines } : {}),
    calls: chainOf(placedCalls),
    ...(trace ? { trace } : {}),
  }
}
