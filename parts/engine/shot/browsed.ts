import { TentError } from '../../core/index.ts'
import { drawnAt } from './routes.ts'
import type { App } from '../app.ts'
import { openedOf } from '../app.ts'
import { heldOpen } from '../opened.ts'

/** The engines of a browser that a program can have the engine drive. */
export type BrowserEngine = 'chromium' | 'firefox' | 'webkit'

/**
 * How a page of a driven browser is opened: its window, its dark setting, its language, a script it runs first, and
 * a cookie of the app that it holds from its first request.
 */
export interface BrowserOpening {
  engine: BrowserEngine
  size: { width: number; height: number }
  dark: boolean
  language?: string
  // The text of a function that each document of the page runs before its own scripts.
  preload?: string
  // A cookie of the app, as the cookie of a session that `app.session` answered: set with the marks of the engine's own.
  cookie?: { name: string; value: string }
}

/**
 * A page of a browser that the engine drives for a program, on one app: Chromium over its own channel, Firefox and
 * WebKit over WebDriver BiDi. Every request of it that leaves for another place than the app is made by the engine,
 * held to the rule of the guarded fetch. It carries the cookie `tent_test`, by which an app in the mode `test` knows
 * that a test drives the page.
 */
export interface Browsed {
  readonly engine: BrowserEngine
  // Where the browser reaches the app: its scheme, its name and its port.
  readonly origin: string
  /** Loads an address in the page. */
  go(address: string): Promise<void>
  /**
   * Runs an expression in the document that the page shows, awaits it where it is a promise, and answers its value
   * as JSON reads it. Throws what the expression threw, and where the document went away meanwhile.
   */
  evaluate(expression: string): Promise<unknown>
  /** Presses the left button of the mouse at a point of the window, as a person does. */
  click(at: { x: number; y: number }): Promise<void>
  /** Types the text where the focus is, as a person types it. */
  type(text: string): Promise<void>
  /** Presses the key Enter where the focus is. */
  enter(): Promise<void>
  /** Hands the element of a file field that the expression answers the files that lie at these paths. */
  files(expression: string, paths: string[]): Promise<void>
  /** A picture of the window, or with `full` of the whole height of the page, as the bytes of a PNG file. */
  picture(o?: { full?: boolean }): Promise<Uint8Array>
  /** What the page wrote to its console and what it threw, each as a line, in order. */
  console(): string[]
  /** Puts the text of a function in the place of the one that each document of the page runs before its own scripts. */
  preload(text: string): Promise<void>
  /** Answers when the page has loaded a document after this call. */
  loaded(): Promise<void>
  /** Ends the browser. */
  end(): Promise<void>
}

/**
 * Takes an app that this program holds, and how the page is opened. Starts a browser of that engine with no window,
 * in a folder of its own, and answers a page of it on the app, at no address yet. Throws T0016 where no browser of
 * the engine can be had, and with `fields.engine` set to `notRun` where the engine does not speak the protocol it
 * is driven by on this computer.
 */
export async function browsed(app: App, opening: BrowserOpening): Promise<Browsed> {
  const o = openedOf(app)
  if (!o) throw new TentError('T0013', 'A page of a browser is opened on an app that this program holds.')
  heldOpen(o)
  const at = drawnAt(o)
  if (opening.engine === 'chromium') {
    const { chromiumPage } = await import('./chromium.ts')
    return chromiumPage(o, at, opening)
  }
  const { bidiBrowser } = await import('./bidiBrowser.ts')
  return bidiBrowser(o, at, opening)
}
