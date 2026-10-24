import { isStored, stubOf } from '../../core/internal.ts'
import { createElement } from '../borrowed/react.ts'
import { Writable } from 'node:stream'
import { ownerStack } from '../borrowed/react.ts'
import { AsyncLocalStorage } from 'node:async_hooks'
import { renderToPipeableStream } from '../borrowed/reactServer.ts'
import { builtIn } from './builtIn.ts'
import { filesAt } from './based.ts'
import { spokenText, wordsOf } from './spoken.ts'
import { PartContext, StoreContext } from './context.ts'
import type { DrawScope } from './drawScope.ts'
import { scopeReadBy } from './drawScope.ts'
import { asked } from './data.ts'
import { asText, documentBody, documentHead } from './document.ts'
import { allParts } from './held.ts'
import { headLines, laterScripts } from './head.ts'
import { passed } from './kept.ts'
import { streamedParts } from './streamed.ts'
import type { PictureAhead, PageStore } from './store.ts'
import { keptState, startingState } from './state.ts'
import { askingOf } from './store.ts'
import type { Answered, DrawInput, Drawn, Page, ViewRecord } from './types.ts'
import { valueOf } from './valueOf.ts'
import { Own, Shown, Use } from './view.tsx'

// The scope of the draw that runs now: the zone of its page and the parts it loads first, which its views read.
const scope = new AsyncLocalStorage<DrawScope>()
scopeReadBy(() => scope.getStore())

/** The record of a screen or of a component as it is drawn: its stored fields, and its view where it is code. */
function recordOf(o: DrawInput, name: string): ViewRecord | undefined {
  const shared = o.description.project.state
  if (Object.hasOwn(builtIn, name)) return { ...builtIn[name], ...(isStored(shared) ? { shared } : {}) }
  const kind = Object.hasOwn(o.description.screens, name) ? 'screen' : 'component'
  const stored: unknown = (kind === 'screen' ? o.description.screens : o.description.components)[name]
  if (!isStored(stored)) return undefined
  const code = Object.hasOwn(o.views, name) ? o.views[name] : undefined
  // What the module of a view gives stands over what is stored: its view, and each arrow that is code.
  return {
    ...stored,
    ...(isStored(code) ? code : {}),
    name,
    kind,
    ...(kind === 'screen' && isStored(shared) ? { shared } : {}),
  }
}

/** Whether a declared state is kept in the device or in the browser's own store. */
const keeps = (declared: unknown): boolean =>
  Object.values(isStored(declared) ? declared : {}).some(
    (entry) => isStored(entry) && (entry.in === 'device' || entry.in === 'browser'),
  )

/** The page that one draw holds: every asking goes through `read`, and is answered at once. */
function storeOf(o: DrawInput, answers: Map<string, Answered>, state: Record<string, unknown>): PageStore {
  const assets = isStored(o.description.assets) ? o.description.assets : {}
  // The forms of the draw, counted in the order they are drawn.
  let forms = 0
  const store: PageStore = {
    page: o.page,
    words: wordsOf(o.description.messages, o.page.language, o.page.languages),
    ...(o.description.project.trailingSlash === 'keep' ? { slashed: true } : {}),
    state,
    answers,
    shown: new Map(),
    // A form that was sent with no script and failed is read in its view as `calls.<id>`.
    calls: o.page.form ? { [o.page.form.id]: { busy: false, error: o.page.form.error } } : {},
    view: (name) => recordOf(o, name),
    stub: (name) => stubOf(o.description, name),
    hosts: () => (Array.isArray(o.description.project.hosts) ? o.description.project.hosts.map(String) : []),
    asset: (name) => {
      const found: unknown = Object.hasOwn(assets, name) ? assets[name] : undefined
      return isStored(found) && typeof found.file === 'string' ? `${filesAt(o.page)}${found.file}` : undefined
    },
    sizeOf: (name) => {
      const found: unknown = Object.hasOwn(assets, name) ? assets[name] : undefined
      return isStored(found) && typeof found.width === 'number' && typeof found.height === 'number'
        ? { width: found.width, height: found.height }
        : undefined
    },
    ask: (what, input, how) => {
      const key = askingOf(what, input)
      const held = answers.get(key)
      if (held) return held
      // The engine is told how an entry is asked, and not what kind it reads: that is the engine's to know.
      const { kind: _, live: __, ...told } = how
      const answered = o.read(what, input, told)
      answers.set(key, answered)
      return answered
    },
    call: () => Promise.reject(new Error('A call is made by a press, in the browser.')),
    screen: () => recordOf(o, o.page.screen),
    drawn: () => {},
    goTo: () => {},
    set: () => {},
    search: () => passed(o.page.state),
    shows: () => `${o.page.path}${o.page.search ?? ''}`,
    wrote: () => {},
    changed: () => {},
    listen: () => () => {},
    turn: () => 0,
    ...(o.inspectToken === undefined ? {} : { inspectToken: o.inspectToken }),
    partsMet: [],
    formPlace: () => forms++,
    ...(o.sending === undefined ? {} : { sending: o.sending }),
    picturesMet: new Map(),
    pictureMet: (source, widths, ahead) => {
      const key = 'asset' in source ? `a/${source.asset}` : source.file
      const held = store.picturesMet?.get(key)
      if (held) {
        if (ahead) held.ahead = ahead
        return held.told
      }
      const told = o.picture(source)
      store.picturesMet?.set(key, { src: source, widths, ...(told ? { told } : {}), ...(ahead ? { ahead } : {}) })
      return told
    },
    // A part that is drawn on the server alone is drawn apart, so that the page keeps its HTML as it is.
    drawnAlone: (drawn) =>
      drawnText(
        createElement(
          StoreContext.Provider,
          { value: store },
          createElement(PartContext.Provider, { value: o.page.mark ?? '' }, drawn),
        ),
        o.signal,
      ),
  }
  return store
}

