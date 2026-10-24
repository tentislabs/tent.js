import type { anyone, Handed, role, Settings, Type, User, WireError } from '../core/index.ts'
import type { AppState } from './names.ts'
import type { Read } from './read.ts'
import type { Travelled } from './travelled.ts'

/** The rule of a screen: who may be shown it. */
export type Access = 'signedIn' | 'anyone' | 'nobody' | ReturnType<typeof role> | ReturnType<typeof anyone>

/** One declared state: its type, or its type with where it is kept. */
export type StateEntry =
  | Type
  | { type: Type; in?: 'address' | 'device' | 'browser'; back?: boolean; reset?: readonly string[] }

/** The declared state of a view, each by its name. */
export type StateFields = { readonly [name: string]: StateEntry }

/** The values of a declared state, each as a view is handed it. */
type StateValues<State> = {
  -readonly [Name in keyof State]: State[Name] extends { type: infer Kept }
    ? Travelled<Handed<Kept>>
    : Travelled<Handed<State[Name]>>
}

/** What the calls of a view are doing, each by the `id` of its form or the name of its entry of `data`. */
export interface CallState {
  busy: boolean
  // Held by the page for want of a connection: it goes when the connection is back. It is `busy` too.
  held?: boolean
  error?: WireError
  value?: unknown
}

/** The entries of `data`, each as its view is handed it: the answer of what it reads. */
export type DataValues<Data> = {
  -readonly [Name in keyof Data]: Data[Name] extends Read<infer Answer> ? Answer : unknown
}

/** What `data` is written over where it is an arrow: the names its inputs may read. */
export interface DataHanded<State> {
  params: Record<string, string>
  state: StateValues<State> & AppState
  user: User | undefined
  settings: { [Name in keyof Settings]?: Settings[Name] }
}

/** Whether a rule lets in a caller who is not signed in. */
type LetsVisitorsIn<Rule> = Rule extends 'anyone' | { rule: 'anyone' } ? true : false

/** What every view is handed beside its data: the address, the state, who looks, and what its calls are doing. */
export interface EveryHanded<State, Rule> {
  params: Record<string, string>
  state: StateValues<State> & AppState
  user: LetsVisitorsIn<Rule> extends true ? User | undefined : User
  language: string
  settings: { [Name in keyof Settings]?: Settings[Name] }
  calls: Record<string, CallState>
  set(values: Partial<StateValues<State> & AppState>): void
  above: boolean
}

/** What the view of a screen is handed: each name of its `data`, and what every view is handed. */
export type ViewHanded<Data, State, Rule> = DataValues<Data> & EveryHanded<State, Rule>
