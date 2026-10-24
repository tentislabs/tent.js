import type { Description } from '../core/internal.ts'
import { limitDefaults } from '../core/internal.ts'

/** The name of a limit that the engine holds a call to. */
export type LimitName =
  | 'queryTime'
  | 'changeTime'
  | 'actionTime'
  | 'valueSize'
  | 'functionDepth'
  | 'drawPasses'
  | 'streamTime'
  | 'callSize'
  | 'anyonePerMinute'
  | 'callerPerMinute'
  | 'screensPerMinute'
  | 'queryThreads'
  | 'logSize'
  | 'liveRows'
  | 'optimisticKept'
  | 'loadingAfter'
  | 'prefetchKept'
  | 'prefetchAtOnce'
  | 'callHold'
  | 'pageCacheSize'
  | 'pageCachePerScreen'

/**
 * Answers a limit of a project by its name, as it is stored: what the project states, or what holds where it
 * states none, by the one table of the limits.
 */
export function storedLimit(description: Description, name: string): number {
  const stated: unknown = Object(description.project.limits)[name]
  return typeof stated === 'number' ? stated : (limitDefaults.project[name] ?? 0)
}

/** Answers a limit that the engine holds a call to. */
export const limitOf = (description: Description, name: LimitName): number => storedLimit(description, name)