/** The line of the head that names a picture ahead, in the widths it is asked in. */
const aheadLine = (ahead: PictureAhead): string =>
  [
    `<link rel="preload" as="image" href="${asText(ahead.src)}"`,
    ...(ahead.srcSet ? [` imagesrcset="${asText(ahead.srcSet)}"`] : []),
    ...(ahead.sizes ? [` imagesizes="${asText(ahead.sizes)}"`] : []),
    ' fetchpriority="high">',
  ].join('')

// In development: what drew a view that failed, by what it threw.
const failedDraws = new WeakMap<object, ReturnType<typeof createElement>>()

/**
 * Takes what a draw of a page of development threw. Draws that view once more, in the way of React that tells of a
 * failure while it draws, and answers the places of the tags that drew what failed, from the innermost out: so a
 * failure inside a component of a package is led to the line of the file that used it. Answers nothing for what
 * no draw threw, and where the second draw does not fail.
 */
export function ownersOf(thrown: unknown): Promise<string> {
  const element = typeof thrown === 'object' && thrown !== null ? failedDraws.get(thrown) : undefined
  if (!element) return Promise.resolve('')
  return new Promise((done) => {
    const drawn = renderToPipeableStream(element, {
      onError: () => done(ownerStack()),
      onShellError: () => done(''),
      onAllReady: () => done(''),
    })
    drawn.pipe(new Writable({ write: (_piece, _code, next) => next() }))
  })
}

/** The texts of a stored record, each by its name: the attributes of `<html>` that the project sets. */
const textsOf = (record: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))

/** A text made at random, which names the places of the living children of one draw. */
const markMade = (): string => globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12)

/**
 * Takes the description, the page, a function that answers every asking the draw meets, and the records of the
 * views. Works out every entry of the screen's own `data` and asks it. Once they have decided the head of the
 * document it is told through `heard`, at once, and the screen is then drawn by React's streaming draw. Answers the
 * whole document, every asking it met, and whether one of them is answered later. Where an entry of
 * the screen's own has an error, or a `needed` one answers nothing, it tells no head, runs no view and answers no
 * `html`.
 */
export function draw(o: DrawInput): Promise<Drawn> {
  // Each draw runs in a scope of its own, which the code of its views reads: a server draws many pages at once.
  return scope.run({ zone: o.page.zone }, () => drawnPage(o))
}

