import { holdPart } from '../parts.ts'
import type { PageStore } from '../store.ts'
import type { LaterScript } from '../types.ts'

// The scripts this visit has added, by their address: a move to a screen that names one again adds it no second time.
const added = new Set<string>()

// The scripts of `'alive'` that are loading: a script added to a document runs as soon as it has loaded, so one of
// `'idle'` waits for them, or it could run before a script that was asked for earlier.
const loading = new Set<Promise<void>>()

// The longest a script of `'idle'` waits for those of `'alive'`: a request that never answers holds it no longer.
const aliveWait = 10_000

/**
 * Whether the browser runs a script of a type: none, a module, or a type of JavaScript. One of any other type, as
 * `text/partytown`, is fetched by nobody and tells of no end, by the HTML standard.
 */
const runs = (type: string | undefined): boolean =>
  type === undefined ||
  type.trim() === '' ||
  type.trim().toLowerCase() === 'module' ||
  /^(text|application)\/(x-)?(javascript|ecmascript)$/i.test(type.trim())

/**
 * Adds one script to the head of the document, as its line of `head` writes it, with the nonce of the page. Answers
 * once it has loaded or failed, and at once for one the browser does not run.
 */
function put(script: LaterScript, nonce: string | undefined): Promise<void> {
  const element = document.createElement('script')
  element.src = script.src
  if (script.async) element.async = true
  if (script.defer) element.defer = true
  if (script.type !== undefined) element.type = script.type
  if (nonce !== undefined) element.nonce = nonce
  const ended = runs(script.type)
    ? new Promise<void>((done) => {
        element.addEventListener('load', () => done())
        element.addEventListener('error', () => done())
      })
    : Promise.resolve()
  document.head.append(element)
  return ended
}

/** Runs some work when the browser is next idle, or two seconds later where it tells no such moment. */
function whenIdle(work: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => work())
  else setTimeout(work, 2000)
}

/**
 * Takes the page once it has come alive, and each time it changes: a move, or a state that a consent names. Adds
 * each script that the page record names and that is due: one of `'alive'` now, one of `'idle'` when the scripts of
 * `'alive'` have loaded and the browser is next idle, and one that names a consent only once that state is true.
 * Each is added once for the visit.
 */
export function scriptsDue(store: PageStore): void {
  const due = (store.page.scripts ?? []).filter(
    (script) => !added.has(script.src) && (script.consent === undefined || store.state[script.consent] === true),
  )
  for (const script of due) added.add(script.src)
  for (const script of due.filter((one) => one.load !== 'idle')) {
    const ended = put(script, store.page.nonce)
    loading.add(ended)
    void ended.then(() => loading.delete(ended))
  }
  const later = due.filter((one) => one.load === 'idle')
  if (later.length)
    void Promise.race([Promise.all([...loading]), new Promise((done) => setTimeout(done, aliveWait))]).then(() =>
      whenIdle(() => {
        for (const script of later) void put(script, store.page.nonce)
      }),
    )
}

holdPart('scripts', { due: scriptsDue })
