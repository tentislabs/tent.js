import { holdPart } from '../parts.ts'
import type { PageStore } from '../store.ts'
import type { LaterScript } from '../types.ts'

// The scripts this visit has added, by their address: a move to a screen that names one again adds it no second time.
const added = new Set<string>()

/** Adds one script to the head of the document, as its line of `head` writes it, with the nonce of the page. */
function put(script: LaterScript, nonce: string | undefined): void {
  const element = document.createElement('script')
  element.src = script.src
  if (script.async) element.async = true
  if (script.defer) element.defer = true
  if (script.type !== undefined) element.type = script.type
  if (nonce !== undefined) element.nonce = nonce
  document.head.append(element)
}

/** Runs some work when the browser is next idle, or two seconds later where it tells no such moment. */
function whenIdle(work: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => work())
  else setTimeout(work, 2000)
}

/**
 * Takes the page once it has come alive, and each time it changes: a move, or a state that a consent names. Adds
 * each script that the page record names and that is due: one of `'alive'` now, one of `'idle'` when the browser is
 * next idle, and one that names a consent only once that state is true. Each is added once for the visit.
 */
export function scriptsDue(store: PageStore): void {
  for (const script of store.page.scripts ?? []) {
    if (added.has(script.src)) continue
    if (script.consent !== undefined && store.state[script.consent] !== true) continue
    added.add(script.src)
    if (script.load === 'idle') whenIdle(() => put(script, store.page.nonce))
    else put(script, store.page.nonce)
  }
}

holdPart('scripts', { due: scriptsDue })
