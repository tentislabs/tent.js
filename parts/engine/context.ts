import { AsyncLocalStorage } from 'node:async_hooks'
import type { Caller } from '../core/index.ts'
import type { Plan } from '../core/internal.ts'
import type { FileName, Tx, Writing } from '../data/index.ts'
import type { At } from '../flows/index.ts'
import type { Opened } from './opened.ts'
import type { Remote } from './work/remote.ts'

/** The piece of work that a call carries out: a function of one kind, the arrow of a rule, or the starter data. */
export interface Work {
  name: string
  kind: 'query' | 'change' | 'action' | 'rule' | 'seed'
  // How deep the calls from code stand in each other: the call that came through the door is 1.
  depth: number
  // The moment of the call, which a query and a change are handed as `now`.
  now: Date
  // The moment past which the work is ended, by the clock of the runtime that never jumps.
  ends: number
}

/** What one write has done so far, which is told once the write is committed. */
export interface Written {
  rows: { table: string; id: string; kind: 'added' | 'changed' | 'removed' }[]
  // The changes that ended inside the write, each with the rows it wrote.
  done: { name: string; caller: Caller; touched: { table: string; ids: string[] }[] }[]
  // What is done once the write is committed, and never where it is undone: a cookie that is handed out.
  after?: (() => void)[]
}

/** What a call belongs to: its app, the running version, its caller, and the write that is open for it. */
export interface CallContext {
  app: Opened
  version: string
  caller: Caller
  tx?: Tx
  run?: { id: string; step?: { name: string; repeat: number }; leave?: unknown }
  made: number
  signal: AbortSignal
  reads?: true
  // Of an app that keeps a data file for each tenant: the write that is open, which names its file with its first row.
  writing?: Writing
  // Told once the caller of the call that this work began in left.
  left?: AbortSignal
  // Told each read that the work makes, with what it answered: what an answer that is remembered rests on.
  noting?: (plan: Plan, answer: unknown, file?: FileName) => void
  // Work that fills a column: it reads nothing of the store, and its run, where it has one, is found by `call`.
  fills?: { call: string }
  work: Work
  written?: Written
  // Work on a worker: its calls, reads and handles cross to the writer.
  remote?: Remote
  // What `onRequest` is handed of the request that the call answers: the caller's address, and the scheme and name.
  about?: { from: string; origin: string }
  // A function that a person agreed to under a tool call, at its place in the making of its step: it is made once.
  agreed?: { at: At; name: string; nth: number }
  // What the work of an action that is a run says, to whoever follows the run.
  say?: (value: unknown) => void
  // The number the call is open under in a room that crosses, by which the room's code finds it again.
  call?: number
}

const calls = new AsyncLocalStorage<CallContext>()

/** Answers what the call that is under way belongs to, or nothing where no call is under way. */
export const underWay = (): CallContext | undefined => calls.getStore()

/** Carries a piece of work out as part of no call, as the program's own, and answers what it answers. */
export const outsideCalls = <Answer>(work: () => Answer): Answer => calls.exit(work)

/** Carries a piece of work out as part of a call, and answers what it answers. */
export const within = <Answer>(context: CallContext, work: () => Answer): Answer => calls.run(context, work)
