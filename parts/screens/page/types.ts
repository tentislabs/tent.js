import type { Drawable } from '../borrowed/react.ts'
import type { OptimisticPlans } from './worked.ts'
import type { WireError } from '../../core/index.ts'
import type { Description, StubbedDefinition } from '../../core/internal.ts'

/** One asking of a query or of an action that a draw met, with what it was answered. */
export interface Answered {
  what: string
  input: unknown
  entry?: string
  of?: string
  needed?: true
  value?: unknown
  error?: WireError
  mark?: string
  later?: true
  left?: 'wait' | 'prefetch' | 'open'
}

/** A script of `head` that the page code adds: its address, when it is added, and the state of consent it waits for. */
export interface LaterScript {
  src: string
  load: 'alive' | 'idle'
  consent?: string
  async?: true
  defer?: true
  type?: string
}

/** The record of a page, which the first HTML holds as JSON and the page code reads when it comes alive. */
export interface Page {
  version: string
  mode: 'development' | 'test' | 'live'
  status: number
  screen: string
  origin: string
  path: string
  params: Record<string, string>
  state: Record<string, unknown>
  language: string
  languages: string[]
  currency?: string
  user: { id: string; roles: string[] } | null
  settings: Record<string, unknown>
  zone: string
  framedBy: string[] | 'anyone' | null
  load: { screen: string; parts: string[]; styles: string[]; messages?: string; error: string }
  exported?: true
  base?: string
  // In the mode `test`, a page of a browser that a test drives: its rows carry the marks that a test finds them by.
  tested?: true
  // In the mode `test`: the component that `screen` names is drawn alone, with these props, in the place of a screen.
  alone?: { props: Record<string, unknown> }
  // In a frame of a chat app: the pass that the frame reaches the app with, where the chat app lets it connect.
  pass?: string
  imageWidths?: number[]
  pictures?: Record<
    string,
    { tiny?: string; files?: Record<number, string>; formats?: Record<string, Record<number, string>>; width?: number }
  >
  answers: Answered[]
  error?: WireError
  // On the `error` screen: what stood after the question mark of the address that failed, which "Try again" asks
  // again as it was asked.
  search?: string
  inspect?: { origin: string }
  // The nonce of the document, which the content policy lets a style tag and a script of the head in by: a library
  // that writes style tags is handed it, by `useNonce`.
  nonce?: string
  // The scripts of `head` that the page code adds once the page lives, when the browser is idle, or on a consent.
  scripts?: LaterScript[]
  mark?: string
  // How long an optimistic result of a call is kept after its answer, in milliseconds, where the project states
  // another time than the two seconds that hold otherwise.
  optimisticKept?: number
  // How long a call is held for want of a connection, where the project states another than the usual one.
  callHold?: number
  // The plans by which the page shows a change before the engine answers it, where the screen calls one it can.
  plans?: OptimisticPlans
  // The share of page views whose speed is measured, where the project states another than the usual one.
  vitals?: number
  // How long a move may take before the loading component stands in, how long what was prefetched is kept, in
  // milliseconds, and how many prefetches are on their way at once, where the project states its own.
  loadingAfter?: number
  prefetchKept?: number
  prefetchAtOnce?: number
  parts?: { component: string; props: Record<string, unknown>; html: string }[]
  form?: { id: string; values: Record<string, unknown>; error: WireError }
  // The patterns of the routes of the app that state GET, where it has some: the page loads such a path whole, as
  // it is written, and no code of a language and no slash are added to it.
  routes?: string[]
  // On a `grant` screen: what a person is asked to allow a program, with the two presses that answer.
  grant?: GrantAsked
  // On an `ask` screen: the one call of a program that a person is asked to agree to, with the two presses.
  ask?: CallAsked
}

/** What an `ask` screen is handed: the title of the tool, its name, its input as a person reads it, and the presses. */
interface CallAsked {
  title: string
  tool: string
  input: Record<string, unknown>
  allow: PostPress
  refuse: PostPress
}

/** A press of the engine's own: a form that the page posts to an address of the engine, and then loads what it is answered. */
export interface PostPress {
  definition: string
  kind: 'post'
  post: string
  form: Record<string, string>
}