async function drawnPage(o: DrawInput): Promise<Drawn> {
  await allParts()
  const answers = new Map<string, Answered>()
  for (const one of o.page.answers) answers.set(askingOf(one.what, one.input), one)
  const record = recordOf(o, o.page.screen)
  // A component that a test opens alone is drawn in the place of a screen.
  const kind = o.page.alone ? 'component' : 'screen'
  if (record?.kind !== kind) throw new Error(`The description holds no ${kind} \`${o.page.screen}\`.`)
  // The state of the project and of the screen, each as it starts, with what the address and the device hold over it.
  const state = { ...startingState(record), ...o.page.state }
  // The page record holds what is kept in the address and in the device: the browser starts the rest itself.
  const page = { ...o.page, state: keptState(record, state, o.page.state), mark: o.page.mark ?? markMade() }
  const store = storeOf({ ...o, page }, answers, state)
  // The form that was sent with no script tells where its `then` goes, as the page would go there.
  let follow: ((answer: unknown) => string | undefined) | undefined
  if (o.sending !== undefined) store.thenFound = (found) => (follow = found)
  if (o.part) return partDrawn(o, store, answers)
  // In a page that is streamed, a use that waits stands in the first HTML with the screen's loading component.
  const streamed = o.stream
    ? streamedParts(
        o.stream.pending,
        typeof record.loading === 'string' ? recordOf(o, record.loading) : undefined,
        o.stream.personal,
      )
    : undefined
  if (streamed) store.streamed = streamed.streamed
  const over = {
    params: page.params,
    state,
    user: page.user ?? undefined,
    language: page.language,
    settings: page.settings,
  }
  // A component drawn alone asks its own data as any use of it does.
  const own = o.page.alone ? { values: {}, calls: {}, answers: {}, waits: false } : asked(record, over, store)
  const stopped = Object.values(own.answers).some(
    (one) => one !== undefined && (one.error !== undefined || (one.needed === true && isNothing(one))),
  )
  const told = (): Answered[] => [...answers.values()]
  const later = (): boolean => told().some((one) => one.later === true)
  if (stopped) return { answers: told(), later: later(), pictures: [] }
  // An entry of the screen's own that is answered later is waited for: its view is not run without it.
  if (Object.values(own.answers).some((one) => one?.later === true))
    return { answers: told(), later: true, pictures: [] }
  const handed = { ...over, ...own.values }
  if (o.preview && !own.waits) return previewDrawn(o, store, page, own.values, told())
  // A screen that cannot be drawn on the server is sent with its answers and no drawing, which the browser makes.
  // So is one with an entry that was left open when the passes were used up: no view is run without it.
  const open = own.waits
  const title =
    typeof record.title === 'function' ? (open ? '' : record.title(handed)) : valueOf(record.title, { names: handed })
  const browser: unknown = o.description.browser
  const main =
    isStored(browser) && isStored(browser.page) && typeof browser.page.main === 'string' ? browser.page.main : undefined
  // The screen's own entries have decided the head: it is told at once, and the body is drawn after it.
  const head = documentHead({
    page,
    // A title that is a word is written in the language of the page.
    title:
      spokenText(title, store.words, page.language) ?? (title === undefined || title === null ? '' : String(title)),
    ...(store.slashed ? { slash: 'keep' } : {}),
    ...(isStored(o.description.project.html) ? { html: textsOf(o.description.project.html) } : {}),
    // A page that keeps a state between visits keeps it under the name of its app, and an exported page knows
    // by it whether the engine behind its address is that of its app.
    ...(keeps(o.description.project.state) || keeps(record.state) || page.exported === true
      ? { app: o.description.app.name }
      : {}),
    head: open ? [] : headLines({ description: o.description, record, handed, page, words: store.words }),
  })
  o.heard?.(head)
  let drawing = ''
  if (Object(o.description.screens[page.screen]).server !== false && !open) {
    // Drawn as the browser draws it, with the parts it loads first and in the same places, so the two agree.
    const element = createElement(
      StoreContext.Provider,
      { value: store },
      o.above
        ? createElement(Own, { record, above: { params: page.params, state, set: () => {} } })
        : createElement(Shown),
    )
    try {
      drawing = await drawnText(element, o.signal)
    } catch (thrown) {
      // In development what drew a view that failed is kept by what it threw, to tell the tags that drew it.
      if (page.mode === 'development' && typeof thrown === 'object' && thrown !== null) failedDraws.set(thrown, element)
      throw thrown
    }
  }
  // The mark that names the places of the living children is told beside the HTML where a part was drawn.
  const { mark, ...unmarked } = page
  const parted = Boolean(store.partsMet?.length)
  // What the engine told of each picture the draw met, which the page code reads in its place.
  const met = [...(store.picturesMet ?? new Map()).entries()]
  const knownOf = Object.fromEntries(met.flatMap(([key, one]) => (one.told ? [[key, one.told]] : [])))
  const pictured = Object.keys(knownOf).length ? { pictures: knownOf } : {}
  // The scripts of the head that the page code adds once it lives, which the page record names.
  const added = laterScripts({ description: o.description, record, page })
  const scripted = added.length ? { scripts: added } : {}
  // A page of development runs React's own runtime of Fast Refresh before the main file, where the bundle holds it.
  const refresh =
    page.mode === 'development' && isStored(browser) && isStored(browser.page) && isStored(browser.page.parts)
      ? browser.page.parts.refresh
      : undefined
  const body = documentBody({
    page: { ...(parted ? page : unmarked), ...pictured, ...scripted, answers: told() },
    drawing,
    main,
    ...(typeof refresh === 'string' ? { before: [refresh] } : {}),
    // A picture that loads with the page is asked for before the page code has run: the drawing met it, after the head.
    ahead: open ? [] : met.flatMap(([, one]) => (one.ahead ? [aheadLine(one.ahead)] : [])),
  })
  return {
    html: `${head}${body}`,
    answers: told(),
    later: later(),
    pictures: met.map(([, one]) => ({ src: one.src, widths: one.widths })),
    ...(parted && mark !== undefined ? { mark } : {}),
    ...(parted ? { parts: store.partsMet } : {}),
    ...scripted,
    ...(streamed ? { waiting: streamed.waiting } : {}),
    ...(streamed?.personal.length ? { personal: streamed.personal } : {}),
    ...(follow === undefined ? {} : { goesTo: follow }),
  }
}

