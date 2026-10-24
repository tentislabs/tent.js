import type { FileOptions, None, Only } from '../type.ts'

/** Takes the options of a file, which a value names by its id. Answers the record of the type. */
export function file<const O extends FileOptions = None>(o?: Only<O, FileOptions>): { kind: 'file' } & NoInfer<O> {
  return Object.assign({ kind: 'file' as const }, o)
}
