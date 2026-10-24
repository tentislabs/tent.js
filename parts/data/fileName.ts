import { TentError } from '../core/index.ts'

/** What names the data file of one tenant: the table of the tenants, and the id of the tenant. */
export type FileName = { table: string; id: string }

/** One table that a write touched, with the ids of its rows, and the file of a tenant where it lives in one. */
export type Touched = { table: string; ids: string[]; file?: FileName }

/**
 * A file that must be brought up before anything reads or writes it. The engine alone catches it: it brings the
 * file up, and carries the call out again.
 */
export class NotReady extends Error {
  file: FileName
  constructor(file: FileName) {
    super(`The data file of ${file.table} ${file.id} must be brought up first.`)
    this.name = 'NotReady'
    this.file = file
  }
}

/** One text for one file, by which the files that are open are kept. */
export const fileKey = (file: FileName | undefined): string => (file ? `${file.table} ${file.id}` : '')

/** The error of a read or a write that does not keep to the file of one tenant. */
export const notOneFile = (why: string, fix: string): TentError =>
  new TentError('T2109', `A read or a write does not keep to the data file of one tenant: ${why}.`, { fix })