/** What a `grant` screen is handed: the client, its host, whether it named itself, what it asks for, and the two presses. */
interface GrantAsked {
  name: string
  host: string
  named: boolean
  scopes: string[]
  for: 'mcp' | 'app'
  word?: string
  allow: PostPress
  refuse: PostPress
}

/** What `draw` is handed: the description, the page, and how it asks what the views read. */
export interface DrawInput {
  description: Description
  page: Page
  // Every entry and every `useQuery` that the draw meets is asked through it.
  read(what: string, input: unknown, o?: { entry?: string; of?: string; needed?: boolean; wait?: boolean }): Answered
  // The record that the server module of each view gives as its default, by the name of the screen or component.
  views: Record<string, object>
  picture(src: { asset: string } | { file: string }):
    | {
        tiny?: string
        files?: Record<number, string>
        formats?: Record<string, Record<number, string>>
        width?: number
      }
    | undefined
  part?: { component: string; props: Record<string, unknown> }
  // The screen is asked for to be opened above another: its view is handed `above` as true, and the components
  // it sits inside are not drawn.
  above?: true
  // The page is in the inspect mode: the token of it, which a form that is sent with no script carries on.
  inspectToken?: string
  // The picture of the screen for a shared link: its component is drawn alone, handed the screen's answers, into a
  // still document of that size, which holds no page code.
  preview?: { component: string; size: readonly [number, number] }
  // The page is streamed: a use of a component whose `data` waits is drawn in its place in the first HTML, and
  // `pending` names the uses that the page was sent waiting, each of which is marked where it came.
  // `personal` names the components that answer each visitor their own: each of their uses is drawn in its place.
  stream?: { pending: string[]; personal?: string[] }
  // Told the head of the document once the screen's own entries have decided it, before the body is drawn.
  heard?(head: string): void
  // Ends the draw once it is aborted: what is drawn by then is answered, and what still waits is left to the browser.
  signal?: AbortSignal
  // The screen is drawn as it stood before the call of a form of it that was sent with no script: the form, by
  // the name it was sent under, which tells the draw its `then`.
  sending?: string
}

/** What `draw` answers: the whole document, every asking it met, and whether one of them is answered later. */
export interface Drawn {
  html?: string
  mark?: string
  answers: Answered[]
  later: boolean
  pictures: { src: { asset: string } | { file: string }; widths: number[] }[]
  // The uses of components that are drawn on the server alone that the draw met, each with its HTML.
  parts?: { component: string; props: Record<string, unknown>; html: string }[]
  // Of a draw of a page that is streamed: the uses of components that wait, each by its name of the stream.
  waiting?: string[]
  // The scripts of the head that the page code adds once the page lives, as the page record names them.
  scripts?: LaterScript[]
  // Of the same: each use of a personal component, its name of the stream, its component and what it was given.
  personal?: { name: string; component: string; given: Record<string, unknown> }[]
  // Of a draw before the call of a form that was sent with no script: where the `then` of that form goes with
  // what the call answers, a path of the app or nothing.
  goesTo?(answer: unknown): string | undefined
}

/** The record of a screen or of a component as the page code draws it: its stored fields, and its view. */
export interface ViewRecord {
  name: string
  kind: 'screen' | 'component'
  title?: unknown
  data?: unknown
  state?: Record<string, unknown>
  // Of a screen: the state that the project declares, which every view reads beside its own.
  shared?: Record<string, unknown>
  layout?: string
  loading?: string
  props?: Record<string, unknown>
  // Of a component that is drawn on the server alone: a browser holds no view of it.
  browser?: false
  view?: (handed: Record<string, unknown>) => Drawable
  // In a browser: the file of the bundle that the record came from, as a page loaded it.
  from?: string
  seo?: Record<string, unknown>
  // The stubs of the definitions that its stored `data` names.
  stubs?: Record<string, StubbedDefinition>
  // The file of each asset that the view names by a name written in place, by the name of the asset. A view that
  // draws a document of Markdown is told every asset, and the hosts that the project lists: the text names them.
  assets?: Record<string, string>
  // The width and the height of each of those assets that is a picture, as the build read them from its file.
  sizes?: Record<string, { width: number; height: number }>
  hosts?: string[]
}
