import type { Caller } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import type { FileName, Mode } from '../../data/index.ts'
import type { Crossed } from '../rooms/crossing.ts'
import { revived } from '../rooms/crossing.ts'
import { keepRef } from '../door/failure.ts'
import type { LogTable } from '../log/tables.ts'
import type { ReadsSent } from '../watched.ts'
import type { Gathered } from '../counts/gather.ts'

/** What a query thread is started with: where the data and the running version of its app lie, and the description. */
export interface Start {
  name: string
  mode: Mode
  dataFolder: string
  bundle: string
  version: string
  description: Description
  // Of an app that keeps a data file for each tenant: the fingerprint that a file of each table of tenants holds at the running layout.
  fingerprints?: Record<string, string>
}

/** One call that a query thread is handed: the function, its input, its caller, and the moment of the app's clock. */
export interface Job {
  id: number
  name: string
  input: unknown
  caller: Caller
  now: number
  // How many milliseconds of the time of the call are left, where the call began before it was handed over.
  left?: number
  // The live hub watches the read: the thread tells what it read with its answer.
  reads?: true
  // Under `tent test`, the test whose work the call is: what the thread touches for it lands under that test.
  test?: string
}

/** What a query thread tells the main thread. */
export type ThreadTold =
  | { ready: true }
  | { id: number; value: unknown; reads?: ReadsSent }
  | { id: number; failed: Crossed }
  // The read named a data file of a tenant that must be brought up or swept first, or, with `lacks`, one that
  // lacks a table of its layout.
  | { id: number; notReady: FileName; lacks?: true }
  | { log: { table: LogTable; row: Record<string, string | number | boolean | undefined> } }
  | { raise: { name: string; caller: Caller; failed: Crossed } }
  // What the thread counted, which the main thread writes.
  | { counted: Gathered[] }

/** Takes a failure that crossed from a query thread. Answers the error it stands for, which keeps the ref it was logged under. */
export function revivedHere(failed: Crossed): Error {
  const error = revived(failed)
  if (failed.ref) keepRef(error, failed.ref)
  return error
}
