import { limitDefaults, isWritten } from '../core/internal.ts'
import type { Held } from './held.ts'

/**
 * Takes the runner, a version of the app and the name of a limit of its project. Answers the limit as it is
 * stored, or its default where the project states none: no bound at all for a limit with no number of its own.
 */
export function projectLimit(held: Held, version: string, name: string): number {
  const limits: unknown = held.env.description(version).project.limits
  const stated = isWritten(limits) ? limits[name] : undefined
  return typeof stated === 'number' ? stated : (limitDefaults.project[name] ?? Number.POSITIVE_INFINITY)
}
