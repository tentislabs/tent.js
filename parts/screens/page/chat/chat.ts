// The part that speaks to a chat app, which only the form of the page code for one file holds: it brings a screen
// to life in a frame of the chat app, from the answer of the screen's tool that the chat app hands it.
import { isStored, readAddress, stateEntries } from '../../../core/internal.ts'
import { createElement } from '../../borrowed/react.ts'
import { createRoot } from '../../borrowed/reactBrowser.ts'
import { livingPage } from '../alive.ts'
import { StoreContext } from '../context.ts'
import type { Words } from '../spoken.ts'
import { isLeftward, ownWords, textOf, wordsIn } from '../spoken.ts'
import type { PageStore } from '../store.ts'
import type { Page, ViewRecord } from '../types.ts'
import { Shown } from '../view.tsx'
import { bridgeTo } from './bridge.ts'
import { chatReach, wireOf } from './reach.ts'

/** What the build wrote into the file beside the scripts, the screen, its language and the app, and the records of its views. */
interface Held {
  screen: string
  language: string
  app: string
  records: ViewRecord[]
  messages: Record<string, unknown>
}

// The version of the extension of the standard that this part speaks.
const extension = '2026-01-26'

/** What the file holds, and the records that the modules of its views gave. */
function heldIn(): Held | undefined {
  const block = document.querySelector('body > script[type="application/json"]#tent-views')
  const read: unknown = JSON.parse(block?.textContent ?? 'null')
  if (!isStored(read) || typeof read.screen !== 'string') return undefined
  const coded: unknown = Reflect.get(globalThis, '__tentViews')
  const records: ViewRecord[] = (Array.isArray(coded) ? coded : []).filter(
    (one): one is ViewRecord => isStored(one) && typeof one.name === 'string',
  )
  return {
    screen: read.screen,
    language: String(read.language),
    app: String(read.app),
    records,
    messages: isStored(read.messages) ? read.messages : {},
  }
}

/** Whether what a tool answered for the screen is the record of a page. */
const isPage = (value: unknown): value is Page =>
  isStored(value) && typeof value.screen === 'string' && typeof value.version === 'string' && isStored(value.load)

/** Whether the chat app lets the frame connect to the app: a policy that forbids it fails the asking at once. */
async function mayConnect(origin: string): Promise<boolean> {
  try {
    // A policy that forbids it fails at once; an answer that never comes counts as none after a while.
    await fetch(`${origin}/_t/health`, {
      mode: 'no-cors',
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    return true
  } catch {
    return false
  }
}

/** Shows the one line that says the view is out of date, above the screen, once, in the language of the frame. */
function outOfDate(words: Words): void {
  if (document.getElementById('tent-old')) return
  const line = document.createElement('p')
  line.id = 'tent-old'
  line.setAttribute('role', 'status')
  line.textContent = textOf(words, 'tent.chat.outOfDate')
  document.body.prepend(line)
}

async function alive(): Promise<void> {
  const holder = document.querySelector('body > div#tent')
  const held = heldIn()
  if (!holder || !held || window.parent === window) return
  if (isLeftward(held.language)) document.documentElement.setAttribute('dir', 'rtl')
  // The file of each language of the project holds that language's words, over the framework's own.
  const words: Words = { ...ownWords, ...wordsIn(held.messages) }
  const origin = new URL(document.baseURI).origin
  const version = document.querySelector('head > meta[name="tent-version"]')?.getAttribute('content') ?? ''
  const bridge = bridgeTo(window.parent)
  const connected = await mayConnect(origin)
  const record = held.records.find((one) => one.name === held.screen)
  let pass: string | undefined
  let first: Page | undefined
  let store: PageStore | undefined
  // How often the page asks its tool again where it cannot connect, and how long a pass is good for.
  let every = 30_000
  let life = 600_000
  /** Takes an answer of the screen's tool: its pass, how often to ask again, and its page under the app's address. */
  const taken = (result: unknown): unknown => {
    const wire = wireOf(result)
    const meta: Record<string, unknown> = isStored(result) && isStored(result._meta) ? result._meta : {}
    const page = meta['tent.page']
    if (!isStored(wire) || wire.ok !== true || !isPage(page)) return wire
    if (typeof meta['tent.pass'] === 'string') pass = meta['tent.pass']
    const frame = isStored(meta['tent.frame']) ? meta['tent.frame'] : {}
    if (typeof frame.ask === 'number' && frame.ask > 0) every = frame.ask
    if (typeof frame.life === 'number' && frame.life > 0) life = frame.life
    const made: Page = { ...page, base: origin, ...(pass === undefined ? {} : { pass }) }
    // An answer of another version is drawn by the views that this file holds, under the line that says so.
    if (made.version !== version) {
      outOfDate(words)
      if (first) made.load = first.load
    }
    return { ok: true, value: made }
  }
  const reach = chatReach({
    bridge,
    words,
    origin,
    connected,
    pass: () => pass,
    path: () => first?.path ?? '/',
    input(address) {
      const search = new URLSearchParams(address.split('?')[1]?.split('#')[0] ?? '')
      const entries = { ...stateEntries(record?.shared), ...stateEntries(record?.state) }
      return { ...first?.params, ...readAddress(entries, search) }
    },
    screen: async (input) => taken(await bridge.request('tools/call', { name: held.screen, arguments: input })),
    worked: () => again(),
  })
  /** Asks the screen's tool again, as a move to the address that the frame shows. */
  const again = (): void => store?.goTo(reach.shows?.() ?? first?.path ?? '/', { replace: true, keep: true })
  bridge.heard('ui/notifications/tool-result', (params) => {
    if (store) return
    const wire = taken(params)
    if (!isStored(wire) || wire.ok !== true || !isPage(wire.value)) {
      holder.textContent = textOf(words, 'tent.chat.notShown')
      return
    }
    first = wire.value
    store = livingPage(first, held.records, reach, wordsIn(held.messages))
    createRoot(holder).render(createElement(StoreContext.Provider, { value: store }, createElement(Shown)))
    holder.setAttribute('data-t-alive', '')
    // A frame that cannot connect asks again every so often; one that can, before its pass ends.
    setInterval(again, connected ? Math.max(1000, life - 60_000) : every)
  })
  try {
    await bridge.request('ui/initialize', {
      protocolVersion: extension,
      appInfo: { name: held.app, version },
      appCapabilities: {},
    })
  } catch {
    // A chat app that does not answer the opening leaves no empty frame: the frame says it could not be shown.
    holder.textContent = textOf(words, 'tent.chat.notShown')
    return
  }
  bridge.notify('ui/notifications/initialized', {})
  // The chat app is told the size of the view, so that its frame fits it.
  new ResizeObserver(() =>
    bridge.notify('ui/notifications/size-changed', {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }),
  ).observe(document.documentElement)
}

if (typeof document !== 'undefined') void alive()
