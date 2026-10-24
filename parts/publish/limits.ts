import type { Description } from '../core/internal.ts'
import { limitDefaults } from '../core/internal.ts'

/** The limits of publishing, of push and of pull. */
export type SyncLimit =
  | 'historyFileSize'
  | 'historyKept'
  | 'syncSize'
  | 'syncFileSize'
  | 'syncLooseSize'
  | 'syncPerMinute'
  | 'publishTime'
  | 'versionKept'
  | 'versions'
  | 'previewKept'

/** A limit of a project as it is stored: what the project states, or what holds where it states none. */
export function syncLimit(description: Pick<Description, 'project'> | undefined, name: SyncLimit): number {
  const stated: unknown = Object(description?.project.limits)[name]
  return typeof stated === 'number' ? stated : (limitDefaults.project[name] ?? 0)
}

/** How many ids one request may name. */
export const idsAtOnce = 1000
