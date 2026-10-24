import type { FileName, Tx } from '../../data/index.ts'
import type { CallContext } from '../context.ts'

// The file of each write of an app that keeps a data file for each tenant, once a row of the write named it.
const files = new WeakMap<object, FileName>()

/** Notes the file that a write is of, when its first row is written. */
export function noteRunFile(cx: CallContext, file: FileName): void {
  if (cx.writing) files.set(cx.writing, file)
}

/**
 * The write that is open in a call, with the file it is of, or nothing where none is open. A write of the files
 * of tenants is of one file: the one that its first row named, and the shared file where it has written no row
 * yet.
 */
export function openOf(cx: CallContext): { tx: Tx; file?: FileName } | undefined {
  if (cx.tx) return { tx: cx.tx }
  if (!cx.writing) return undefined
  const file = files.get(cx.writing)
  return { tx: cx.writing.tx(file), ...(file ? { file } : {}) }
}

/** The file of a write that its rows named, or nothing where it wrote no row of a tenant's file. */
export const fileOfWrite = (writing: object): FileName | undefined => files.get(writing)
