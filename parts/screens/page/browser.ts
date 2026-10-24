// The main file of the page code: what every page loads. It reads the page record, loads the module of the screen
// and of what the screen needs, and draws the screen over the first HTML, from then on in the browser.
import type { Drawable } from '../borrowed/react.ts'
import { createElement, ownerStack, useEffect } from '../borrowed/react.ts'
import { createRoot, hydrateRoot } from '../borrowed/reactBrowser.ts'
import { spokenIn } from './address.ts'
import { asksOf } from './asks.ts'
import { filesAt, named } from './based.ts'
import { builtIn } from './builtIn.ts'
import { isTested } from './hooked.ts'
import type { Reach, Swapped } from './reach.ts'
import { livingPage } from './alive.ts'
import { Caught } from './caught.ts'
import { isPart, loaders } from './loaders.ts'
import { partHeld } from './parts.ts'
import { StoreContext } from './context.ts'
import type { PageStore } from './store.ts'
import type { Words } from './spoken.ts'
import { ownWords, wordsIn } from './spoken.ts'

import type { Page, ViewRecord } from './types.ts'
import { drawingOf, Screen, Shown } from './view.tsx'
import { seenOf } from './press.ts'
import { isStored, zoneCookie } from '../../core/internal.ts'
import { zoneIs } from './viewZone.ts'

// The share of the page views that measure what their visitor saw, where the project states none.
const vitalsShare = 0.1

export { livingPage } from './alive.ts'
export { names } from './names.ts'

/** The record that a module of a screen or of a component gives as its default. */
function recordOf(module: unknown): ViewRecord | undefined {
  const given: unknown = isStored(module) ? module.default : undefined
  if (!isStored(given) || typeof given.name !== 'string') return undefined
  return { ...given, name: given.name, kind: given.kind === 'component' ? 'component' : 'screen' }
}

/** What the head of the page tells the page code under a name, where it tells it. */
function told<Name extends 'app' | 'slash'>(name: Name): { [Key in Name]?: string } {
  const said = document.querySelector(`head > meta[name="tent-${name}"]`)?.getAttribute('content')
  if (said === null || said === undefined) return {}
  const made: { [Key in Name]?: string } = {}
  made[name] = said
  return made
}

// The words of the page, once the file of its language is loaded: a document holds one page.
let words: Words = ownWords

/**
 * What a page in a browser reaches its engine through. An exported page names every address under its base, takes
 * a move from the files of its export, and with no engine behind it opens no connection and calls nothing.
 */
