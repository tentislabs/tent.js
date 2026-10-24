import type { PageStore } from '../store.ts'

// The name of the address that carries a token of the inspect mode.
const named = 't-inspect'

// The token of the page, which it took out of its address and keeps alone.
let held: string | undefined

/**
 * Takes the token of the inspect mode out of the address of the page, at once, so that it stands in no address
 * the page shows and in nothing the browser tells another site. Answers it, or nothing where the address holds none.
 */
export function tokenTaken(): string | undefined {
  const at = new URL(window.location.href)
  const token = at.searchParams.get(named)
  if (token === null) return held
  at.searchParams.delete(named)
  window.history.replaceState(window.history.state, '', `${at.pathname}${at.search}${at.hash}`)
  held = token
  return token
}

/**
 * Takes an address of the app that the page loads whole. Answers it with the token as a name of its own, so that
 * the page it loads is in the mode too. An address of another site, and one under `/_t/`, is answered as it is.
 */
export function tokenOn(address: string): string {
  if (held === undefined) return address
  const at = new URL(address, window.location.href)
  if (at.origin !== window.location.origin || at.pathname.startsWith('/_t/')) return address
  at.searchParams.set(named, held)
  return `${at.pathname}${at.search}${at.hash}`
}

/** The token that the page took from its address, where it took one. */
export const tokenHeld = (): string | undefined => held

/** The hidden field of a form that is sent with no script, which carries the token to the page the form leads to. */
export function hiddenToken(store: PageStore): [string, string][] {
  const token = store.inspectToken ?? (typeof window === 'undefined' ? undefined : held)
  return store.page.inspect && token !== undefined ? [[named, token]] : []
}
