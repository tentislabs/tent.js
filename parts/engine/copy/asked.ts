import { AsyncLocalStorage } from 'node:async_hooks'
import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import type { Change } from '../../data/index.ts'

/** One commit that was made while something was carried out: its number, what it touched, and whether every reader confirms it. */
export interface Commit {
  n: number
  tables: string[]
  all: boolean
  confirm: boolean
}

/**
 * What one request, or one call of a program, has done on its machine so far: the commits it made, whether a
 * change of it states `everywhere`, whether it met what only the writer can do, and the ref it is logged under
 * where a reader handed it on.
 */
export interface Underway {
  commits: Commit[]
  everywhere: boolean
  needs: boolean
  ref?: string
}

const asking = new AsyncLocalStorage<Underway>()

/** Answers what the request that is under way has done so far, or nothing where none is. */
export const underwayNow = (): Underway | undefined => asking.getStore()

/** Carries work out as part of one request, and answers what it answers. */
export const asAsked = <Answer>(asked: Underway, work: () => Answer): Answer => asking.run(asked, work)

/** A new record of what a request has done. */
export const newAsked = (ref?: string): Underway => ({
  commits: [],
  everywhere: false,
  needs: false,
  ...(ref ? { ref } : {}),
})

// The errors that say that a reader met what only its writer can do.
const needing = new WeakSet<object>()

/**
 * Answers the error of a reader that met what only the writer can do, and notes it for the request under way, so
 * that the door hands the whole request to the writer. Where no door stands behind it, the error is T0030.
 */
export function needsWriter(what: string, writer?: string): TentError {
  const asked = asking.getStore()
  if (asked) asked.needs = true
  const error = new TentError('T0030', `This machine is a reader, and ${what} is the writer's.`, {
    fix: `Send it as a request, with \`app.request\`, or run it where the writer is${writer ? `: ${writer}` : ''}.`,
  })
  needing.add(error)
  return error
}

/** Whether an error says that a reader met what only its writer can do. */
export const isNeedsWriter = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && needing.has(error)

// The tables whose rows say who a caller is and what they may do.
const guards = ['_t_sessions', '_t_api_keys', '_t_oauth']

// The columns of such a row that say what its caller may do.
const rights = ['scopes', 'roles', 'rights', 'expiresAt', 'endsAt', 'end']

/** The tables that a rule written as a value reads: every table in the `reaches` of a table or of a function. */
function reached(description: Description): Set<string> {
  const names = new Set<string>()
  for (const group of [description.tables, description.functions])
    for (const one of Object.values(group))
      for (const name of Array.isArray(one.reaches) ? one.reaches : []) names.add(String(name))
  return names
}

/**
 * Takes the description of an app and one committed write. Answers whether every reader confirms it, by what it
 * changed: it takes access away, or may. That is a commit that removes a row of a session, a key or a grant, or
 * changes what such a row lets its caller do; removes a user, or changes their roles; touches a table that a rule
 * written as a value reads; holds table steps; or holds `all`.
 */
function confirmed(description: Description, change: Change): boolean {
  if (change.all || change.layout) return true
  const read = reached(description)
  if ((change.tables ?? []).some((table) => read.has(table) || table === 'users' || guards.includes(table))) return true
  return change.rows.some((row) => {
    if (read.has(row.table)) return true
    if (row.table === 'users')
      return row.kind === 'removed' || (row.kind === 'changed' && (row.columns ?? ['roles']).includes('roles'))
    if (!guards.includes(row.table)) return false
    return (
      row.kind === 'removed' || (row.kind === 'changed' && (row.columns ?? rights).some((one) => rights.includes(one)))
    )
  })
}

/** Notes one committed write for the request that is under way. */
export function noteCommit(description: Description, change: Change): void {
  const asked = asking.getStore()
  if (!asked) return
  asked.commits.push({
    n: change.n,
    tables: [...new Set([...change.rows.map((row) => row.table), ...(change.tables ?? [])])],
    all: change.all === true || change.layout !== undefined,
    confirm: confirmed(description, change),
  })
}
