import type { Drawable } from '../borrowed/react.ts'
import type { CallState } from '../handed.ts'
import type { StateEntry, StubbedDefinition } from '../../core/internal.ts'
import type { FollowedRun } from './followed.ts'
import type { Words } from './spoken.ts'
import type { Answered, Page, ViewRecord } from './types.ts'

/** The edge that a screen opened above stands along, where it stands in the middle of the window by none. */
export type Side = 'top' | 'bottom' | 'start' | 'end'

/** How the page code asks a query or an action, on the server and in the browser. */
interface Asked {
  entry?: string
  of?: string
  needed?: boolean
  wait?: boolean
  // How often an action is asked again while its screen is shown, in milliseconds.
  every?: number
  // What is asked, where its view knows: `'query'` or `'action'`. An action is not asked again after a call.
  kind?: string
  // What is asked is a query that is live: a living page watches it, and is sent what changes.
  live?: boolean
}

/** An optimistic result of a call: the query it changes, and what makes that result of the held answer. */
export interface OptimisticResult {
  what: string
  // Handed what the asking answers now, the input of the call, and the input of the asking.
  to(value: unknown, input: unknown, asked?: unknown): unknown
}

/** What one page holds while it is drawn and while it lives: its record, its answers, its state and its calls. */
export interface PageStore {
  // The record of the page as it is now: a living page takes a new one when it asks for its screen again.
  page: Page
  // The words of the language of the page, over those of the default language and the framework's own.
  words: Words
  // Whether every address that the page writes for a screen ends in a slash: `trailingSlash: 'keep'`.
  slashed?: boolean
  // The declared state, by its name: what the address and the device gave, and what `set` changed.
  state: Record<string, unknown>
  // Every asking that was met, by what it asks and its input.
  answers: Map<string, Answered>
  // What each entry of `data` was last answered: its name keeps that answer while a new one is on its way.
  shown: Map<string, Answered>
  calls: Record<string, CallState>
  // The record of a screen or of a component, by its name.
  view(name: string): ViewRecord | undefined
  // What a screen holds of a definition that its stored `data` names.
  stub(name: string): StubbedDefinition | undefined
  // The address of an asset, by its name.
  asset(name: string): string | undefined
  // The width and the height of a picture that is an asset, as the build read them from its file.
  sizeOf?(name: string): { width: number; height: number } | undefined
  // The hosts that the project lists: a page loads a picture from no other host.
  hosts(): string[]
  // Asks at once where it can, and answers nothing while an answer is on its way.
  ask(what: string, input: unknown, o: Asked, again?: boolean): Answered | undefined
  // In a browser: follows a run over the live connection, and answers what stops following it. `heard` is called
  // each time what the page holds of the run changed, which `followed` answers.
  follow?(run: string, heard: () => void): () => void
  followed?(run: string): FollowedRun | undefined
  // Calls a function through the door, and answers a promise of what it answered. `optimistic` is shown at once, for
  // every use of its query on the page, until the engine has said what the call changed. `held` is told when the
  // call is held for want of a connection, and when it is no longer.
  call(
    name: string,
    input: unknown,
    o?: { optimistic?: OptimisticResult | false; held?: (on: boolean) => void },
  ): Promise<unknown>
  // In a browser: the moves the page made between screens, each with the screen it went to and how long it took.
  moves?(): { screen: string; ms: number }[]
  // The record of the screen that the page shows now.
  screen(): ViewRecord | undefined
  // Is told that the page was drawn: what was not asked since the last drawing is shown no more, and watched no more.
  drawn(): void
  // Moves to an address of the app: after the page in the history of the browser, or in its place. A path of the
  // app is shown in the language of the page, or in the one that `language` names.
  goTo(
    address: string,
    o?: { replace?: boolean; keep?: boolean; above?: boolean; side?: Side; language?: string; from?: Element },
  ): void
  // In a browser: the screen that is opened above the one that is shown, with its record and its own state.
  upper?():
    | {
        page: Page
        state: Record<string, unknown>
        set(values: Record<string, unknown>): void
        from?: Element
        side?: Side
      }
    | undefined
  // Closes the screen above, and puts the address of the screen underneath back.
  closeAbove?(): void
  // In a browser: prefetches the screen of an address for a move to it, as a link that is hovered does.
  prefetch?(address: string): void
  // In a browser: the component that stands in the place of the screen while a move takes long, where the old
  // screen names one with `loading`.
  loading?(): ViewRecord | undefined
  // Changes declared state, and has the page drawn again. A value is held to its type, one that is nothing sets
  // nothing, and each state is written where it lives. `press` says that a press made the change, which adds a
  // step to the browser's history for a state that says `back: true`.
  set(values: Record<string, unknown>, how?: { press?: boolean }): void
  // What stands after the question mark of the address that is shown, as far as a use of a component reads its
  // own state from it.
  search(): { getAll(name: string): string[] }
  // The address that the page shows: its path, with what stands after the question mark.
  shows(): string
  // Is told that a use of a component changed a state that it keeps in the address: the `id` of the use, its
  // states, their values, and whether the change is one more step of the history.
  wrote(under: string, entries: Record<string, StateEntry>, values: Record<string, unknown>, step: boolean): void
  // Tells the page that what it holds changed, so that it is drawn again.
  changed(): void
  listen(heard: () => void): () => void
  // A number that grows with every change, which a drawing reads to know that it is old.
  turn(): number
  // In a browser: a number that grows each time the views start anew, as where the page follows another version by
  // asking for its screen again, or the mark of Fast Refresh resets the screen that is shown.
  anew?(): number
  // In the inspect mode: the token of it, which a form that is sent with no script carries to the page it leads to.
  inspectToken?: string
  // The number of the next form of the draw, which names a form that has no id in a send with no script.
  formPlace?(): number
  // On a server that draws a screen before the call of a form that was sent there with no script: the form that
  // was sent, which tells where its `then` goes with what the call answers.
  sending?: string
  thenFound?(follow: (answer: unknown) => string | undefined): void
  // On a server: the HTML of a part that is drawn on the server alone, drawn apart from the page, and the uses of
  // such parts that the draw met, each with its HTML.
  drawnAlone?(drawn: Drawable): Promise<string>
  partsMet?: { component: string; props: Record<string, unknown>; html: string }[]
  // In a browser: asks the server for a part that is drawn on the server alone, with the properties it is given.
  drawnPart?(component: string, props: Record<string, unknown>): Promise<{ html: string; mark: string } | undefined>
  // On a server: is told each picture of the app that the draw meets, with the widths it may be asked in, and
  // answers what the engine knows of it, which the page record then holds. A page in a browser reads that record.
  // A picture that loads with the page is named ahead in the head, with the widths it is asked in.
  pictureMet?(
    source: { asset: string } | { file: string },
    widths: number[],
    ahead?: PictureAhead,
  ): PictureTold | undefined
  picturesMet?: Map<
    string,
    { src: { asset: string } | { file: string }; widths: number[]; told?: PictureTold; ahead?: PictureAhead }
  >
  // In a browser: is told that a view draws a tag of a part of the page code which the page does not hold yet.
  // The page loads the part, and is drawn again when it is there.
  needs?(part: string): void
  // On a server, in a draw of a page that is streamed: takes a use of a component by its name and the answers of
  // its `data`, what it drew where none of them waits, and what the use was given. Answers what stands in its place.
  streamed?(
    name: string,
    answers: Record<string, Answered | undefined>,
    drawn: Drawable | undefined,
    given: Record<string, unknown>,
  ): Drawable
}

