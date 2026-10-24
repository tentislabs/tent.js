import { member } from '../handle.ts'

/** A row that an undo left as it stands: what the work left in its columns, and what stands there now. */
interface Clash {
  table: string
  id: string
  columns: string[]
  left?: Record<string, unknown>
  now?: Record<string, unknown>
  by?: 'unknown'
}

/** What an undo answers: how many rows it took back, what it left, and what stays done outside the app. */
interface Undone {
  undone: number
  clashes: Clash[]
  outside: { kind: string; name: string; at: number }[]
}

/**
 * The handle that takes back what a run, a grant or a key wrote, for code with full access. Every member answers a
 * promise; with `dry` it answers the same and changes nothing.
 */
interface Undo {
  run(id: string, o?: { started?: boolean; dry?: boolean }): Promise<Undone>
  grant(id: string, o: { since: Date | string; dry?: boolean }): Promise<Undone>
  key(id: string, o: { since: Date | string; dry?: boolean }): Promise<Undone>
}

export const undo: Undo = {
  run: member('undo', 'run'),
  grant: member('undo', 'grant'),
  key: member('undo', 'key'),
}
