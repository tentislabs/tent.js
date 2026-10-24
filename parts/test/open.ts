import { TentError } from '../core/index.ts'
import { limitDefaults } from '../core/internal.ts'
import type { App, BrowserEngine } from '../engine/index.ts'
import { browsed, drivenSession } from '../engine/index.ts'
import type { TestCaller } from './as.ts'
import type { TestClock } from './clock.ts'
import { aheadOf, onMoved } from './clock.ts'
import { keptIn } from './looks.ts'
import type { Page } from './page.ts'
import { closePage, pageOf } from './page.ts'
import { preloadText } from './preload.ts'
import { withinStep } from './withinStep.ts'

/** How `app.open` opens a page: as whom, in a window of what size, dark or light, in which language and engine, and with what props a component drawn alone. */
export interface OpenOptions {
  as?: TestCaller
  size?: [number, number]
  dark?: boolean
  language?: string
  engine?: BrowserEngine
  props?: Record<string, unknown>
}

/** A component as a test names it to open it alone: its definition. */
export interface Alone {
  readonly definition: string
  readonly kind?: string
}

/** What the test app holds of the pages it opened: each one, the clock they follow, and the folder of the project. */
export interface Pages {
  open: Set<Page>
  clock: TestClock
  folder: string
}

/** The longest that a step of a page may take, in milliseconds: `limits.testStep` of the project. */
const stepOf = (app: App): number => {
  const stated: unknown = Reflect.get(Object(app.description.project.limits), 'testStep')
  return typeof stated === 'number' ? stated : Number(limitDefaults.project.testStep)
}

/** The address that a test opens: a path of the app, or the address of a component drawn alone with its props. */
function addressOf(target: string | Alone, props: Record<string, unknown> | undefined): string {
  if (typeof target !== 'string') {
    const name = String(target.definition)
    return `/_t/part/${encodeURIComponent(name)}?props=${encodeURIComponent(JSON.stringify(props ?? {}))}`
  }
  if (!target.startsWith('/') || target.startsWith('//'))
    throw new TentError(
      'T0002',
      'A page is opened at a path of the app, which starts with one slash, or for a component.',
      {
        fix: "Name a path, as `app.open('/orders')`, or a component, as `app.open(Badge, { props })`.",
      },
    )
  return target
}

/** Throws what the engine answers a component drawn alone with, where it answers no page. */
async function refusedAlone(app: App, address: string): Promise<void> {
  const answer = await app.request(new Request(address))
  if (answer.ok) return
  const told: unknown = await answer.json().catch(() => undefined)
  const error: Record<string, unknown> = Object(Reflect.get(Object(told), 'error'))
  throw new TentError(String(error.code ?? 'T0001'), String(error.message ?? `The engine answered ${answer.status}.`))
}

/**
 * `app.open(path, o)`: opens the address of the app in a real browser, as nobody or as the user that `as` names, by
 * the cookie of a session made as `app.session` makes one, set into the browser before its first request and ended
 * when the page closes, and answers the page once it has landed. `app.open(Component, { props })` opens a component
 * alone, at `/_t/part/<component>`, which only the mode `test` answers. The window is 1280 by 800 where `size` names
 * none. The app is the one that runs on the machine of the test app now.
 * Throws T0002 for an address that is no path of the app, T0016 where the browser cannot be had, and T0008 where
 * the page does not land within `limits.testStep`.
 */
export const opener =
  (appNow: () => App, pages: Pages) =>
  async (target: string | Alone, o: OpenOptions = {}): Promise<Page> => {
    const app = appNow()
    const path = addressOf(target, o.props)
    const [width, height] = o.size ?? [1280, 800]
    // A session of a browser that the program drives: it ends no session of the user's own, and ends with the page.
    const session = o.as === undefined || o.as === 'nobody' ? undefined : drivenSession(app, o.as)
    const cookie = session?.cookie
    const split = cookie?.indexOf('=') ?? -1
    const driven = await browsed(app, {
      engine: o.engine ?? 'chromium',
      size: { width, height },
      dark: o.dark === true,
      ...(o.language === undefined ? {} : { language: o.language }),
      preload: preloadText(aheadOf(pages.clock)),
      ...(cookie === undefined ? {} : { cookie: { name: cookie.slice(0, split), value: cookie.slice(split + 1) } }),
    }).catch(async (error: unknown) => {
      await session?.end()
      throw error
    })
    let stop = (): void => undefined
    const step = stepOf(app)
    // Each answer of the browser is waited for a step at most, whatever the page holds.
    const within = withinStep(driven, step)
    const made = pageOf({
      browsed: within,
      app,
      step,
      closed: () => {
        stop()
        pages.open.delete(made.page)
        void session?.end()
      },
    })
    pages.open.add(made.page)
    stop = onMoved(pages.clock, made.moved)
    keptIn(made.page, pages.folder)
    try {
      // A component whose props do not fit is refused as the engine refuses it, and is no page.
      if (typeof target !== 'string') await refusedAlone(app, `${driven.origin}${path}`)
      await within.go(`${driven.origin}${path}`)
      await made.landed()
      return made.page
    } catch (error) {
      await closePage(made.page)
      throw error
    }
  }