/**
 * Takes what draws a page or a part, and what ends the draw. Answers its HTML, drawn by React's streaming draw and
 * taken whole once all of it is ready: a view that waits for a promise is waited for, until the draw is ended. Then
 * React's own abort leaves each boundary that still waits to the browser, and a draw whose frame still waited is
 * answered empty, for the browser to draw whole. Fails with what a view threw.
 */
function drawnText(element: ReturnType<typeof createElement>, signal?: AbortSignal): Promise<string> {
  return new Promise((done, failed) => {
    const pieces: Buffer[] = []
    const end = (): void => drawn.abort(signal?.reason)
    const settled = (): void => signal?.removeEventListener('abort', end)
    // A view that fails inside a boundary of its own fails the draw as one outside it does: it is logged, and the
    // `error` screen is drawn. What the end of the draw left to the browser is no failure.
    let thrown: { error: unknown } | undefined
    const drawn = renderToPipeableStream(element, {
      // What failed is told by the promise: React would otherwise write it out on its own.
      onError: (error: unknown) => {
        if (!signal?.aborted) thrown ??= { error }
      },
      onShellError: (error: unknown) => {
        settled()
        if (signal?.aborted) done('')
        else failed(error)
      },
      onAllReady: () => {
        settled()
        if (thrown) return failed(thrown.error)
        drawn.pipe(
          new Writable({
            write: (piece: Buffer, _code, next) => {
              pieces.push(piece)
              next()
            },
            final: (ended) => {
              done(Buffer.concat(pieces).toString('utf8'))
              ended()
            },
          }),
        )
      },
    })
    if (signal?.aborted) end()
    else signal?.addEventListener('abort', end, { once: true })
  })
}

/**
 * Draws the component of the picture of a screen for a shared link, handed the screen's answers, into a still
 * document of the picture's size: the files of its style and its fonts, and no page code, so nothing is drawn again.
 */
async function previewDrawn(
  o: DrawInput,
  store: PageStore,
  page: Page,
  values: Record<string, unknown>,
  answers: Answered[],
): Promise<Drawn> {
  const named = o.preview?.component ?? ''
  const [width, height] = o.preview?.size ?? [1200, 630]
  const record = recordOf(o, named)
  if (record?.kind !== 'component') throw new Error(`The description holds no component \`${named}\`.`)
  const drawing = await drawnText(
    createElement(StoreContext.Provider, { value: store }, createElement(Use, { record, given: values })),
    o.signal,
  )
  const still = { ...page, load: { ...page.load, screen: '', parts: [], error: '' } }
  const head = documentHead({ page: still, title: '' })
  const body = documentBody({
    page: still,
    // The picture is the box of its size at the corner of the window, whatever margin the browser gives the body.
    drawing: `<div style="position:fixed;left:0;top:0;width:${width}px;height:${height}px;overflow:hidden">${drawing}</div>`,
    main: undefined,
  })
  return { html: `${head}${body}`, answers, later: false, pictures: [] }
}

/**
 * Draws one component alone, with the properties that a page gave it: one that is drawn on the server alone, for
 * `/_t/part/`, and a personal part of a kept screen, for its visitor. Answers its HTML, every asking it met, and
 * the mark of the draw.
 */
async function partDrawn(o: DrawInput, store: PageStore, answers: Map<string, Answered>): Promise<Drawn> {
  const named = o.part?.component ?? ''
  const record = recordOf(o, named)
  if (record?.kind !== 'component') throw new Error(`The description holds no component \`${named}\`.`)
  const drawn = await drawnText(
    createElement(StoreContext.Provider, { value: store }, createElement(Use, { record, given: o.part?.props ?? {} })),
    o.signal,
  )
  const told = [...answers.values()]
  return {
    // A component that is drawn on the server alone is its part; any other is what it drew.
    html: store.partsMet?.[0]?.html ?? (record.browser === false ? '' : drawn),
    answers: told,
    later: told.some((one) => one.later === true),
    pictures: [],
    ...(store.page.mark === undefined ? {} : { mark: store.page.mark }),
  }
}

/** Whether an asking that was answered holds nothing: a row that is not there, or no answer yet. */
const isNothing = (one: Answered): boolean =>
  one.later !== true && one.left === undefined && (one.value === undefined || one.value === null)
