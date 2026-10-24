import { workedOut } from './worked.ts'
import { moving } from './moving.ts'
import { isPath, isStored } from '../../core/internal.ts'
import { builtIn } from './builtIn.ts'
import type { Line } from './live.ts'
import { lineOf } from './live.ts'
import { isOutside, loadedWhole, slashedIn, spokenIn } from './address.ts'
import { prefetchOf } from './prefetch.ts'
import { filesAt } from './based.ts'
import type { Words } from './spoken.ts'
import { wordsOf } from './spoken.ts'
import { keptInBrowser, readFromAddress, searchFor, setKept, wroteUnder } from './kept.ts'
import { seenOf } from './press.ts'
import type { Overlay, Reach, Swapped } from './reach.ts'
import { rowsPut } from './rowsPut.ts'
import { startingState } from './state.ts'
import type { CallState } from '../handed.ts'
import type { OptimisticResult, Side, PageStore } from './store.ts'
import { followedRuns } from './followed.ts'
import { askingOf } from './store.ts'
import type { Answered, Page, ViewRecord } from './types.ts'
import { unlockFor } from './unlock.ts'
import { moveHeaders } from './traced.ts'
import { callQueue } from './heldCalls.ts'

// The tests of the page hand a reach in, and name its type from here.
export type { Reach } from './reach.ts'

// The times of a living page, in milliseconds: how long an optimistic result is kept after its call was answered, how often a
// page with no connection asks its live queries again, and the least it waits before it watches again.
const optimisticKept = 2000
// How long a call is held for want of a connection, in milliseconds, where the project states no other.
const callHold = 120_000

// The letters of the id that a page makes for each of its calls.
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
// How long a move may take before the loading component of the old screen stands in its place.
const loadingAfter = 200
const askEvery = 30_000
const watchAgain = 500
const watchSpread = 1000

/** How an asking is told to the engine and kept with its answer. */
type Told = Pick<Answered, 'entry' | 'of' | 'needed'>

/** One live query that the page shows: the page's own name for its watch, and what it watches. */
interface Watch {
  id: string
  key: string
  what: string
  input: unknown
  told: Told
  // The engine said that the watch failed: it is over, and is sent again only where the view asks once more.
  over?: true
}

/** An optimistic result that is shown: what it changes, the input of its call, and the askings that an answer has settled since. */
interface ShownResult extends OptimisticResult {
  input: unknown
  answered: boolean
  over: Set<string>
  // Worked out of a plain change's plan: it is shown over the answers of live queries alone.
  worked?: true
}

/**
 * Takes the record of a page, the records of the screen and of the components that it loaded, and what it reaches
 * the engine through. Answers the page as it lives in a browser: it starts with the answers it came with, watches
 * each live query that it shows over one connection to `/_t/live`, asks what is not live at `/_t/read/`, calls at
 * `/_t/call/`, and asks for its screen again where the engine says that its caller or its right has changed.
 * `words` are those of the language of the page, as the file of its language holds them.
 */
