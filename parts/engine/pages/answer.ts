import { plansOf } from './plans.ts'
import { randomBytes } from 'node:crypto'
import type { Caller, WireError } from '../../core/index.ts'
import { isLiveMember } from '../ai/members.ts'
import { TentError } from '../../core/index.ts'
import {
  deviceCookie,
  fingerprintOf,
  isPath,
  isStored,
  limitDefaults,
  projectZone,
  projectLanguages,
} from '../../core/internal.ts'
import type { Answered, DrawInput, Drawn, Page } from '../../screens/draw.ts'
import { called, slowAfter } from '../door/call.ts'
import { logCall } from '../door/failure.ts'
import { counted } from '../door/rate.ts'
import { ruled } from '../door/rule.ts'
import { limitOf } from '../limits.ts'
import { callCrossed } from '../rooms/calls.ts'
import type { Opened } from '../opened.ts'
import { valuesOf } from '../values/ofApp.ts'
import { wireError } from '../wire.ts'
import { deviceStateOf, screenAt, stateOf } from './find.ts'
import { spokenAt, unslashed } from './named.ts'
import { cachedAt, cacheKey, cacheOf, keepAt, keysHeaderOf, cacheKeysOf } from './cache.ts'
import { screenAskedNow } from './warm.ts'
import { redirectFor } from './redirects.ts'
import { pageHeaders } from './headers.ts'
import { mayDownload } from '../stored/access.ts'
import { fileRow } from '../stored/files.ts'
import { visitorNow } from '../visitor.ts'
import { cookieSent, zoneOf } from './zone.ts'
import { framedWith, inspectAsked, inspectName, opensNoToken, searchWithout } from './inspect.ts'
import { framedOf } from './framed.ts'
import { countAnswering, countScreen } from '../counts/screens.ts'
import type { Span } from '../trace/span.ts'
import { drawStreamed, endSpan, insideSpan, nameDraw, openSpan, spanNow, spanned } from '../trace/span.ts'
import { noteTouched } from '../touched.ts'
import { filesRead, readingFiles } from './fileReads.ts'
import { streamedBodyOf, firstPiece, lastPiece, openPiece, partIn, partPiece, withoutPlaces } from './stream.ts'
import type { OwnKind } from './own.ts'
import { ownHeaders, ownPage } from './own.ts'
import { languageOf } from '../grants/words.ts'
import { personalParts } from './personal.ts'
import { markedOf } from '../moduleMarks.ts'

/**
 * What an address holds of the states of the uses of components, each under the `id` of its use, a tilde and its
 * name, as it is written: the use reads its own against its types when it is drawn.
 */
function usesState(search: URLSearchParams): Record<string, string[]> {
  const found: Record<string, string[]> = {}
  for (const name of new Set(search.keys())) if (name.includes('~')) found[name] = search.getAll(name)
  return found
}

/** What a request for a screen answers. */
export interface PageAnswer {
  status: number
  headers: Record<string, string>
  html: string
  // The record of the page that was drawn, with every answer the draw met: nothing where the request is sent on.
  page?: Page
  // Of a picture for a shared link: the mark of the answers it was drawn from, which changes when one of them does.
  preview?: { mark: string }
  // Of a draw of one part that is drawn on the server alone: its HTML, what it asked, and the mark of the draw.
  part?: { html: string; answers: Answered[]; mark: string }
  // Every picture of the app that the draw met, with the widths it may be asked in.
  pictures?: Drawn['pictures']
  // Of a page that is streamed: `html` is its first piece, and these are the pieces that follow it in the same
  // answer, each sent as it is drawn, the last of them the end of the document.
  rest?: AsyncIterable<string>
  // Of a draw of the shared part of a kept screen: what is kept, with each use of a personal component in its place.
  frame?: Frame
  // Of a draw before the call of a form that was sent with no script: where the `then` of that form goes with what
  // the call answers.
  goesTo?: Drawn['goesTo']
  // Of a request that a page sends on for a sign-in where no screen stands at the sign-in path: a move inside the
  // page loads the address whole, which a browser is answered by the page of the engine.
  whole?: true
}

/** The shared part of a kept screen: its whole document, its page record, and each use of a personal component. */
interface Frame {
  html: string
  page: Page
  personal: NonNullable<Drawn['personal']>
}

/** What an asking is kept under while one page is drawn. */
const keyOf = (what: string, input: unknown): string => `${what} ${JSON.stringify(input)}`

/** What a caller sees of what a call threw, with its status. */
const seen = (o: Opened, error: unknown): { status: number; error: WireError } => wireError(error, o.mode !== 'live')

/**
 * Takes an app, an address of it with what the app was reached by, and the caller. Answers what a `GET` of that
 * address answers: the screen is found by its pattern, its rule is checked as steps 5 and 6 of the door check a
 * call, its state is read from the address, each entry of its `data` is asked through the door as the caller, and
 * the screen is drawn. Each outcome has its status: 302 to the sign-in screen, 404 with the `notFound` screen, the
 * status of an error with the `error` screen, and 200.
 */
export async function pageAnswer(...asked: Parameters<typeof answerOfPage>): Promise<PageAnswer> {
  // A draw of a screen is a span of its own, named by the screen once one answers the address.
  const span = openSpan(asked[0], { name: 'screen', kind: 'draw', inside: true })
  let answer: PageAnswer
  try {
    answer = await insideSpan(span, () => readingFiles(() => answerOfPage(...asked)))
  } catch (error) {
    endSpan(span, error)
    throw error
  }
  // A page whose head was sent before its record was drawn is drawn while its body is sent: its span ends with it.
  if (answer.rest === undefined || answer.page !== undefined) {
    endSpan(span)
    return answer
  }
  return { ...answer, rest: bodyInside(span, answer.rest) }
}

/**
 * The pieces that follow the head of a page that was sent first: the first, its body, is drawn inside the span of
 * the draw, which ends with it, and the parts that stream after it follow as they come.
 */
