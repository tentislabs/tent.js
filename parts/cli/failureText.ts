import { join } from 'node:path'
import { isStored } from '../core/internal.ts'

/** Whether what the open pages show is a failure while running, which names the chain of calls that led to it. */
export const isFailure = (shown: unknown): shown is Record<string, unknown> =>
  isStored(shown) && Array.isArray(shown.calls) && typeof shown.message === 'string'

/** A place of the project as the terminal names it: by the path of its file, with its line and column. */
const placeIn = (folder: string, place: Record<string, unknown>): string =>
  `${join(folder, String(place.file))}:${String(place.line)}:${String(place.column)}`

/**
 * Takes a failure while running, as the open pages show it, and the folder of the project. Answers what the terminal
 * says of it: its code, its words and what failed, the place in the project's source by the path of its file, the
 * lines around it, and the chain of calls, each run of calls of the framework or of a package folded into one line.
 */
export function failureText(failure: Record<string, unknown>, folder: string): string {
  const where = isStored(failure.where) ? failure.where : undefined
  const told = [
    `${String(failure.code)} ${String(failure.message)}${typeof failure.failed === 'string' ? ` (${failure.failed})` : ''}`,
    ...(where ? [`  at ${placeIn(folder, where)}`] : []),
  ]
  const lines = Array.isArray(failure.lines) ? failure.lines.filter(isStored) : []
  const wide = String(Math.max(0, ...lines.map((one) => Number(one.line)))).length
  for (const one of lines)
    told.push(`${one.line === where?.line ? '  >' : '   '} ${String(one.line).padStart(wide)} | ${String(one.text)}`)
  told.push('  calls:')
  for (const call of Array.isArray(failure.calls) ? failure.calls.filter(isStored) : []) {
    if (typeof call.folded === 'number')
      told.push(
        call.of === 'package'
          ? `    … ${call.folded} in the package ${String(call.package)}, ${String(call.file)}`
          : `    … ${call.folded} of the framework`,
      )
    else told.push(`    ${typeof call.name === 'string' ? `${call.name} ` : ''}${placeIn(folder, call)}`)
  }
  return told.join('\n')
}