function reachOf(page: Page, engine: boolean): Reach {
  const exported = partHeld('exported')
  // The overlay of development is loaded by a page in that mode alone.
  const overlaid = partHeld('overlay')
  const base = filesAt(page)
  const root = page.exported ? (page.base ?? '') : ''
  const under = (address: string): string => named({ base: root }, address)
  const alone = page.exported === true && !engine && exported !== undefined
  const asks = asksOf((address, how) => fetch(under(address), how))
  const made: Reach = {
    post: alone ? async () => exported.noEngine(words) : asks.post,
    async get(address) {
      const file = page.exported ? exported?.exportedFile(root, page.version, address) : undefined
      if (file === undefined) return alone ? undefined : asks.get(address)
      const answer = await fetch(file, { credentials: 'same-origin' })
      return answer.ok ? answer.json() : undefined
    },
    go: (address, replace) => {
      // A page in the inspect mode puts its token back on an address of the app that it loads whole.
      const to = partHeld('inspect')?.on(under(address)) ?? under(address)
      return replace ? window.location.replace(to) : window.location.assign(to)
    },
    shows: () => `${window.location.pathname.slice(root.length) || '/'}${window.location.search}`,
    ...told('app'),
    ...told('slash'),
    address: (written, step) => {
      const next = `${window.location.pathname}${written ? `?${written}` : ''}${window.location.hash}`
      if (step) window.history.pushState(window.history.state, '', next)
      else window.history.replaceState(window.history.state, '', next)
    },
    back: (heard) => window.addEventListener('popstate', heard),
    busy: (on) => {
      const holder = document.querySelector('body > div#tent')
      if (on) holder?.setAttribute('aria-busy', 'true')
      else holder?.removeAttribute('aria-busy')
    },
    now: () => Date.now(),
    online: (heard) => window.addEventListener('online', heard),
    leaving: (holds) =>
      window.addEventListener('beforeunload', (event) => {
        if (holds()) event.preventDefault()
      }),
    // A browser with no word for idle hands the work to the next turn, after the event that asked for it.
    idle: (work) => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(() => work())
      else setTimeout(work, 0)
    },
    goBack: () => window.history.back(),
    // A connection that the browser says saves data fetches nothing ahead.
    saving: () => Object(Reflect.get(navigator, 'connection') ?? {}).saveData === true,
    moved: (address, step) => {
      // The step that is left keeps where the page stood, so that going back puts it there again.
      if (step) window.history.replaceState({ ...Object(window.history.state), tentAt: window.scrollY }, '')
      if (step) window.history.pushState(null, '', under(address))
      else window.history.replaceState(null, '', under(address))
    },
    arrived: (how) => {
      // The screen is drawn before the browser paints next: the page goes there once it stands.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const place = how.place ? document.getElementById(how.place) : null
          if (place) {
            place.scrollIntoView()
            if (!place.hasAttribute('tabindex')) place.setAttribute('tabindex', '-1')
            place.focus({ preventScroll: true })
            window.history.replaceState(window.history.state, '', `#${how.place}`)
            return
          }
          // Going back puts the page where it stood when it was left, once the screen is drawn.
          const at: unknown = Reflect.get(Object(window.history.state), 'tentAt')
          if (how.back && typeof at === 'number') return window.scrollTo(0, at)
          if (how.keep || how.back) return
          window.scrollTo(0, 0)
          // The focus goes to the heading of the new screen, or to the screen itself.
          const heading = document.querySelector('body > div#tent h1') ?? document.querySelector('body > div#tent')
          if (heading instanceof HTMLElement) {
            if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
            heading.focus({ preventScroll: true })
          }
        }),
      )
    },
    cookie: {
      get: (name) => {
        for (const part of document.cookie.split(';')) {
          const at = part.indexOf('=')
          if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim()
        }
        return undefined
      },
      // A year, for a choice that a visitor made: it is kept between visits, and a value that is empty ends it.
      // It is written through the document, which every browser has: the store of cookies is not in all of them.
      set: (name, value) => {
        const safe = window.location.protocol === 'https:' ? '; Secure' : ''
        const written = `${name}=${value}; Path=/; Max-Age=${value ? 31536000 : 0}; SameSite=Lax${safe}`
        Reflect.set(document, 'cookie', written)
      },
    },
    kept: {
      // A browser that keeps nothing for this site, or whose store is full, leaves the state in the page alone.
      get: (key) => {
        try {
          return window.localStorage.getItem(key) ?? undefined
        } catch {
          return undefined
        }
      },
      set: (key, value) => {
        try {
          window.localStorage.setItem(key, value)
        } catch {
          return
        }
      },
    },
    part: (name) => (isPart(name) ? loaders[name]() : Promise.resolve()),
    async messages(file) {
      const held: unknown = Object(
        await import(/* @vite-ignore */ new URL(`${base}${file}`, document.baseURI).href),
      ).default
      return isStored(held) ? wordsIn(held) : {}
    },
    async load(files) {
      const modules: unknown[] = await Promise.all(
        files.map((file) => import(/* @vite-ignore */ new URL(`${base}${file}`, document.baseURI).href)),
      )
      return modules.flatMap((module, place) => {
        const record = recordOf(module)
        return record ? [{ ...record, from: files[place] }] : []
      })
    },
    socket(address, on) {
      // The live connection goes to the address the page came from, over the scheme that fits the page's own.
      const at = new URL(under(address), window.location.href)
      at.protocol = at.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(at)
      socket.addEventListener('open', () => on.opened())
      socket.addEventListener('message', (event) => {
        if (typeof event.data === 'string') on.message(event.data)
      })
      socket.addEventListener('close', () => on.closed())
      return {
        send: (text) => {
          if (socket.readyState === WebSocket.OPEN) socket.send(text)
        },
        close: () => socket.close(),
      }
    },
    styles(files) {
      // The new files are asked for first, and the old ones go only when the page says, once the screen they style is
      // gone, so that no screen is ever shown without its own.
      const held = [...document.querySelectorAll<HTMLLinkElement>('head > link[rel="stylesheet"]')].filter((link) =>
        new URL(link.href, document.baseURI).pathname.startsWith(new URL(base, document.baseURI).pathname),
      )
      const wanted = files.map((file) => new URL(`${base}${file}`, document.baseURI).href)
      const old = held.filter((link) => !wanted.includes(link.href))
      const fresh = wanted.filter((href) => !held.some((link) => link.href === href))
      return Promise.all(
        fresh.map(
          (href) =>
            new Promise<void>((done) => {
              const link = document.createElement('link')
              link.rel = 'stylesheet'
              link.href = href
              link.addEventListener('load', () => done())
              link.addEventListener('error', () => done())
              document.head.append(link)
            }),
        ),
      ).then(() => () => {
        for (const link of old) link.remove()
      })
    },
    ...(overlaid ? { overlay: overlaid.overlayOn(document), marked: overlaid.markOn(document) } : {}),
    seen: asks.seen,
    saw: asks.saw,
    blocked(heard) {
      document.addEventListener('securitypolicyviolation', (event) =>
        heard({ directive: event.effectiveDirective || event.violatedDirective, uri: event.blockedURI }),
      )
    },
  }
  if (!alone) return made
  const { socket: _none, ...left } = made
  return left
}