/** A picture that is named ahead in the head: its address, its widths as `srcset` writes them, and its `sizes`. */
export interface PictureAhead {
  src: string
  srcSet?: string
  sizes?: string
}

/** What the engine knows of a picture of the app: its tiny copy, and in an exported page its files by width. */
interface PictureTold {
  tiny?: string
  files?: Record<number, string>
  // In an exported page: the files in each other format that was written, by its kind and then by the width.
  formats?: Record<string, Record<number, string>>
  // The width of the picture as it is, which the image door never scales up.
  width?: number
}

/** A value as one text, with the keys of every record in the order of their names: two inputs that are equal give one text. */
function textOf(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(textOf).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value).sort()
    return `{${keys
      .filter((key) => Reflect.get(value, key) !== undefined)
      .map((key) => `${JSON.stringify(key)}:${textOf(Reflect.get(value, key))}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** What an asking is kept under: what it asks, and its input. */
export const askingOf = (what: string, input: unknown): string => `${what} ${textOf(input ?? {})}`

/** The calls of a page as a view reads them: an entry is there for every name, before any call. */
export function callsOf(held: Record<string, CallState>): Record<string, CallState> {
  const idle: CallState = Object.freeze({ busy: false })
  return new Proxy(held, {
    get: (target, name) => (typeof name === 'string' ? (target[name] ?? idle) : undefined),
    has: (_, name) => typeof name === 'string',
    getOwnPropertyDescriptor: (target, name) =>
      typeof name === 'string'
        ? { value: target[name] ?? idle, configurable: true, enumerable: Object.hasOwn(target, name), writable: false }
        : undefined,
  })
}
