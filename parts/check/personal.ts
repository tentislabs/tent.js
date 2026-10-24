import { isStored } from '../core/internal.ts'

/**
 * Takes a stored entry of `data` and the functions of the description. Answers what the entry reads, and whether
 * anyone may read it the same: nothing where the entry reads no function.
 */
export function readerOf(
  entry: unknown,
  functions: Record<string, unknown>,
): { what: string; open: boolean } | undefined {
  if (!isStored(entry)) return undefined
  for (const kind of ['query', 'action']) {
    const what = entry[kind]
    if (typeof what !== 'string') continue
    const fn = Object.hasOwn(functions, what) ? functions[what] : undefined
    const access = isStored(fn) ? fn.access : undefined
    return { what, open: isStored(access) && access.rule === 'anyone' && entry.member === undefined }
  }
  // A member of an agent, or `working` of a flow or of an action, is never the same for every visitor.
  const named = entry.agent ?? entry.flow ?? entry.working
  return typeof named === 'string' ? { what: named, open: false } : undefined
}

/**
 * Takes the stored record of a component and the functions of the description. Answers whether it is a personal
 * part, which answers each visitor their own: it states `personal: true`, or an entry of its `data` is not open to
 * anyone.
 */
export function isPersonal(component: Record<string, unknown>, functions: Record<string, unknown>): boolean {
  if (component.personal === true) return true
  return Object.values(isStored(component.data) ? component.data : {}).some(
    (entry) => readerOf(entry, functions)?.open === false,
  )
}
