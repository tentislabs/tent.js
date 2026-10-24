import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import type { RuleCode } from './rules.ts'
import type { FileName } from './fileName.ts'
import type { Files } from './files.ts'
import type { Plan } from '../core/internal.ts'
import type { Hidden } from './columnRules.ts'
import type { TableModel } from './model.ts'
import type { Row, StorePlan, Tx } from './store.ts'

/** What seals the value of a `sealed` column before it reaches the store, and opens it after. `bound` names the table, the column and the row. */
export interface Seal {
  close(value: unknown, bound: string): string
  open(text: string, bound: string): unknown
  // A keyed fingerprint of a value, by which a sealed column that is findable is found: `bound` names the table and the column.
  find?(value: unknown, bound: string): string
}

/**
 * A search of the builder's own: it is told the texts of every row that is written, and answers the ids for some
 * words, at once. For a tenant table, the last value names the tenant whose file the row lives in,
 * and the searcher is told of a tenant that was removed.
 */
export interface Searcher {
  has(table: string): boolean
  wrote(table: string, id: string, texts: Record<string, string> | undefined, of?: FileName): void
  find(table: string, words: string, limit: number, of?: FileName): string[]
  gone?(of: FileName): void
}

/** One row that a `db` added, changed or removed: the row as the store holds it, and for a change what it was and which columns moved. */
export interface Wrote {
  table: string
  kind: 'added' | 'changed' | 'removed'
  row: Row
  before?: Row
  columns?: string[]
}

/** What `data` tells in place of writing a log: a read that passed its time, and a write that a rule refused. */
export type Noted =
  | { kind: 'slow'; table: string; ms: number; rows: number }
  | { kind: 'refused'; table: string; what: 'add' | 'change' | 'remove'; rule: string }

/** What `createDb` takes last. */
export interface DbOptions {
  system?: boolean
  wrote?: (w: Wrote) => void
  noted?: (n: Noted) => void
  // Told each plan that was read, with what it answered: what an answer that is remembered rests on.
  read?: (plan: Plan, answer: unknown, file?: FileName) => void
  limits?: { time?: number; rows?: number }
  now?: () => number
  guarded?: Record<string, string[]>
  searcher?: Searcher
  seal?: Seal
  touches?: string[]
  // A model that ranks texts by how well each fits the words, called where the `db` may wait: one score a text.
  ranker?: Ranker
  // Carries each read and each write of the db out, so that what made the db sees how long each took, and on what.
  traced?: <Answer>(what: Traced, work: () => Answer) => Answer
}

/** What one read or write of a db is, as `traced` is told it: a read of a table, or a write of one row. */
export interface Traced {
  kind: 'query' | 'write'
  table: string
  write?: 'add' | 'change' | 'remove'
}

/** Asks a model that states the kind `rank` how well each text fits the words. Answers one score for each text. */
export type Ranker = (model: string, words: string, texts: string[]) => Promise<number[]>

/** What one `db` works with: whose it is, what it reads and writes through, and whether a rule limits it. */
export interface DbContext {
  description: Description
  caller: Caller
  mode: 'read' | 'write' | 'async'
  rules: Record<string, RuleCode>
  o: DbOptions
  // No rule limits this `db`, and it is handed every column.
  full: boolean
  // What it hands out is frozen and kept, as a query's is.
  freeze: boolean
  // Reads a plan in the file it belongs to: the shared file, or the file of the tenant this db works in.
  read(plan: StorePlan): unknown
  // Answers the write of the shared file, or of one tenant's. It is there for a db that writes.
  write?: (file?: FileName) => Tx
  // The files of an app that keeps a file for each tenant.
  files?: Files
  // The file of the tenant whose rows are read or written at the moment.
  at?: FileName
  now(): number
  // The moment past which its next call fails.
  deadline?: number
  // How deep the plans inside rules stand in each other while one is worked out.
  depth: number
  // What the read rules of the columns of a table hide from the caller of this `db`.
  hidden?: (model: TableModel) => Hidden
  // The columns that what leaves the engine through a typed answer loses for the caller, though full access read them.
  leaving?: (model: TableModel) => string[]
}

/** Answers the time, and throws T0008 where the `db` is used past its time. */
export function begin(cx: DbContext): number {
  const at = cx.now()
  if (cx.deadline !== undefined && at > cx.deadline)
    throw new TentError('T0008', 'A time limit of the engine was passed: this db is used past its time.', {
      fix: 'Read less in one call, mark a slow query `heavy`, or raise the limit in `project.limits`.',
    })
  return at
}

/** The words that bind a sealed value to its place: its table, its column and its row. */
export const boundOf = (table: string, column: string, id: unknown): string => `${table}.${column}.${String(id)}`

/** The error of a sealed column that is read or written with no key at hand. */
export const noKey = (table: string, column: string): TentError =>
  new TentError('T0019', `\`${column}\` of \`${table}\` is sealed, and no key is at hand to open or to seal it.`, {
    fix: 'Give the engine the key of the secrets: `tent secrets key` makes one.',
  })
