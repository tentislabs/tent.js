import type { Description } from '../../core/internal.ts'
import { isStored, stateEntries } from '../../core/internal.ts'

/** Whether a stored value reads `user`, or a state of those named, by a name anywhere inside it. */
function readsOf(value: unknown, device: Set<string>): boolean {
  if (Array.isArray(value)) return value.some((one) => readsOf(one, device))
  if (!isStored(value)) return false
  const name = value.name
  if (Array.isArray(name) && (name[0] === 'user' || (name[0] === 'state' && device.has(String(name[1]))))) return true
  return Object.values(value).some((one) => readsOf(one, device))
}

/** Whether an entry of `data` answers each visitor their own: one that not everyone may read, or that is a member. */
function ownEntry(entry: unknown, description: Description): boolean {
  if (!isStored(entry)) return false
  if (entry.agent !== undefined || entry.flow !== undefined || entry.working !== undefined) return true
  const what = typeof entry.query === 'string' ? entry.query : typeof entry.action === 'string' ? entry.action : ''
  if (what === '') return false
  const read = Object.hasOwn(description.functions, what) ? description.functions[what] : undefined
  return Object(read?.access).rule !== 'anyone' || entry.member !== undefined
}

/**
 * Takes the description and the components that a screen draws. Answers those that answer each visitor their own,
 * as the description shows it: an entry of `data` that not everyone may read the same, a `data` that reads `user`
 * or a state kept in the device, or a component that states `personal`. These are the personal
 * parts of a screen that is kept: drawn for each visitor, and never kept.
 */
export function personalParts(description: Description, uses: string[]): Set<string> {
  const found = new Set<string>()
  for (const name of uses) {
    const component: unknown = Object.hasOwn(description.components, name) ? description.components[name] : undefined
    if (!isStored(component)) continue
    const device = new Set(
      Object.entries({ ...stateEntries(description.project.state), ...stateEntries(component.state) })
        .filter(([, entry]) => entry.in === 'device')
        .map(([state]) => state),
    )
    const data = isStored(component.data) ? component.data : {}
    if (
      component.personal === true ||
      Object.values(data).some((entry) => ownEntry(entry, description)) ||
      readsOf(data, device)
    )
      found.add(name)
  }
  return found
}