/**
 * Marks the holder of the drawing once the screen lives in the browser: from then on a press is taken. A tool that
 * drives a page waits for `data-t-alive` on the element with the id `tent`.
 */
function Living(o: { holder: Element; alive: () => void; children?: Drawable }): Drawable {
  const { holder, alive } = o
  useEffect(() => {
    holder.setAttribute('data-t-alive', '')
    alive()
  }, [holder, alive])
  return o.children
}

/**
 * Once the page lives: where the time zone of the browser is not the one the page was drawn in, the page keeps it
 * in its cookie, which holds nothing else, and shows its times in it.
 */
function zoned(store: PageStore, reach: Reach): void {
  const own = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!own || own === store.page.zone) return
  reach.cookie?.set(zoneCookie, encodeURIComponent(own))
  zoneIs(own)
  store.page = { ...store.page, zone: own }
  store.changed()
}

/** Brings the page to life, where this file was loaded by a page of an app. */
async function alive(): Promise<void> {
  // The two are found by their place and their kind, so that no element of a view can stand in for either.
  const holder = document.querySelector('body > div#tent')
  const block = document.querySelector('body > script[type="application/json"]#tent-page')
  if (!holder || !block) return
  const page: Page = JSON.parse(block.textContent ?? '{}')
  // In development the part `refresh` registers the component each view is drawn through as its family: it is told
  // which before the first module of a view runs.
  if (process.env.NODE_ENV !== 'production') globalThis.__tentRefresh?.views(drawingOf)
  // In the inspect mode its part is loaded first, and takes the token out of the address at once.
  if (page.inspect) await loaders.inspect()
  // A screen that is handed `grant` or `ask` presses with the part that sends a press of the engine's own.
  if (page.grant || page.ask) await loaders.posted()
  // The page puts itself where it stood when a step back is drawn: the browser's own guess comes before the drawing.
  window.history.scrollRestoration = 'manual'
  zoneIs(page.zone)
  const base = filesAt(page)
  // An exported page finds out once whether an engine stands behind it.
  if (page.mode === 'development') await loaders.overlay()
  const ofExport = page.exported === true ? await loaders.exported().then(() => partHeld('exported')) : undefined
  const engine = !ofExport || (await ofExport.engineBehind(page.base ?? '', told('app').app))
  // A page that a test drives tells the test what it set off, through the part of the page code for it.
  const tested = page.mode === 'test' && isTested() ? await loaders.tested().then(() => partHeld('tested')) : undefined
  const made = reachOf(page, engine)
  const watched = tested?.watched(made)
  const reach = watched?.reach ?? made
  const records = (await reach.load?.([page.load.screen, ...page.load.parts].filter((file) => file !== ''))) ?? []
  // A page that was sent with a built-in screen holds no module of it. In the mode `development` it comes alive all
  // the same, to hear of the save that mends its screen or adds it.
  const sent = records.some((one) => one.name === page.screen)
  if (!sent && !(page.mode === 'development' && Object.hasOwn(builtIn, page.screen))) return
  // The messages of the language of the page lie in a file of their own, beside the modules of the screens.
  const held = page.load.messages ? ((await reach.messages?.(page.load.messages)) ?? {}) : {}
  words = { ...ownWords, ...held }
  const store = livingPage(page, records, reach, held)
  watched?.told(store)
  // A page that a form with no script drew again puts the address of its screen back, so a reload posts nothing.
  if (page.form) reach.moved?.(spokenIn(page.path, page.language, page.languages), false)
  // The scripts of the head that load later are added by a part, loaded once a page names one.
  const scripted = (): void => {
    if (store.page.scripts?.length) void loaders.scripts().then(() => partHeld('scripts')?.due(store))
  }
  const lives = (): void => {
    zoned(store, reach)
    scripted()
    store.listen(scripted)
    // A page in the inspect mode speaks to its tool from now on, whatever it draws.
    if (store.page.inspect) partHeld('inspect')?.alive(store)
  }
  const shown = (screen: Drawable): Drawable =>
    createElement(StoreContext.Provider, { value: store }, createElement(Living, { holder, alive: lives }, screen))
  // The places of the tags that drew what failed, by what it threw, as React of development tells them as it tells
  // of the failure: the line of a file of the project that used a component of a package that failed. React made
  // small tells none, so the small form of the page code holds nothing of it.
  const owners = new WeakMap<object, string>()
  const caughtBy =
    process.env.NODE_ENV === 'production'
      ? {}
      : {
          onCaughtError: (error: unknown): void => {
            if (typeof error === 'object' && error !== null) owners.set(error, ownerStack())
            console.error(error)
          },
        }
  // In development: React's own runtime of Fast Refresh, which the part `refresh` laid on the page before this file;
  // whether it draws again what a swap took in place; and the record of the page that a failure drew the `error`
  // screen in the place of, which the next good save draws again.
  const refreshing = process.env.NODE_ENV === 'production' ? undefined : globalThis.__tentRefresh
  let swapping = false
  let broken: Page | undefined
  // How many times the page itself mounted the screen anew: a failure after a swap does it.
  let mounted = 0
  let swaps = 0
  // A view that fails in the browser is taken: the `error` screen is loaded only then, and drawn in its place.
  const failed = async (thrown: unknown, given = ''): Promise<void> => {
    const afterSwap = swapping
    // React tells of a failure that a boundary took once the boundary has heard of it.
    await Promise.resolve()
    const drew = (typeof thrown === 'object' && thrown !== null ? owners.get(thrown) : undefined) || given
    // In development the engine is told of it, and shows it on every open page.
    partHeld('overlay')?.thrown(thrown, store.page, drew)
    // A failure while drawing what a swap took in place mounts the screen anew with the new code: what its views
    // kept may not fit that code. Where the screen fails anew too, it is a failure as any other.
    if (afterSwap) {
      mounted += 1
      return root.render(drawnOf(mounted))
    }
    // The record of the screen that is shown now, after the moves and the follows of a new version since the load.
    const now = store.page
    // The project's own `error` screen is loaded only then; the one of the page code is at hand.
    const instead =
      now.load.error === ''
        ? builtIn['tent.error']
        : recordOf(await import(/* @vite-ignore */ new URL(`${base}${now.load.error}`, document.baseURI).href))
    if (!instead) return
    // On live data the error is what any caller sees of a failure, and in the other modes the failure itself.
    const message = thrown instanceof Error ? thrown.message : String(thrown)
    if (now.mode === 'development') broken = now
    store.page = {
      ...now,
      screen: instead.name,
      error: now.mode === 'live' ? seenOf(undefined) : { ...seenOf(undefined), message },
    }
    root.render(shown(createElement(Screen, { record: instead })))
  }
  const drawnOf = (times: number): Drawable =>
    shown(
      createElement(
        Caught,
        { key: String(times), failed: (thrown, owners) => void failed(thrown, owners) },
        createElement(Shown),
      ),
    )
  const drawn = drawnOf(mounted)
  // A screen that was sent with no drawing is drawn here for the first time.
  const root =
    holder.firstChild === null
      ? createRoot(holder, caughtBy)
      : hydrateRoot(holder, drawn, {
          ...caughtBy,
          // Where what is drawn differs from the first HTML, the browser's drawing stands, and development names it.
          onRecoverableError: (error) => {
            if (page.mode === 'development') console.warn('The drawing differs from the first HTML:', error)
          },
        })
  if (holder.firstChild === null) root.render(drawn)
  /** The next good save draws the screen again, where a failure drew the `error` screen in its place. */
  const mended = (): void => {
    if (!broken) return
    const { error: _error, ...shownNow } = store.page
    store.page = { ...shownNow, screen: broken.screen, ...(broken.error ? { error: broken.error } : {}) }
    broken = undefined
    mounted += 1
    root.render(drawnOf(mounted))
  }
  if (page.mode === 'development')
    store.listen(() => {
      if (broken && store.page.version !== broken.version) mended()
    })
  if (refreshing)
    reach.swap = async (modules) => {
      // A module that the page never loaded is none of what it shows: it is not taken.
      const held = modules.filter((one) => refreshing.holds(one.address))
      // A module is asked at its mark, the address every module that imports it names. A save that brings back an
      // earlier text brings back its mark, which the browser ran already and would hand back with nothing registered
      // anew: that one is asked with the number of the swap too, as Vite asks a module with the time of its update.
      swaps += 1
      const addressOf = (one: Swapped): string => {
        const marked = new URL(`${base}${one.address}?v=${one.mark}`, document.baseURI).href
        return refreshing.ran(marked) ? `${marked}&swap=${swaps}` : marked
      }
      try {
        await Promise.all(held.map((one) => import(/* @vite-ignore */ addressOf(one))))
      } catch {
        return false
      }
      if (broken) {
        mended()
        return true
      }
      swapping = true
      try {
        refreshing.refreshed()
      } catch {
        // A failure while drawing is taken by the boundary of the screen, which mounts it anew.
      } finally {
        swapping = false
      }
      return true
    }
  // For a share of the page views the part that measures what the visitor sees is loaded once the browser is idle,
  // so it costs the page nothing at its start.
  const share = page.vitals ?? vitalsShare
  if (!engine || share <= 0 || Math.random() >= share || typeof navigator.sendBeacon !== 'function') return
  reach.idle?.(
    () =>
      void loaders.vitals().then(() =>
        partHeld('vitals')?.measure({
          screen: page.screen,
          version: page.version,
          moves: () => store.moves?.() ?? [],
          send: (body) =>
            navigator.sendBeacon(
              named({ base: page.exported ? (page.base ?? '') : '' }, '/_t/vitals'),
              new Blob([body], { type: 'text/plain' }),
            ),
        }),
      ),
  )
}

if (typeof document !== 'undefined') void alive()