export function livingPage(first: Page, records: ViewRecord[], reach: Reach, words: Words = {}): PageStore {
  let page = first
  // The words the page shows: those of its language file, over the framework's own.
  const spokenOf = (held: Words): Words => wordsOf({ [first.language]: held }, first.language, [first.language])
  // One record for as long as the page lives, which a new file of its language fills anew.
  const spoken: Words = spokenOf(words)
  // The nonce of the document holds for as long as the page lives: a record of another screen is no document.
  const ofDocument = (next: Page): Page => (first.nonce === undefined ? next : { ...next, nonce: first.nonce })
  const answers = new Map<string, Answered>()
  const views = new Map<string, ViewRecord>()
  const stubs = new Map<string, ViewRecord['stubs']>()
  const loaded = new Set<string>([first.load.screen, ...first.load.parts])
  // The record of the screen that the page shows: a move puts the next screen's in its place.
  let declared = records.find((one) => one.kind === 'screen' && one.name === first.screen)
  // The askings that read an action, as their views told.
  const actions = new Set<string>()
  const heard = new Set<() => void>()
  // A form that was sent with no script and failed is read in its view as `calls.<id>` until it is sent again.
  const calls: Record<string, CallState> = first.form
    ? { [first.form.id]: { busy: false, error: first.form.error } }
    : {}
  const shown = new Map<string, Answered>()
  const asking = new Set<string>()
  // The timer of each action that states `refresh`, by its asking, with what stops it.
  const timed = new Map<string, () => void>()
  const watches = new Map<string, Watch>()
  const byId = new Map<string, Watch>()
  const seen = new Set<string>()
  // Every asking that was ever watched: after a call it is read again only while no connection stands.
  const lively = new Set<string>()
  let results: ShownResult[] = []
  // How many times the views started anew: the screen is drawn under this number, so a view that keeps what it
  // keeps in React through a swap of Fast Refresh starts anew where the page follows another version.
  let anew = 0
  let ids = 0
  let turn = 0
  let line: Line | undefined
  let poll: (() => void) | undefined
  // An opening failed or the connection was lost, and none stands since.
  let cut = false
  const every =
    reach.every ??
    ((work: () => void, ms: number): (() => void) => {
      const timer = setInterval(work, ms)
      return () => clearInterval(timer)
    })
  const wait =
    reach.wait ??
    ((work: () => void, ms: number): (() => void) => {
      const timer = setTimeout(work, ms)
      return () => clearTimeout(timer)
    })
  const random = reach.random ?? Math.random
  // Each call carries an id the page made, 22 random characters, so a call that is sent again runs once.
  const callId = (): string => {
    const drawn = new Uint8Array(22)
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(drawn)
    else for (let n = 0; n < drawn.length; n++) drawn[n] = Math.floor(random() * 256)
    return [...drawn].map((byte) => letters[byte % letters.length]).join('')
  }
  // The calls the page holds while it has no connection, sent in their order once it is back.
  const queue = callQueue({
    now: () => reach.now?.() ?? Date.now(),
    wait,
    hold: first.callHold ?? callHold,
    ...(reach.online ? { online: reach.online } : {}),
  })
  // A page closed with calls held asks the browser to warn first: what it holds is lost with it.
  reach.leaving?.(queue.holds)
  const shows = (): string => reach.shows?.() ?? page.path

  // The address of each asset that a view of the page names by a name written in place, by the name of the asset.
  const assets = new Map<string, string>()
  // The width and the height of each of those assets that is a picture.
  const sizes = new Map<string, { width: number; height: number }>()
  // The forms that the page drew, counted in the order they were first drawn.
  let forms = 0
  // The hosts that the project lists, as a view that draws pictures from a text tells them.
  const hosts = new Set<string>()
  // The parts of the page code that a view asked for and the page did not hold: each is loaded once.
  const wanted = new Set<string>()
  // The record that each file of the bundle gave, by the file: a module of development is held under its mark.
  const fromFile = new Map<string, ViewRecord>()
  const keep = (found: ViewRecord[]): void => {
    for (const record of found) {
      if (record.from !== undefined) fromFile.set(record.from, record)
      for (const [name, file] of Object.entries(record.assets ?? {})) assets.set(name, `${filesAt(first)}${file}`)
      for (const [name, size] of Object.entries(record.sizes ?? {})) sizes.set(name, size)
      for (const host of record.hosts ?? []) hosts.add(host)
      views.set(record.name, record)
      stubs.set(record.name, record.stubs)
    }
  }
  const take = (given: Page): void => {
    for (const one of given.answers) answers.set(askingOf(one.what, one.input), one)
  }
  keep(records)
  take(first)

  const changed = (): void => {
    turn += 1
    for (const one of heard) one()
  }
  // Every call and every read names the version of the page, and the user that the page was drawn for.
  const sent = (input: unknown): object => ({
    input,
    version: page.version,
    ...(page.user ? { as: page.user.id } : {}),
  })
  const answered = async (
    address: string,
    input: unknown,
    again = false,
    headers?: Record<string, string>,
  ): Promise<unknown> => {
    const wire = await reach.post(address, sent(input), headers)
    // A call that changed who is calling leaves no answer of the page true, whether it worked or failed: so does
    // one that the door did not run, since the caller is no longer the user of the page.
    if (isStored(wire) && wire.caller === 'changed') callerChanged()
    if (isStored(wire) && wire.ok === true) return wire.value
    const error = isStored(wire) && isStored(wire.error) ? wire.error : undefined
    if (error?.code === 'T0007') {
      // The version of the page is gone: the page follows the one that runs, and sends the call once more. Only
      // where that fails for its version too does it load its address anew.
      if (again) reach.go(shows())
      else if (typeof error.running === 'string' && reach.get) {
        // The page may follow that version already, as a save in development tells it while the call is on its way.
        if (error.running !== page.version) await follow(error.running)
        if (page.version === error.running) return answered(address, input, true, headers)
      }
    }
    throw error ?? new Error('The engine did not answer in the wire form.')
  }

  /** An answer of a query arrived after the call of a result was answered: the result is over for that asking. */
  const settled = (what: string, key: string): void => {
    for (const result of results) if (result.what === what && result.answered) result.over.add(key)
  }

  /** Reads an asking through the door. A read that only looks again keeps what the page holds where it fails. */
  const read = (what: string, input: unknown, key: string, told: Told, looking = false): void => {
    if (asking.has(key)) return
    asking.add(key)
    answered(`/_t/read/${what}`, input)
      .then(
        (value): Answered | undefined => ({ what, input, ...told, value }),
        (error): Answered | undefined => (looking ? undefined : { what, input, ...told, error }),
      )
      .then((one) => {
        asking.delete(key)
        if (!one) return
        // Of two askings the answer of the later one stands, and an asking stands until its answer is there.
        answers.set(key, one)
        settled(what, key)
        changed()
      })
  }

  /** The message that watches a query: with the mark of the answer the page holds, where it holds one. */
  const watchOf = (watch: Watch, marked = true): object => {
    const have = marked ? answers.get(watch.key)?.mark : undefined
    const { id, what, input } = watch
    const seen = reach.seen?.()
    const holds = { ...(have === undefined ? {} : { have }), ...(seen === undefined ? {} : { seen }) }
    return { t: 'watch', id, query: what, input, version: page.version, ...holds }
  }

  /** The watches that stand: each but those that the engine said are over. */
  const standing = (): Watch[] => [...watches.values()].filter((watch) => !watch.over)

  /** Asks every live query again through the door, while no connection brings what changes. */
  const lookAgain = (): void => {
    for (const watch of standing()) read(watch.what, watch.input, watch.key, watch.told, true)
  }

  /** Takes a watch away: the page shows its query no more. */
  const unwatch = (watch: Watch): void => {
    watches.delete(watch.key)
    byId.delete(watch.id)
    if (!watch.over) line?.send({ t: 'unwatch', id: watch.id })
  }

  /** Stops the timer of an action that states `refresh`: the page shows its answer no more. */
  const untime = (key: string): void => {
    timed.get(key)?.()
    timed.delete(key)
  }

  /** Forgets every answer, every watch and every timer of the page. */
  const forget = (): void => {
    for (const watch of [...watches.values()]) unwatch(watch)
    for (const key of [...timed.keys()]) untime(key)
    answers.clear()
    shown.clear()
    seen.clear()
  }

  /** Takes the record of a page in the place of the one the page holds, with the modules it does not hold yet. */
  const adopt = async (next: Page, moved?: () => void): Promise<void> => {
    const files = [next.load.screen, ...next.load.parts].filter((file) => file !== '' && !loaded.has(file))
    // The record of each module that the page holds already stands again: a save may bring back the text, and so the
    // mark, of a module that the page showed before another.
    keep([next.load.screen, ...next.load.parts].flatMap((file) => fromFile.get(file) ?? []))
    if (files.length) {
      // A page that cannot load a module by itself loads its address anew, and so does one whose file is no
      // longer kept: the version it was told of was left meanwhile.
      const got = await reach.load?.(files).catch(() => undefined)
      if (!got) return reach.go(shows())
      keep(got)
      for (const file of files) loaded.add(file)
    }
    // A new version of the file of the page's language is loaded before the screen is drawn with its words.
    const messages = next.load.messages
    if (messages && messages !== page.load.messages) {
      const got = await reach.messages?.(messages).catch(() => undefined)
      if (!got) return reach.go(shows())
      for (const key of Object.keys(spoken)) delete spoken[key]
      Object.assign(spoken, spokenOf(got))
    }
    // A record that names another user than the page was drawn for counts as a changed caller.
    if (next.user?.id !== page.user?.id) line?.close()
    // The style files of another screen, or of another version, are added, and the screen is drawn once they stand:
    // a library's stylesheet is in the page before what it styles. Those of the screen before leave once it is drawn,
    // as until then the screen before is shown, and its stage would fall in without them.
    const restyled = next.load.styles.join(' ') !== page.load.styles.join(' ')
    const drop = restyled ? await reach.styles?.(next.load.styles) : undefined
    forget()
    // Where the page follows another version by asking for its screen again, its views start anew.
    if (next.version !== page.version) anew += 1
    page = ofDocument(next)
    take(next)
    if (moved) {
      // The mark of what a swap kept leaves at a move.
      reach.marked?.(undefined)
      // Another screen starts with its own state: what it declares, what the address and the device hold over
      // it, and what the browser kept. The state of the screen before is gone with that screen.
      declared = views.get(next.screen)
      for (const name of Object.keys(state)) delete state[name]
      Object.assign(state, declared ? startingState(declared) : {}, next.state, keptInBrowser(declared, next, reach))
      kept = undefined
      // The address changes once the files of the screen are there, and before the screen is drawn.
      moved()
      // The next screen is shown through the browser's own transition between views, where the page plays one.
      return moving(changed, drop)
    }
    changed()
    if (drop) setTimeout(drop, 0)
  }

  /**
   * Goes to another address of the app with no load of the document: the screen is asked for in one request,
   * the files that the page does not hold are loaded, and the screen is shown. An answer that sends the visitor on
   * is followed. What the page cannot show this way is loaded whole: an address that the engine leaves the app
   * for, one that it cannot answer, and a screen whose rule for frames is another than the one the document
   * was loaded under, so that the rule always comes from the engine.
   */
  const move = async (
    address: string,
    how: {
      step: 'push' | 'replace' | 'none'
      keep?: boolean
      back?: boolean
      above?: boolean
      side?: Side
      from?: Element
    },
    sentOn = 0,
  ): Promise<void> => {
    const mark = address.indexOf('#')
    const started = performance.now()
    const [path, place] = mark < 0 ? [address, ''] : [address.slice(0, mark), address.slice(mark + 1)]
    const there = {
      ...(place ? { place } : {}),
      ...(how.keep ? { keep: true } : {}),
      ...(how.back ? { back: true } : {}),
    }
    // A place on the screen that is shown asks for nothing.
    if (path === '') return reach.arrived?.(there)
    const whole = (): void => (how.step === 'replace' ? reach.go(address, true) : reach.go(address))
    if (!reach.get || !reach.moved) return whole()
    const asked = reach.get
    // A move that takes long shows the loading component of the old screen in its place, after a while.
    const named = views.get(page.screen)?.loading
    const shows = typeof named === 'string' ? views.get(named) : undefined
    // With no loading component the old screen stays, and a screen reader is told that it is busy.
    let marked = false
    const slow = wait(() => {
      waitingFor = shows
      if (!shows && reach.busy) {
        marked = true
        reach.busy(true)
      }
      changed()
    }, page.loadingAfter ?? loadingAfter)
    let wire: unknown
    try {
      // What was prefetched is taken, unless its screen reads an action, which is asked for once more now.
      const early = await prefetched.take(path)
      const fresh =
        isStored(early) &&
        early.ok === true &&
        isPage(early.value) &&
        !early.value.answers.some((one) => one.left === 'prefetch')
      const over = how.above ? '&above=1' : ''
      wire =
        fresh && !how.above
          ? early
          : await asked(
              `/_t/screen?path=${encodeURIComponent(path)}&version=${encodeURIComponent(page.version)}${over}`,
            )
    } catch {
      wire = undefined
    } finally {
      slow()
      if (marked) reach.busy?.(false)
    }
    if (waitingFor) {
      waitingFor = undefined
      changed()
    }
    const value: unknown = isStored(wire) && wire.ok === true ? wire.value : undefined
    if (!isStored(value)) return whole()
    if (typeof value.goTo === 'string') return sentOn < 3 ? move(value.goTo, how, sentOn + 1) : reach.go(value.goTo)
    if (typeof value.leave === 'string') return reach.go(value.leave)
    // A screen in another language is a page of other words: it is loaded whole, with the file of its language.
    if (
      !isPage(value) ||
      JSON.stringify(value.framedBy) !== JSON.stringify(first.framedBy) ||
      value.language !== first.language
    )
      return whole()
    const shown = reach.moved
    if (how.above) {
      // The screen above lies over the one that is shown, which stays as it is, alive and still fed.
      const files = [value.load.screen, ...value.load.parts].filter((file) => file !== '' && !loaded.has(file))
      if (files.length) {
        const got = await reach.load?.(files).catch(() => undefined)
        if (!got) return whole()
        keep(got)
        for (const file of files) loaded.add(file)
      }
      take(value)
      const record = views.get(value.screen)
      upper = {
        page: value,
        state: { ...(record ? startingState(record) : {}), ...value.state },
        ...(how.from ? { from: how.from } : {}),
        ...(how.side ? { side: how.side } : {}),
      }
      shown(address, true)
      changed()
      return reach.arrived?.({ ...there, keep: true })
    }
    upper = undefined
    await adopt(value, () => {
      if (how.step !== 'none') shown(address, how.step === 'push')
    })
    reach.arrived?.(there)
    // The time of the move, from its start to the new screen shown, for the part that measures what a visitor sees.
    if (moves.length < 50) moves.push({ screen: value.screen, ms: performance.now() - started })
  }

  // The moves that the page made, each with the screen it went to and how long it took.
  const moves: { screen: string; ms: number }[] = []
  // The component that stands in the place of the screen while a move takes long.
  let waitingFor: ViewRecord | undefined
  // The screen that is opened above the one that is shown, with its own state.
  let upper: { page: Page; state: Record<string, unknown>; from?: Element; side?: Side } | undefined
  // What a page prefetched for a move: the files of its screen are loaded too, as soon as its answer is there.
  const prefetched = prefetchOf(
    reach,
    () => page,
    (wire) => {
      const value: unknown = isStored(wire) && wire.ok === true ? wire.value : undefined
      if (!isPage(value)) return
      const files = [value.load.screen, ...value.load.parts].filter((file) => file !== '' && !loaded.has(file))
      if (!files.length || !reach.load) return
      // A file counts as held once it is: a move that comes first loads it itself, and the browser fetches it once.
      reach.load(files).then(
        (got) => {
          keep(got)
          for (const file of files) loaded.add(file)
        },
        () => undefined,
      )
    },
  )

  /**
   * Asks for the screen that the page shows again, under its own version or under another one that runs now, and
   * shows what the engine gives: a record, or an address to go to.
   */
  const screenAgain = async (version = page.version, again = false): Promise<void> => {
    if (!reach.get) return reach.go(shows())
    const address = `/_t/screen?path=${encodeURIComponent(shows())}&version=${encodeURIComponent(version)}`
    let wire: unknown
    try {
      wire = await reach.get(address)
    } catch {
      wire = undefined
    }
    const value: unknown = isStored(wire) && wire.ok === true ? wire.value : undefined
    // A version that was left while the page asked for it, as after two saves close together: the page follows the
    // one that runs, once.
    const gone = isStored(wire) && isStored(wire.error) && wire.error.code === 'T0007' ? wire.error.running : undefined
    if (!again && typeof gone === 'string' && gone !== version) return screenAgain(gone, true)
    if (!isStored(value)) return reach.go(shows())
    if (typeof value.goTo === 'string') return reach.go(value.goTo)
    if (typeof value.leave === 'string') return reach.go(value.leave)
    if (isPage(value)) return adopt(value)
    return reach.go(shows())
  }

  // The page follows one version at a time, and the newest version told meanwhile once that ends, so none is lost:
  // the swaps of saves close together are taken as one, and any other follows the newest by asking for the screen.
  let following: Promise<void> | undefined
  let latest: { version: string; swap: Swapped[] | undefined } | undefined

  /** The newest version told that the page follows now, which then waits no more. */
  const taken = (): typeof latest => {
    const next = latest
    latest = undefined
    return next
  }

  /**
   * Follows the version that runs now. With the modules of a swap of development it takes them in place; with none,
   * the screen is asked for again under it, the files that the page does not hold are loaded, and the screen is drawn
   * again. Its declared state, its address and its place in the page stay. Answers once the page follows the newest
   * version it was told meanwhile.
   */
  function follow(version: string, swap?: Swapped[]): Promise<void> {
    // A swap names the modules that changed since the version before it: two of them together name what both changed.
    const held = latest?.swap?.filter((one) => !swap?.some((next) => next.address === one.address)) ?? []
    latest = { version, swap: latest && !latest.swap ? undefined : swap && [...held, ...swap] }
    following ??= (async () => {
      // A swap builds on the version before it: once the page asked for its screen again, it asks again.
      let asked = false
      for (let next = taken(); next; next = taken()) {
        if (next.version === page.version) continue
        if (next.swap && !asked) await swapIn(next.version, next.swap)
        else {
          asked = true
          await screenAgain(next.version)
        }
      }
    })().finally(() => {
      following = undefined
    })
    return following
  }

  /**
   * Takes in place, by React's Fast Refresh, the modules that the swap of a save of the look alone names: the page
   * takes the new version, swaps the style files that the swap names, and has what the modules changed drawn again in
   * place. It asks for no screen, sends no watch again and asks no entry again: the engine moved its watches to the
   * version. Then it shows the mark that what the views keep stayed. Where a module is no longer kept, the page loads
   * its address anew, as it does for any file of the bundle.
   */
  const swapIn = async (version: string, swap: Swapped[]): Promise<void> => {
    const styles = page.load.styles.map((file) => {
      const one = swap.find((entry) => entry.address === file.split('?')[0])
      return one ? `${one.address}?v=${one.mark}` : file
    })
    const restyled = styles.join(' ') !== page.load.styles.join(' ')
    page = { ...page, version, load: { ...page.load, styles } }
    // The views are drawn again in place, so the style files they had leave as soon as the new ones stand.
    if (restyled) (await reach.styles?.(styles))?.()
    // A module that the page asks for and that is no longer kept has the page load its address anew, as any file.
    if (!(await reach.swap?.(swap.filter((one) => one.address.endsWith('.js'))))) return reach.go(shows())
    // Its reset mounts the screen that is shown anew; the mark itself leaves at the next move or load.
    reach.marked?.(() => {
      anew += 1
      changed()
    })
  }

  // What the overlay of a page in development shows, which stands until the engine or the page says otherwise.
  let found: unknown[] = []
  const stopped: Overlay['blocked'] = []
  const overlaid = (): void => reach.overlay?.({ findings: found, blocked: [...stopped] })

  /** The caller is no longer the one the page was drawn for: the connection is closed, and nothing the page holds is true. */
  function callerChanged(): void {
    line?.close()
    forget()
    // A page that cannot ask for its screen again asks for its address anew.
    if (reach.get) void screenAgain()
    else reach.go(page.path)
  }

  /** Takes one message of the engine. */
  const message = (told: Record<string, unknown>): void => {
    if (told.t === 'alive') return void line?.send({ t: 'alive' })
    if (told.t === 'reload') return void reach.go(shows())
    if (told.t === 'changed') return void callerChanged()
    if (told.t === 'version') {
      if (typeof told.version !== 'string' || told.version === page.version) return
      // A save of the look alone names the modules to take in place, which the page of development alone does.
      const swap =
        process.env.NODE_ENV !== 'production' && reach.swap && Array.isArray(told.swap)
          ? told.swap.filter(isSwapped)
          : undefined
      return void follow(told.version, swap)
    }
    if (told.t === 'findings') {
      found = Array.isArray(told.findings) ? told.findings : []
      return void overlaid()
    }
    // A message of a run that the page follows belongs to that run.
    if (followed.told(told)) return
    // The write that a message stands at is kept: what the page asks next names the latest it has seen.
    if (typeof told.at === 'string') reach.saw?.(told.at)
    const watch = typeof told.id === 'string' ? byId.get(told.id) : undefined
    if (!watch) return
    const { key, what, input } = watch
    if (told.t === 'result') {
      const mark = typeof told.mark === 'string' ? { mark: told.mark } : {}
      answers.set(key, { what, input, ...watch.told, ...('value' in told ? { value: told.value } : {}), ...mark })
    } else if (told.t === 'rows') {
      const held = answers.get(key)
      const put = held !== undefined && held.mark === told.was ? rowsPut(held.value, told) : undefined
      // A page that holds another answer than the message builds on watches again, and is answered whole.
      if (!held || !put || typeof told.mark !== 'string') return void line?.send(watchOf(watch, false))
      answers.set(key, { ...held, value: put.value, mark: told.mark })
    } else if (told.t === 'failed') {
      const error = isStored(told.error) ? told.error : {}
      // One watch or one group too many: the page waits, watches again, and asks for nothing else.
      if (error.code === 'T0005')
        return void wait(
          () => {
            if (byId.get(watch.id) === watch) line?.send(watchOf(watch))
          },
          watchAgain + random() * watchSpread,
        )
      // The watch is over: it is sent again only where its view asks once more. Of an entry of the screen itself
      // the page asks for its screen again.
      watch.over = true
      byId.delete(watch.id)
      if (watch.told.entry !== undefined && watch.told.of === undefined) return void screenAgain()
      answers.set(key, { what, input, ...watch.told, error: seenOf(error) })
    } else return
    settled(what, key)
    changed()
  }

  // The runs that the page follows, over the same connection as its live queries.
  const followed = followedRuns(
    (sent) => lineNow().send(sent),
    () => reach.part?.('agent') ?? Promise.resolve(),
  )

  /**
   * The line of the page to `/_t/live`, which names the user that the page was drawn for, and in development the
   * version it was drawn by: a page that opens it after a switch it did not hear of is told the version that runs.
   */
  const lineNow = (): Line => {
    line ??= lineOf(
      () => {
        const named = [
          ...(page.user ? [`as=${encodeURIComponent(page.user.id)}`] : []),
          ...(page.mode === 'development' ? [`version=${encodeURIComponent(page.version)}`] : []),
        ]
        return `/_t/live${named.length ? `?${named.join('&')}` : ''}`
      },
      { ...(reach.socket ? { socket: reach.socket } : {}), wait, random },
      {
        opened() {
          cut = false
          poll?.()
          poll = undefined
          for (const watch of standing()) line?.send(watchOf(watch))
          followed.again()
          queue.back()
        },
        message,
        down() {
          cut = true
          // While no connection can be opened, the live queries are asked again through the door: what the page
          // lacks now, and all of them every 30 seconds.
          for (const watch of standing())
            if (!answers.has(watch.key)) read(watch.what, watch.input, watch.key, watch.told)
          const look = (): void => {
            poll = undefined
            if (line?.up()) return
            lookAgain()
            poll = wait(look, askEvery)
          }
          poll ??= wait(look, askEvery)
        },
      },
    )
    return line
  }

  /** Watches a live query that the page shows, over the one connection of the page. */
  const watched = (what: string, input: unknown, key: string, told: Told, again: boolean): void => {
    seen.add(key)
    let watch = watches.get(key)
    const live = lineNow()
    if (!watch) {
      watch = { id: `w${++ids}`, key, what, input, told }
      watches.set(key, watch)
      lively.add(key)
      byId.set(watch.id, watch)
      live.open()
      // With no connection to bring its answer, a query that the page holds no answer of is read through the door.
      if (!live.send(watchOf(watch)) && cut && !answers.has(key)) read(what, input, key, told)
    } else if (again) {
      // Asked once more, a watch that was over stands again, and the answer is asked for whole.
      delete watch.over
      byId.set(watch.id, watch)
      if (!live.send(watchOf(watch, false))) read(what, input, key, told)
    }
  }

  /** What an asking is answered while an optimistic result of it is shown: the held answer, with each worked over its value. */
  const withResults = (held: Answered | undefined, what: string, key: string): Answered | undefined => {
    if (!held || !results.length) return held
    let value = held.value
    let worked = false
    for (const result of results) {
      if (result.what !== what || result.over.has(key) || (result.worked && !lively.has(key))) continue
      value = result.to(value, result.input, held.input)
      worked = true
    }
    return worked ? { ...held, value } : held
  }

  // In the mode `development` every page opens a connection, to hear of saves, and listens for what its content
  // policy blocked: each is shown with the entry of `unlock` that would open it, once.
  if (page.mode === 'development') {
    lineNow().open()
    reach.blocked?.((one) => {
      if (stopped.some((held) => held.directive === one.directive && held.uri === one.uri)) return
      stopped.push({ ...one, unlock: unlockFor(one) })
      overlaid()
    })
  }

  // The page starts with every state that its screen declares, what the address and the device hold over it, and
  // what the browser's own store kept for this caller, which the first HTML did not know.
  const state: Record<string, unknown> = { ...(declared ? startingState(declared) : {}), ...page.state }
  // What the browser kept is put in once the page was drawn over the first HTML, which did not know it.
  let kept: Record<string, unknown> | undefined = keptInBrowser(declared, page, reach)
  // The back button, and the forward one: every state of the address is set as that step writes it.
  reach.back?.(() => {
    // A step to another screen is a move that adds no step, and the page stays where the browser puts it.
    const shown = shows()
    const at = shown.split(/[?#]/)[0]
    // A step back from the screen above closes it.
    if (upper && at !== upper.page.path) {
      upper = undefined
      if (at === page.path) return changed()
    }
    if (at !== page.path) return void move(shown, { step: 'none', back: true })
    Object.assign(state, readFromAddress(declared, reach))
    changed()
  })

  return {
    get page() {
      return page
    },
    set page(next) {
      page = ofDocument(next)
    },
    words: spoken,
    ...(reach.slash === 'keep' ? { slashed: true } : {}),
    state,
    set: (values, how) => {
      if (setKept({ record: declared, page, reach, state, values, press: how?.press === true })) changed()
    },
    search: () => searchFor(reach, page),
    shows,
    wrote: (under, entries, values, press) => {
      wroteUnder(reach, under, entries, values, press)
      changed()
    },
    answers,
    shown,
    calls,
    view: (name) => views.get(name) ?? (Object.hasOwn(builtIn, name) ? builtIn[name] : undefined),
    stub: (name) => {
      for (const held of stubs.values()) if (held && Object.hasOwn(held, name)) return held[name]
      return undefined
    },
    asset: (name) => assets.get(name),
    sizeOf: (name) => sizes.get(name),
    formPlace: () => forms++,
    hosts: () => [...hosts],
    needs: (name) => {
      if (wanted.has(name) || !reach.part) return
      wanted.add(name)
      // A part that cannot be loaded leaves its tag undrawn: the rest of the page stands.
      void reach.part(name).then(changed, () => undefined)
    },
    follow(run, heard) {
      lineNow().open()
      return followed.follow(run, heard)
    },
    followed: (run) => followed.held(run),
    ask: (what, input, how, again = false) => {
      const key = askingOf(what, input)
      const held = answers.get(key)
      if (how.kind === 'action') actions.add(key)
      const { entry, of, needed } = how
      const told = { ...(entry ? { entry } : {}), ...(of ? { of } : {}), ...(needed ? { needed: true as const } : {}) }
      if (how.live === true) watched(what, input, key, told, again)
      // What the server left for the page, and what was never asked, is asked now.
      else if (again || held === undefined || held.left !== undefined || held.later === true)
        read(what, input, key, told)
      // An action that states `refresh` is asked again on that timer while its screen is shown.
      if (how.every !== undefined) {
        seen.add(key)
        if (!timed.has(key))
          timed.set(
            key,
            every(() => read(what, input, key, told), how.every),
          )
      }
      return withResults(held, what, key)
    },
    drawnPart: async (component, props) => {
      // A part is drawn as the screen of the address that is shown, for the user the page was drawn for.
      const wire = await reach
        .post(`/_t/part/${encodeURIComponent(component)}`, {
          props,
          path: shows(),
          version: page.version,
          ...(page.user ? { as: page.user.id } : {}),
        })
        .catch(() => undefined)
      const value: unknown = isStored(wire) && wire.ok === true ? wire.value : undefined
      return isStored(value) && typeof value.html === 'string' && typeof value.mark === 'string'
        ? { html: value.html, mark: value.mark }
        : undefined
    },
    call: async (name, input, o) => {
      // The optimistic result of a code call where it states one, and otherwise what the page works out of a plain change's plan.
      const worked = o?.optimistic === undefined ? workedOut(page.plans, name, input, page.user?.id) : undefined
      const made: OptimisticResult[] = o?.optimistic ? [o.optimistic] : (worked?.results ?? [])
      const shown: ShownResult[] = made.map((one) => ({
        ...one,
        input,
        answered: false,
        over: new Set<string>(),
        ...(worked ? { worked: true as const } : {}),
      }))
      const first = shown[0]
      const drop = (): void => {
        results = results.filter((one) => !shown.includes(one))
        changed()
      }
      // The result is shown the moment the call is made, for every use of its query on the page. One worked out of a
      // plan stands over live answers: while the connection is cut it is shown once the call is held, and a call
      // that goes through then is shown by the queries the page asks again after it.
      const show = (): void => {
        if (!first || results.includes(first)) return
        results.push(...shown)
        changed()
      }
      if (!worked || !cut) show()
      let value: unknown
      try {
        // A call begins the trace of the press that made it: what the engine does for it is one trace.
        const headers = { ...moveHeaders('press'), 'idempotency-key': callId() }
        value = await queue.send(
          () => answered(`/_t/call/${name}`, input, false, headers),
          (on) => {
            if (on) show()
            o?.held?.(on)
          },
        )
      } catch (error) {
        if (first) drop()
        throw error
      }
      if (first) {
        // The real row of an add takes the key of the row shown in its place, so the list keeps its element.
        worked?.answered(value)
        for (const one of shown) one.answered = true
        wait(drop, page.optimisticKept ?? optimisticKept)
      }
      // After a call that worked, the page asks again every query it shows that is not live. A live one needs
      // nothing while the connection stands: the engine sends what changed.
      for (const [key, one] of answers) {
        // An action is called when its view asks, and never again because another call worked.
        if (actions.has(key)) continue
        const told = { ...(one.entry ? { entry: one.entry } : {}) }
        if (!lively.has(key)) read(one.what, one.input, key, told)
        else if (!line?.up()) read(one.what, one.input, key, told, true)
      }
      return value
    },
    moves: () => [...moves],
    screen: () => views.get(page.screen) ?? (Object.hasOwn(builtIn, page.screen) ? builtIn[page.screen] : undefined),
    drawn: () => {
      if (kept) {
        const found = kept
        kept = undefined
        if (Object.keys(found).length) {
          Object.assign(state, found)
          changed()
        }
      }
      for (const watch of [...watches.values()]) if (!seen.has(watch.key)) unwatch(watch)
      for (const key of [...timed.keys()]) if (!seen.has(key)) untime(key)
      seen.clear()
    },
    prefetch: (address) => {
      const path = address.split('#')[0]
      if (path !== '' && path !== shows()) prefetched.fetch(path, page.version)
    },
    loading: () => waitingFor,
    upper: () =>
      upper && {
        ...upper,
        set: (values: Record<string, unknown>) => {
          if (!upper) return
          // Its own state is written where it lives, as that of any screen: its address is the one that is shown.
          const record = views.get(upper.page.screen)
          if (setKept({ record, page: upper.page, reach, state: upper.state, values, press: true })) changed()
        },
      },
    closeAbove: () => {
      if (!upper) return
      // The browser's own step back closes it, and so the address of the screen underneath comes back.
      if (reach.goBack) return reach.goBack()
      upper = undefined
      changed()
    },
    goTo: (address, o) => {
      // An address outside the app, as `then` names one, is left for; anything else that is no path of the app,
      // or no place on the screen, leads nowhere.
      if (isOutside(address)) return reach.go(address)
      if (!address.startsWith('#') && !isPath(address.split('#')[0])) return
      const spoken = spokenIn(address, o?.language ?? page.language, page.languages)
      const written = loadedWhole(address, page.routes) ? address : reach.slash === 'keep' ? slashedIn(spoken) : spoken
      void move(written, {
        step: o?.replace === true ? 'replace' : 'push',
        ...(o?.keep ? { keep: true } : {}),
        ...(o?.above ? { above: true } : {}),
        ...(o?.above && o.side ? { side: o.side } : {}),
        ...(o?.from ? { from: o.from } : {}),
      })
    },
    changed,
    listen: (one) => {
      heard.add(one)
      return () => heard.delete(one)
    },
    turn: () => turn,
    anew: () => anew,
  }
}

/** Whether a module that a swap names has the form of one: its address and its mark. */
const isSwapped = (one: unknown): one is Swapped =>
  isStored(one) && typeof one.address === 'string' && typeof one.mark === 'string'

/** Whether what the engine answered a request for a screen with is the record of a page. */
const isPage = (value: unknown): value is Page =>
  isStored(value) && typeof value.screen === 'string' && typeof value.version === 'string' && isStored(value.load)