async function* bodyInside(span: Span | undefined, rest: AsyncIterable<string>): AsyncGenerator<string> {
  const pieces = rest[Symbol.asyncIterator]()
  let body: IteratorResult<string>
  try {
    body = await insideSpan(span, () => pieces.next())
  } catch (error) {
    endSpan(span, error)
    throw error
  } finally {
    endSpan(span)
  }
  for (let next = body; !next.done; next = await pieces.next()) yield next.value
}

/** The answer of a request for a screen, as `pageAnswer` gives it, inside the span of its draw. */
async function answerOfPage(
  o: Opened,
  url: URL,
  origin: string,
  caller: Caller,
  from?: string,
  prefetch = false,
  cookies: string | null = null,
  more: {
    // What a page that is written out as a file says beyond what the request gave: it is never kept in the cache.
    shaped?: Partial<Page>
    // The screen is asked for to be opened above another: its view is handed `above` as true.
    above?: boolean
    // The path that was asked, where `onRequest` handed the request on under another address: the page is
    // told it, so that the address of the browser and that of the page agree, and is drawn afresh and kept for nobody.
    asked?: string
    // What the engine knows of a picture of the app that the draw meets: its tiny copy, for a caller who may have
    // the file, and in an exported page the files it is written as.
    picture?: DrawInput['picture']
    // One component that is drawn on the server alone, drawn alone with the properties that a page gave it.
    part?: { component: string; props: Record<string, unknown> }
    // A screen that is drawn by its name and not by the address, as the `grant` screen of the project is, with
    // what its view is handed beside the rest.
    screen?: { name: string; handed: Partial<Page> }
    // A failure that the `error` screen is drawn with, in place of any screen.
    failure?: unknown
    // The picture of the screen for a shared link: its component is drawn alone, into a still document.
    preview?: DrawInput['preview']
    // In the mode `test`: one component drawn alone as a page, with the props a test gave it.
    alone?: { component: string; props: Record<string, unknown> }
    // The request is a browser's that takes HTML: where the passes are used up while a part waits, the page is
    // streamed. Every other is drawn whole and sent at once.
    stream?: boolean
    // The shared part of a kept screen is drawn, for nobody, with each use of these personal components in its
    // place and nothing of them asked.
    frame?: string[]
    // The screen is drawn before the call of a form of it that was sent with no script, by the name the form was
    // sent under: the form tells where its `then` goes.
    sending?: string
    // The languages that the browser asks for, which a page of the engine is written in where the address names none.
    languages?: string | null
  } = {},
): Promise<PageAnswer> {
  const { shaped, above = false, asked, part } = more
  const began = performance.now()
  // Under `tent test`, the address the test asked, also one that nothing answers: a screen added there is its concern.
  noteTouched('asked', url.pathname)
  // A good token of the inspect mode: the tool's origin may frame this one answer, and the page loads the part.
  let inspected = part === undefined ? inspectAsked(o, url) : undefined
  const picture = more.picture ?? ((src: { asset: string } | { file: string }) => pictureFor(o, caller, src))
  const description = o.description
  const project = description.project
  // With `trailingSlash: 'keep'` every address of a screen ends in a slash, and the page holds it without it.
  const keepsSlash = project.trailingSlash === 'keep'
  const languages = projectLanguages(project)
  // Every language but the default has its code first in an address: the page holds the address without it.
  const { language, lead, rest } = spokenAt(url.pathname, languages)
  // A page of the engine is in the language of the address, or else in the first the browser asks for.
  const ownLanguage = lead === '' ? languageOf(description, more.languages ?? null) : language
  // A browser asks for a whole page. On live data it is sent the engine's own pages; in development and in the mode
  // `test` the screens of the page code stand, which show a failure in full, and in development hear the save that
  // mends it.
  const asksPage = more.stream === true && shaped === undefined && part === undefined
  const asksHtml = asksPage && o.mode === 'live'
  const path = unslashed(description, rest)
  const shownPath = asked === undefined ? undefined : unslashed(description, spokenAt(asked, languages).rest)
  const browser: Record<string, unknown> = Object(description.browser)
  const messages: Record<string, unknown> = Object(browser.messages)
  const signInPath = typeof project.signInPath === 'string' ? project.signInPath : '/sign-in'
  // What a page needs of the limits and does not hold in its code, where the project states another than the usual one.
  const ownLimits = Object.fromEntries(
    (['optimisticKept', 'loadingAfter', 'prefetchKept', 'prefetchAtOnce', 'callHold'] as const).flatMap((name) => {
      const value = limitOf(description, name)
      return value === limitDefaults.project[name] ? [] : [[name, value]]
    }),
  )
  const routes = Object.values(description.routes).flatMap((one) => {
    const methods = (Array.isArray(one.method) ? one.method : [one.method]).map((method) =>
      String(method).toUpperCase(),
    )
    return typeof one.path === 'string' && methods.includes('GET') ? [one.path] : []
  })
  // The nonce of this one document, which the content policy lets the style tags of a library in by. A page that is
  // written out as a file is sent with no policy, and holds none.
  const nonce = shaped?.exported === true ? undefined : randomBytes(18).toString('base64url')
  const ownZone = projectZone(project)
  const page = (screen: string, more: Partial<Page>): Page => ({
    version: o.version,
    mode: o.mode,
    status: 200,
    screen,
    origin,
    path: shownPath ?? path,
    params: {},
    state: {},
    language,
    languages,
    ...(typeof project.currency === 'string' ? { currency: project.currency } : {}),
    user: caller.kind === 'user' && caller.user ? { id: caller.user.id, roles: [...caller.user.roles] } : null,
    settings: valuesOf(o).settings.shown(),
    zone: zoneOf(cookies) ?? ownZone,
    ...ownLimits,
    // The share of the page views that measure what their visitor saw, where the project states its own.
    ...(typeof Reflect.get(Object(project.vitals), 'share') === 'number'
      ? { vitals: Number(Reflect.get(Object(project.vitals), 'share')) }
      : {}),
    // The widths that a picture of the app is asked for in, where the project states its own.
    ...(isStored(project.images) && Array.isArray(project.images.widths) && project.images.widths.length
      ? { imageWidths: project.images.widths.filter((one): one is number => typeof one === 'number') }
      : {}),
    framedBy: null,
    load: {
      screen: '',
      parts: [],
      styles: Array.isArray(browser.styles) ? browser.styles.map((one) => markedOf(o, String(one))) : [],
      ...(typeof messages[language] === 'string' ? { messages: messages[language] } : {}),
      error: '',
    },
    // The page loads the path of a route that states GET whole, as it is written.
    ...(routes.length ? { routes } : {}),
    answers: [],
    ...(inspected ? { inspect: { origin: inspected.origin } } : {}),
    // A browser that a test drives says so by a cookie of its own, which only the mode `test` reads.
    ...(o.mode === 'test' && cookieSent(cookies, 'tent_test') === '1' ? { tested: true as const } : {}),
    ...(nonce === undefined ? {} : { nonce }),
    ...more,
    ...shaped,
  })
  // The draw of the page code, by the room of the app, which loads the views each page draws.
  const drawOf = o.room.draw(o.version)
  const left = limitOf(description, 'streamTime')
  const draw = (input: Omit<DrawInput, 'views'>): Promise<Drawn> =>
    callCrossed(undefined, o.room, { sync: false, pure: false, left }, (options) => drawOf(input, options))
  // The time of a stream bounds every draw of the page: one that still waits then is ended, what it drew is sent,
  // and the request is logged with the failure.
  const ending = AbortSignal.timeout(limitOf(description, 'streamTime'))
  const cut = (): Error | undefined =>
    ending.aborted
      ? new Error('A view still waited when the time of a stream was up: what waited is left to the browser to draw.')
      : undefined
  const none: DrawInput['read'] = (what, input) => ({ what, input })
  // The request is one row of the log: under the name of the screen once one answers, and under the path until
  // then, with how it ended, as a call is written.
  let named = path
  const logged = (error?: unknown): void => {
    // The shared part of a kept screen is drawn for the request that needed it, which is the row of the log.
    if (more.frame) return
    nameDraw(named === path ? 'notFound' : named)
    if (named !== path) noteTouched(more.alone ? 'components' : 'screens', named)
    void logCall(o, { name: named, kind: 'screen', caller, began, ...(error === undefined ? {} : { error }) })
    countScreen(o, named, caller, began, error)
  }
  const sent = async (drawn: Page, error: unknown): Promise<PageAnswer> => {
    const made = await draw({
      description,
      page: drawn,
      read: none,
      picture: () => undefined,
      signal: ending,
    })
    logged(error)
    const headers = pageHeaders(description, origin, framedWith(null, inspected), drawn.nonce)
    return { status: drawn.status, headers, html: made.html ?? '', page: drawn }
  }
  // The two screens that every app has: the project's own, where it states one with `for`, and the one that the
  // page code holds. Where the project's own cannot be drawn, the one of the page code is.
  const special = (kind: 'notFound' | 'error'): string | undefined =>
    Object.entries(description.screens).find(([, one]) => isStored(one) && one.for === kind)?.[0]
  const modules: Record<string, unknown> = Object(browser.screens)
  const moduleOf = (name: string): string => String(Object(modules[name])[0] ?? '')
  // The module of the project's own `error` screen, which a page loads only when a view fails in the browser: with
  // none, the one of the page code is drawn.
  const errorModule = moduleOf('tent.error')
  const components: Record<string, unknown> = Object(browser.components)
  /**
   * What a page loads for a screen, or a component drawn alone: its module; the module of each component it draws,
   * of the component it names in `loading` and of each layout it is shown in, with what those draw; the parts of
   * the page code they need; and their style files. Answers that, with the components it reaches.
   */
  const loadOf = (
    name: string,
    screen: Record<string, unknown>,
    alone: boolean,
  ): { uses: string[]; load: Page['load'] } => {
    const uses = Array.isArray(screen.uses) ? screen.uses.map(String) : []
    // The component that the screen names in `loading` is loaded with it, and shown while a move from it takes long.
    if (typeof screen.loading === 'string' && !uses.includes(screen.loading)) uses.push(screen.loading)
    // The layouts that the screen is shown in, each with what it draws, are loaded with it too.
    for (let layout: unknown = screen.layout; typeof layout === 'string' && !uses.includes(layout); ) {
      const frame: Record<string, unknown> = Object(description.components[layout])
      uses.push(
        layout,
        ...(Array.isArray(frame.uses) ? frame.uses.map(String).filter((one) => !uses.includes(one)) : []),
      )
      layout = frame.layout
    }
    // The style files that the screen and each component it draws import, a package's among them, stand in the head
    // beside the project's own: the first HTML is drawn with them.
    const styles = [
      ...new Set([
        ...(Array.isArray(browser.styles) ? browser.styles.map(String) : []),
        ...[name, ...uses].flatMap((one) => {
          const files: unknown = Object.hasOwn(modules, one) ? modules[one] : components[one]
          // Beside its style files a view names the files they name, as a font, which the style files load.
          return Array.isArray(files)
            ? files
                .slice(1)
                .map(String)
                .filter((file) => file.endsWith('.css'))
            : []
        }),
      ]),
    ]
    // The parts of the page code that the screen and the components it draws need, each as its file.
    const partFiles: Record<string, unknown> = Object(Object(browser.page).parts)
    const needs = new Set(
      [screen, ...uses.map((one) => description.components[one])].flatMap((one) =>
        Array.isArray(Object(one).needs) ? Object(one).needs.map(String) : [],
      ),
    )
    // A use of a component that is drawn on the server alone is a part of the page code of its own.
    if (uses.some((one) => Object(description.components[one]).browser === false)) needs.add('served')
    if (inspected) needs.add('inspect')
    const needed = [...needs].sort().flatMap((one) => (typeof partFiles[one] === 'string' ? [partFiles[one]] : []))
    // A module of development is named at its mark, so a page holds the one of this version.
    const marked = (file: string): string => markedOf(o, file)
    const load = {
      // A component drawn alone loads its own module.
      screen: marked(alone ? String(Object(components[name])[0] ?? '') : moduleOf(name)),
      parts: [
        ...uses.flatMap((one) => (Array.isArray(components[one]) ? [marked(String(components[one][0]))] : [])),
        ...needed,
      ],
      styles: styles.map(marked),
      ...(typeof messages[language] === 'string' ? { messages: messages[language] } : {}),
      error: marked(errorModule),
    }
    return { uses, load }
  }
  // A browser that asks for HTML is sent the engine's own page where the project has no screen for it: plain HTML,
  // which is drawn even where the app's own code does not load.
  const ownAnswer = (kind: OwnKind, status: number, why: unknown): PageAnswer => {
    logged(why)
    // In development and in the mode `test` the page tells the error in full; on live data its words alone.
    const error = o.mode === 'live' || why === undefined ? {} : { error: seen(o, why).error }
    return {
      status,
      headers: ownHeaders(),
      html: ownPage({ description, language: ownLanguage, status, kind, ...error }),
    }
  }
  const noScreen = (): unknown => refusal('T0001', `No screen answers ${path.slice(0, 120)}.`)
  const drawnAs = async (
    kind: 'notFound' | 'error',
    builtIn: string,
    more: Partial<Page>,
    why: unknown,
  ): Promise<PageAnswer> => {
    const own = special(kind)
    if (own === undefined && asksHtml) return ownAnswer(kind, more.status ?? (kind === 'notFound' ? 404 : 500), why)
    if (own !== undefined) {
      try {
        // The project's own screen is loaded as any screen is, with the layout it is shown in.
        const { load } = loadOf(own, description.screens[own], false)
        const answered = await sent(page(own, { ...more, load }), why)
        if (answered.html !== '') return answered
      } catch {
        // The project's own screen failed while it was drawn: the one of the page code is drawn in its place.
      }
    }
    // In development and in the mode `test` the built-in screen tells that no screen answers the address, the same
    // for one that the caller may not see: so it tells nothing of that screen.
    const told = kind === 'notFound' && o.mode !== 'live' ? { error: seen(o, noScreen()).error } : {}
    return sent(page(builtIn, { ...told, ...more }), why)
  }
  const notFound = (why: unknown = noScreen()): Promise<PageAnswer> =>
    drawnAs('notFound', 'tent.notFound', { status: 404 }, why)
  const failed = async (thrown: unknown): Promise<PageAnswer> => {
    const { status, error } = seen(o, thrown)
    const search = searchWithout(url)
    return drawnAs('error', 'tent.error', { status, error, ...(search ? { search } : {}) }, thrown)
  }
  const moved = (status: number, location: string, why?: unknown): PageAnswer => {
    logged(why)
    return { status, headers: { location, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, html: '' }
  }
  if (more.failure !== undefined) return failed(more.failure)
  if (!isPath(url.pathname)) return notFound()
  // The code of the default language answers 308 to the address without it.
  const coded = url.pathname.slice(1).split('/')[0]
  if (coded !== '' && coded === languages[0] && (url.pathname === `/${coded}` || url.pathname.startsWith(`/${coded}/`)))
    return moved(308, `${url.pathname.slice(coded.length + 1) || '/'}${url.search}`)
  // An address that ends in a slash answers the same one without it, and with `trailingSlash: 'keep'` one without
  // answers the one with it. The move is written under the name of the screen that it leads to: an address may
  // carry a code, and no value of one stands in the log.
  if (!keepsSlash && url.pathname !== '/' && url.pathname.endsWith('/')) {
    named = screenAt(description, path === '/' ? '/' : path.slice(0, -1))?.name ?? path
    return moved(308, `${url.pathname.slice(0, -1)}${url.search}`)
  }
  if (keepsSlash && path !== '/' && !url.pathname.endsWith('/')) {
    named = screenAt(description, path)?.name ?? path
    return moved(308, `${lead}${path}/${url.search}`)
  }
  const redirect = redirectFor(description, path, url.search)
  if (redirect) {
    // A redirect to a path of the app keeps the slash at its end where the project keeps one.
    const kept = keepsSlash && redirect.location.startsWith('/') && !redirect.location.split('?')[0].endsWith('/')
    const [to, after = ''] = redirect.location.split(/(?=\?)/)
    const location = kept ? `${to}/${after}` : redirect.location
    return moved(redirect.status, location.startsWith('/') ? `${lead}${location}` : location)
  }
  const found = more.alone
    ? { name: more.alone.component, params: {} }
    : more.screen
      ? { name: more.screen.name, params: {} }
      : screenAt(description, path)
  if (!found) return notFound()
  named = found.name
  countAnswering(found.name, caller)
  // A component drawn alone stands in the place of a screen, and asks no rule of one.
  const screen: Record<string, unknown> = more.alone
    ? Object(description.components[found.name])
    : description.screens[found.name]
  // The pages where a person lets a program in are opened by no token.
  if (opensNoToken(screen)) inspected = undefined
  // The way to the sign-in carries the token as a name of its own, and never inside `back`.
  const carried = inspected ? `&${inspectName}=${inspected.token}` : ''
  const signIn = (why: unknown): PageAnswer => {
    // With no screen at the sign-in path, a browser is told so by a page of the engine in every mode, and sent
    // nowhere: no screen of the page code stands for it.
    const standing = screenAt(description, signInPath) !== undefined
    if (asksPage && !standing) return ownAnswer('signIn', 401, why)
    const back = encodeURIComponent(`${lead}${path}${searchWithout(url)}`)
    const sent = moved(302, `${lead}${signInPath}?back=${back}${carried}`, why)
    return standing ? sent : { ...sent, whole: true }
  }
  const said = ruled(screen.access, caller)
  // The screen at the sign-in path is never sent to itself: a caller who is not signed in is always let in there.
  if ('needs' in said && path !== signInPath && !more.alone)
    return caller.kind === 'nobody'
      ? signIn(refusal('T0006', `The screen ${found.name} needs a signed-in caller.`))
      : notFound(refusal('T3101', `The rule of the screen ${found.name} does not let the caller in.`))
  const { uses, load } = loadOf(found.name, screen, more.alone !== undefined)
  for (const one of uses) noteTouched('components', one)
  // The plans by which the page shows a change of the screen before the engine answers it.
  const plans = plansOf(description, [screen, ...uses.map((name) => description.components[name])])
  const forViewer = page(found.name, {
    params: found.params,
    ...(plans ? { plans } : {}),
    // The state that the address and the device hold: the project's, and the screen's own over it.
    state: {
      ...usesState(url.searchParams),
      ...stateOf(project.state, url.searchParams),
      ...stateOf(screen.state, url.searchParams),
      ...deviceStateOf(
        project.state,
        screen.state,
        found.name,
        cookieSent(cookies, deviceCookie(description.app.name, origin)),
      ),
    },
    framedBy: framedOf(o, screen.framedBy),
    load,
    ...more.screen?.handed,
    ...(more.alone ? { alone: { props: more.alone.props } } : {}),
  })
  // A screen that states `cache` serves nobody from what the engine keeps: anyone else is drawn afresh, and so is
  // every caller in the mode `development`, and a request whose state cannot be part of what an answer is kept under.
  const caching = cacheOf(screen)
  const deviceSet =
    Object.keys(
      deviceStateOf(
        project.state,
        screen.state,
        found.name,
        cookieSent(cookies, deviceCookie(description.app.name, origin)),
      ),
    ).length > 0
  const keptUnder =
    caching &&
    shaped === undefined &&
    asked === undefined &&
    part === undefined &&
    more.sending === undefined &&
    more.preview === undefined &&
    // A page in the inspect mode is drawn afresh, and kept for nobody.
    inspected === undefined &&
    caller.kind === 'nobody' &&
    o.mode !== 'development' &&
    !Object.keys(forViewer.state).some((name) => name.includes('~'))
      ? cacheKey(description, found.name, o.version, origin, url.pathname, forViewer.state, above)
      : undefined
  // A kept screen that draws personal parts keeps its shared part, drawn for nobody, for every caller: each is sent
  // it at once and their own parts streamed into the same answer. A stranger of a `public` one is sent it alone.
  const personal = caching && more.frame === undefined ? [...personalParts(description, uses)] : []
  const framed =
    personal.length > 0 &&
    more.stream === true &&
    shaped === undefined &&
    asked === undefined &&
    part === undefined &&
    inspected === undefined &&
    o.mode !== 'development' &&
    !Object.keys(forViewer.state).some((name) => name.includes('~'))
      ? cacheKey(description, found.name, o.version, origin, url.pathname, forViewer.state, above)
      : undefined
  // A page that the cache keeps or answers is the same for every visitor: it is drawn in `project.zone`, and the
  // page corrects its times in the browser of a visitor whose zone is another.
  const drawn = keptUnder === undefined && framed === undefined ? forViewer : { ...forViewer, zone: ownZone }
  // The shared part of a screen with personal parts is kept apart from a page drawn whole.
  const key = keptUnder === undefined || !more.frame ? keptUnder : `${keptUnder} frame`
  // A page is sent with no-store whether the cache held it or not, and with `public` a cache outside may keep it, but
  // never one that was drawn with a state of the device that is not its default.
  const outside = caching?.public === true && key !== undefined && !deviceSet
  // A public answer names the tables it read in the header the project names, so a cache outside drops it by key.
  const keysHeader = keysHeaderOf(o)
  const cacheHeaders = (headers: Record<string, string>, keys?: string[]): Record<string, string> =>
    outside
      ? {
          ...headers,
          'cache-control': `public, max-age=0, s-maxage=${Math.round((caching?.for ?? 0) / 1000)}`,
          ...(keysHeader && keys?.length ? { [keysHeader]: keys.join(' ') } : {}),
        }
      : headers
  if (key !== undefined) screenAskedNow(o, url, origin)
  if (key !== undefined) {
    const held = cachedAt(o, key, o.clock.now())
    if (held) {
      logged()
      return {
        status: held.status,
        // A kept answer is sent with the nonce it was drawn with, which its HTML holds.
        headers: cacheHeaders(
          pageHeaders(description, origin, framedOf(o, screen.framedBy), held.page?.nonce),
          held.keys,
        ),
        html: held.html,
        ...(held.page ? { page: held.page } : {}),
        ...(held.page && held.personal ? { frame: { html: held.html, page: held.page, personal: held.personal } } : {}),
      }
    }
  }
  // Every asking of the draw goes through the door as the caller. A query answers at once, and what cannot is
  // started and waited for: the screen is then drawn again with its answer.
  const answers = new Map<string, Answered>()
  const waiting = new Map<string, Promise<void>>()
  // The span of each entry that is still asked, by its key: one the page is sent without says that it streamed.
  const askedSpans = new Map<string, Span>()
  // What an asking threw, by the asking: the `error` screen is drawn with the error itself, and its status.
  const failures = new Map<string, unknown>()
  // In the last pass nothing is started that cannot answer at once: it is left open, for the page to ask.
  let last = false
  // A screen is handed what the wire carries: a moment is text in the standard form, and never a `Date`.
  const answer = (told: Answered, value: unknown): Answered => {
    const text = JSON.stringify(value)
    const mark = fingerprintOf(new TextEncoder().encode(text ?? 'null')).slice(0, 16)
    return text === undefined ? { ...told, mark } : { ...told, value: JSON.parse(text), mark }
  }
  const read: DrawInput['read'] = (what, input, how = {}) => {
    const key = keyOf(what, input)
    const held = answers.get(key)
    if (held) return held
    const told: Answered = {
      what,
      input,
      ...(how.entry ? { entry: how.entry } : {}),
      ...(how.of ? { of: how.of } : {}),
      ...(how.needed ? { needed: true as const } : {}),
    }
    let now: Answered
    // `working` of an agent is a query that the engine answers.
    const kind = isLiveMember(o, what) ? 'query' : Object(description.functions[what]).kind
    if (waiting.has(key)) now = { ...told, later: true }
    // The shared part of a kept screen asks nothing for a personal part: that is drawn for each visitor.
    else if (how.of !== undefined && more.frame?.includes(how.of)) now = { ...told, left: 'open' }
    // An entry that the page does not wait for is asked by the page, when it has come alive.
    else if (how.wait === false) now = { ...told, left: 'wait' }
    // A screen that is prefetched for a move calls no action: hovering a link costs no call of a service.
    else if (prefetch && kind === 'action') now = { ...told, left: 'prefetch' }
    else if (kind !== 'query' && kind !== 'action') now = { ...told, error: seen(o, notRead(what)).error }
    else if (last && (kind === 'action' || Object(description.functions[what]).heavy === true))
      now = { ...told, left: 'open' }
    else {
      try {
        // An action that a request of the web reads counts as one call of its caller, as any call of it does.
        if (kind === 'action' && from !== undefined) counted(o, caller, from)
        // An action is the writer's to carry out: a reader that meets one hands the whole request on.
        if (kind === 'action' && Object(description.functions[what]).changes !== false)
          o.machine.writes(`the action ${what}, which a screen reads`)
        // Each entry that the draw asks is a span of the draw, under the name of the entry.
        const value = spanned(
          o,
          { name: what, kind: 'asked', facts: how.entry ? { entry: how.entry } : {}, inside: true },
          () => {
            const span = spanNow()
            if (span) askedSpans.set(key, span)
            return called(o, what, input, kind === 'action' ? { caller, reads: true } : { caller })
          },
        )
        if (value instanceof Promise) {
          waiting.set(
            key,
            value
              .then(
                (settled) => void answers.set(key, answer(told, settled)),
                (error) => {
                  failures.set(key, error)
                  answers.set(key, { ...told, error: seen(o, error).error })
                },
              )
              .finally(() => waiting.delete(key)),
          )
          now = { ...told, later: true }
        } else now = answer(told, value)
      } catch (error) {
        failures.set(key, error)
        now = { ...told, error: seen(o, error).error }
      }
    }
    if (now.later !== true) answers.set(key, now)
    return now
  }
  // The time of the draws of all passes together, without the waits between them, by the clock of the app.
  let drawing = 0
  const passes = limitOf(description, 'drawPasses')
  // A page that a cache outside may keep, and one that is written out as a file, is drawn whole.
  const streams =
    more.stream === true &&
    more.frame === undefined &&
    part === undefined &&
    shaped === undefined &&
    more.sending === undefined &&
    caching?.public !== true
  // Of a page that a browser asks for, the head is sent as soon as the screen's own entries have decided it. A page
  // that the cache keeps is drawn whole, and sent whole, as it is kept.
  let toldHead: ((head: string) => void) | undefined
  const headed = streams && key === undefined ? new Promise<string>((done) => (toldHead = done)) : undefined
  const drawOnce = (pending?: string[]): Promise<Drawn> =>
    draw({
      description,
      page: { ...drawn, answers: [...answers.values()] },
      read,
      picture,
      ...(above ? { above: true } : {}),
      ...(part ? { part } : {}),
      ...(more.preview ? { preview: more.preview } : {}),
      ...(inspected ? { inspectToken: inspected.token } : {}),
      ...(streams || more.frame
        ? { stream: { pending: pending ?? [], ...(more.frame ? { personal: more.frame } : {}) } }
        : {}),
      ...(toldHead ? { heard: toldHead } : {}),
      ...(more.sending === undefined ? {} : { sending: more.sending }),
      signal: ending,
    })
  if (framed !== undefined) {
    const held = cachedAt(o, `${framed} frame`, o.clock.now())
    const shared =
      held?.page && held.personal
        ? { html: held.html, page: held.page, personal: held.personal }
        : (await pageAnswer(o, url, origin, { kind: 'nobody' }, from, prefetch, cookies, { ...more, frame: personal }))
            .frame
    if (shared) {
      logged()
      const headers = pageHeaders(
        description,
        origin,
        framedWith(framedOf(o, screen.framedBy), inspected),
        shared.page.nonce,
      )
      if (caching?.public && caller.kind === 'nobody' && !deviceSet)
        return {
          status: 200,
          headers: { ...headers, 'cache-control': `public, max-age=0, s-maxage=${Math.round(caching.for / 1000)}` },
          html: withoutPlaces(shared.html),
          page: shared.page,
        }
      // Each personal part is drawn alone for this caller, from what its use was given, through as many passes.
      const alone = async (use: Frame['personal'][number]): Promise<Drawn> => {
        const once = (): Promise<Drawn> =>
          draw({
            description,
            page: { ...drawn, nonce: shared.page.nonce, answers: [...answers.values()] },
            read,
            picture,
            part: { component: use.component, props: use.given },
            signal: ending,
          })
        let made = await once()
        for (let pass = 1; made.later && pass < passes; pass++) {
          await Promise.all(waiting.values())
          made = await once()
        }
        return made
      }
      const rest = personalPieces({
        uses: shared.personal,
        alone,
        nonce: shared.page.nonce,
        // The shared part was drawn for nobody: the page record is told whom the page is for.
        page: drawn.user === null ? undefined : { user: drawn.user },
      })
      return { status: 200, headers, html: firstPiece(shared.html), page: shared.page, rest }
    }
  }
  // The passes of the draw: the last draw, and whether the page is sent before what its parts wait for has come.
  const passed = async (): Promise<{ made: Drawn; streaming: boolean } | { thrown: unknown }> => {
    let made: Drawn = { answers: [], later: false, pictures: [] }
    const passesFrom = performance.now()
    try {
      for (let pass = 0; ; pass++) {
        last = pass >= passes - 1
        const from = o.clock.now()
        made = await drawOnce()
        drawing += o.clock.now() - from
        if (!made.later) break
        // What only the parts of a streamed page wait for is waited for while the passes have time together: then
        // the page is sent with those parts in their places.
        if (streams && made.html !== undefined && made.answers.every(inPart)) {
          const left = slowAfter - (performance.now() - passesFrom)
          if (last || left <= 0) {
            drawStreamed()
            for (const key of waiting.keys()) {
              const span = askedSpans.get(key)
              if (span) span.facts.streamed = true
            }
            return { made, streaming: true }
          }
          await settledWithin([...waiting.values()], left, true)
          continue
        }
        if (last) break
        await Promise.all(waiting.values())
        waiting.clear()
      }
    } catch (thrown) {
      return { thrown }
    }
    return { made, streaming: false }
  }
  const passing = passed()
  /** What the passes of the draw come to: the page, or the outcome of an entry of the screen's own. */
  const outcomeOf = async (passes: { made: Drawn; streaming: boolean } | { thrown: unknown }): Promise<PageAnswer> => {
    // View code that fails: the failure is logged with its trace, and the `error` screen is drawn.
    if ('thrown' in passes) return failed(passes.thrown)
    const { made, streaming } = passes
    // A part is answered with its HTML alone, which no cache keeps.
    if (part)
      return {
        status: 200,
        headers: { 'cache-control': 'no-store' },
        html: '',
        part: { html: made.html ?? '', answers: made.answers, mark: made.mark ?? '' },
      }
    // The outcome of an entry of the screen's own: the way to the sign-in, the screen that is not found, or the error.
    for (const one of made.answers) {
      if (one.entry === undefined || one.of !== undefined) continue
      const thrown = failures.get(keyOf(one.what, one.input)) ?? one.error
      if (one.error?.code === 'T0006') return signIn(thrown)
      // A needed entry whose query says that what it reads is not there makes the screen one that is not found too.
      const gone = one.needed === true && ['T0001', 'T2103', 'not-found'].includes(String(one.error?.code))
      if (one.error?.code === 'T3101' || one.error?.code === 'T0002' || gone) return notFound(thrown)
      if (one.error) return failed(thrown)
      if (one.needed && one.left === undefined && one.later !== true && (one.value === undefined || one.value === null))
        return notFound(refusal('T0001', `The entry ${one.entry} of ${found.name} is needed, and answered nothing.`))
    }
    if (made.html === undefined) return failed(new Error('the page code drew no screen'))
    // A picture for a shared link is its still document, with the mark of the answers it was drawn from.
    if (more.preview) {
      const marks = made.answers.map((one) => `${one.what} ${JSON.stringify(one.input)} ${one.mark ?? ''}`).sort()
      const mark = fingerprintOf(new TextEncoder().encode(marks.join('\n'))).slice(0, 16)
      return { status: 200, headers: { 'cache-control': 'no-store' }, html: made.html, preview: { mark } }
    }
    // A draw that took long is written down, as a slow query is.
    if (drawing > slowAfter) o.log.write('slow', { at: o.clock.now(), name: found.name, ms: Math.round(drawing) })
    logged(cut())
    const headers = pageHeaders(description, origin, framedWith(framedOf(o, screen.framedBy), inspected), drawn.nonce)
    // What the engine knows of each picture the draw met stands in the page record, as in the first HTML.
    const pictured = Object.fromEntries(
      made.pictures.flatMap((one) => {
        const told = picture(one.src)
        return told ? [['asset' in one.src ? `a/${one.src.asset}` : one.src.file, told]] : []
      }),
    )
    // An answer of `/_t/screen` holds the HTML of each part that the draw met, and the mark that names their places.
    const sentPage = {
      ...drawn,
      ...(Object.keys(pictured).length ? { pictures: pictured } : {}),
      answers: made.answers,
      ...(made.mark === undefined ? {} : { mark: made.mark }),
      ...(made.parts?.length ? { parts: made.parts } : {}),
      ...(made.scripts ? { scripts: made.scripts } : {}),
    }
    // Only an answer whose drawing met nothing but what is open to anyone is kept, and none that left an entry open.
    // What a personal part would ask is no part of the shared part, which asked none of it.
    const ownAnswers = made.answers.filter((one) => one.of === undefined || !more.frame?.includes(one.of))
    const open = ownAnswers.every((one) => {
      const read = Object.hasOwn(description.functions, one.what) ? description.functions[one.what] : undefined
      return one.left === undefined && one.error === undefined && Object(read?.access).rule === 'anyone'
    })
    // A page that holds the tiny copy of a file which not everyone may have is kept for nobody else.
    const shared = made.pictures.every(
      (one) =>
        !('file' in one.src) || pictureFor(o, { kind: 'nobody' }, one.src)?.tiny === pictured[one.src.file]?.tiny,
    )
    if (key !== undefined && caching && open && shared)
      keepAt(
        o,
        key,
        {
          screen: found.name,
          for: caching.for,
          status: 200,
          html: made.html,
          page: sentPage,
          ...(outside ? { out: { host: new URL(origin).host, address: url.pathname, language } } : {}),
          reads: ownAnswers.map((one) => one.what),
          files: filesRead() ?? [],
          ...(more.frame ? { personal: made.personal ?? [] } : {}),
        },
        o.clock.now(),
      )
    if (streaming) {
      // From here on what is met is started and streamed too, until the time of the stream is up.
      last = false
      const rest = streamed({
        first: made,
        deadline: performance.now() + limitOf(description, 'streamTime'),
        waiting,
        drawAgain: drawOnce,
        nonce: drawn.nonce,
      })
      return { status: 200, headers, html: firstPiece(made.html), page: sentPage, rest }
    }
    return {
      status: 200,
      headers:
        key !== undefined && open
          ? cacheHeaders(
              headers,
              cacheKeysOf(
                o,
                made.answers.map((one) => one.what),
                filesRead() ?? [],
              ),
            )
          : headers,
      html: made.html,
      page: sentPage,
      ...(made.pictures.length ? { pictures: made.pictures } : {}),
      ...(more.frame ? { frame: { html: made.html, page: sentPage, personal: made.personal ?? [] } } : {}),
      ...(made.goesTo === undefined ? {} : { goesTo: made.goesTo }),
    }
  }
  /**
   * The pieces that follow the head of a page that was sent first: its body once it is drawn, and the parts that
   * stream after it. A view that fails once the head is sent cannot change the status: the `error` screen is drawn
   * in the place of the body, the failure is logged with its trace, and the page says that it is not to be indexed.
   */
  const bodyAfter = async function* (): AsyncGenerator<string> {
    const passes = await passing
    if ('thrown' in passes) {
      const shown = await failed(passes.thrown)
      yield `<meta name="robots" content="noindex">\n${streamedBodyOf(shown.html)}`
      return
    }
    const sent = await outcomeOf(passes)
    yield streamedBodyOf(sent.html)
    if (sent.rest) yield* sent.rest
  }

  if (headed) {
    const head = await Promise.race([headed, passing.then(() => undefined)])
    if (head !== undefined) {
      // The status and the headers are those of the screen's own entries, which have answered: the body follows.
      const headers = pageHeaders(description, origin, framedWith(framedOf(o, screen.framedBy), inspected), drawn.nonce)
      return { status: 200, headers, html: head, rest: bodyAfter() }
    }
  }
  return outcomeOf(await passing)
}

/**
 * The pieces that follow the shared part of a kept screen, for one caller: each personal part drawn alone for the
 * caller, sent with its answers into the place it holds, and what the page record is to say of its caller. A part
 * that fails to draw leaves its place empty, for the page to draw. Then the document ends.
 */
async function* personalPieces(o: {
  uses: Frame['personal']
  alone(use: Frame['personal'][number]): Promise<Drawn>
  nonce: string | undefined
  page: Record<string, unknown> | undefined
}): AsyncGenerator<string> {
  let first = true
  const failed: string[] = []
  for (const use of o.uses) {
    let made: Drawn
    try {
      made = await o.alone(use)
    } catch {
      failed.push(use.name)
      continue
    }
    // An asking still on its way when the passes are used up is asked by the page once it has come alive.
    const told = made.answers.map((one): Answered => {
      if (one.later !== true) return one
      const { later: _, ...asked } = one
      return { ...asked, left: 'open' }
    })
    yield partPiece(use.name, made.html ?? '', told, o.nonce, first, first ? o.page : undefined)
    first = false
  }
  if (failed.length || (first && o.page)) yield openPiece(failed, [], o.nonce, first, first ? o.page : undefined)
  yield lastPiece()
}

/** Whether an asking that a draw met waits for nothing, or is an entry of the `data` of a component: of a part. */
const inPart = (one: Answered): boolean => one.later !== true || (one.of !== undefined && one.entry !== undefined)

/**
 * Takes askings on their way, a time in milliseconds, and whether all are waited for. Answers once all of them,
 * or one of them, has come, or once the time is up, whichever is first: true where it was not the time.
 */
async function settledWithin(askings: Promise<void>[], ms: number, all: boolean): Promise<boolean> {
  if (!askings.length) return true
  let timer: ReturnType<typeof setTimeout> | undefined
  const up = new Promise<false>((done) => {
    timer = setTimeout(() => done(false), Math.max(0, ms))
  })
  const came = (all ? Promise.all(askings) : Promise.race(askings)).then(() => true as const)
  try {
    return await Promise.race([came, up])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The pieces that follow the first of a streamed page. As an asking comes, the page is drawn again with every
 * answer so far, and each use that the page shows waiting and that came is sent as its part, with the answers
 * that came since the last piece. When nothing waits, or the time of the stream is up, the places that still wait
 * are emptied and their entries are told to the page record as open, for the page to ask; then the document ends.
 */
async function* streamed(o: {
  first: Drawn
  deadline: number
  waiting: Map<string, Promise<void>>
  drawAgain(pending: string[]): Promise<Drawn>
  nonce: string | undefined
}): AsyncGenerator<string> {
  let pending = o.first.waiting ?? []
  // What the page record holds of each asking, as it was sent so far.
  const told = new Map(o.first.answers.map((one) => [keyOf(one.what, one.input), one]))
  let first = true
  while (pending.length && performance.now() < o.deadline) {
    // What came before the pieces were asked for is drawn at once; nothing on its way and nothing come is the end.
    const coming = [...o.waiting.values()]
    if (coming.length && !(await settledWithin(coming, o.deadline - performance.now(), false))) break
    let again: Drawn
    try {
      again = await o.drawAgain(pending)
    } catch {
      // A view that fails with what came is drawn by the page, which shows its `error` screen.
      break
    }
    const came = pending.flatMap((name) => {
      const html = partIn(again.html ?? '', name)
      return html === undefined ? [] : [{ name, html }]
    })
    // What came is told with the first part that is sent after it.
    for (const one of again.answers) {
      const key = keyOf(one.what, one.input)
      if (!told.has(key)) told.set(key, { ...one, later: true })
    }
    if (!came.length) {
      if (!o.waiting.size) break
      continue
    }
    const fresh = again.answers.filter(
      (one) => one.later !== true && told.get(keyOf(one.what, one.input))?.later === true,
    )
    for (const one of fresh) told.set(keyOf(one.what, one.input), one)
    for (const [k, one] of came.entries()) {
      yield partPiece(one.name, one.html, k === 0 ? fresh : [], o.nonce, first)
      first = false
    }
    pending = again.waiting ?? []
  }
  // What still waits is asked by the page once it has come alive, as an entry that says `wait: false` is.
  const open = [...told.values()].flatMap((one) => {
    if (one.later !== true) return []
    const { later: _, value: __, mark: ___, ...asked } = one
    return [{ ...asked, left: 'open' as const }]
  })
  yield openPiece(pending, open, o.nonce, first)
  yield lastPiece()
}

/**
 * What the engine tells a draw of a picture of the app, where the caller may have it: its width, and the tiny copy
 * of a file that has one. An asset is everyone's, and has no tiny copy.
 */
function pictureFor(
  o: Opened,
  caller: Caller,
  src: { asset: string } | { file: string },
): { tiny?: string; width?: number } | undefined {
  if (!('file' in src)) {
    const width: unknown = Reflect.get(Object(Object(o.description.assets)[src.asset]), 'width')
    return typeof width === 'number' ? { width } : undefined
  }
  const file = fileRow(o, src.file)
  if (!file || !mayDownload(o, caller, file, visitorNow())) return undefined
  const told = {
    ...(file.tiny === undefined ? {} : { tiny: file.tiny }),
    ...(file.width === undefined ? {} : { width: file.width }),
  }
  return Object.keys(told).length ? told : undefined
}

/** What the row of a request says of an outcome that is no failure of code: its code, and why. */
const refusal = (code: string, message: string): TentError => new TentError(code, message)

const notRead = (what: string): TentError =>
  new TentError('T0001', `No query and no action named ${JSON.stringify(what).slice(0, 80)} can be read.`, {
    fix: 'An entry of `data` reads a query or an action of the app.',
  })
