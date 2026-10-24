import { isStored, sameValue } from '../../core/internal.ts'
import { screenStub } from './address.ts'
import type { PageStore } from './store.ts'

/**
 * Takes the address a link goes to, without the code of a language, what it was written with - where it goes, the
 * values of `with`, and `exact` - the page, and the state of the view it stands in. Answers whether what is shown is
 * where it goes: the same address, with every value that its `with` gives of the state kept in the address equal to
 * the one that is shown, or an address that lies under its own, unless it says `exact`. Nothing but `/` lies under `/`.
 */
export function isCurrent(
  href: string,
  written: { to: unknown; with?: unknown; exact?: unknown },
  store: PageStore,
  state: Record<string, unknown>,
): boolean {
  if (href.startsWith('#')) return false
  const [path, after = ''] = href.split('#')[0].split('?')
  const shown = store.page.path
  if (path !== shown) return written.exact !== true && path !== '/' && shown.startsWith(`${path}/`)
  // A value that equals its default is left out of an address: so the values are held, and not their texts.
  const given = isStored(written.with) ? written.with : {}
  // The stub of the screen it goes to names the states that it keeps in its address.
  const kept = screenStub(written.to, store.stub)?.state ?? []
  for (const name of kept)
    if (typeof name === 'string' && Object.hasOwn(given, name) && !sameValue(given[name], state[name])) return false
  // A path that is written as text holds its state after the question mark, as text.
  for (const [name, value] of new URLSearchParams(typeof written.to === 'string' ? after : ''))
    if (String(state[name] ?? '') !== value) return false
  return true
}
