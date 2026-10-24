import type { LinkOptions, None, Only } from '../type.ts'

/**
 * Takes the name of a table, which is text so that two tables can link to each other, and the options. Answers the
 * record of the type.
 */
export function link<const Table extends string, const O extends LinkOptions = None>(
  table: Table,
  o?: Only<O, LinkOptions>,
): { kind: 'link'; table: Table } & NoInfer<O> {
  return Object.assign({ kind: 'link' as const, table }, o)
}
