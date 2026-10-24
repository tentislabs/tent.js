import type { ListOptions, None, Only, Type } from '../type.ts'

/** Takes the type of an entry, and the options. Answers the record of the type. */
export function list<Entry extends Type, const O extends ListOptions = None>(
  of: Entry,
  o?: Only<O, ListOptions>,
): { kind: 'list'; of: Entry } & NoInfer<O> {
  return Object.assign({ kind: 'list' as const, of }, o)
}
