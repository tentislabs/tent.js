import type { Definition, Marker } from '../definition.ts'
import { record } from '../definition.ts'
import type { Asset, Secret, Setting } from '../helpers/references.ts'
import type { FileStoreWord } from '../helpers/s3.ts'
import type { AnyoneRule, Rule } from '../helpers/rules.ts'
import type { Type } from '../type.ts'

/** A state: its type, or its type with where it is kept. */
type State = Type | { type: Type; in?: 'address' | 'device' | 'browser'; back?: boolean; reset?: readonly string[] }

/** A line of the head of a page. */
type HeadLine =
  | { meta: Record<string, string> }
  | { link: Record<string, string | Asset> }
  | { script: Record<string, string | boolean | Asset> }

/** A record of units, each with the most of it for a day. */
type Units = Record<string, number>

/** A kind of worker that heavy work may name. */
interface WorkerKind {
  about?: string
  atOnce?: number
  wait?: string
  queue?: number
  order?: 'waited' | 'oldest'
  turns?: 'caller'
  place?: 'spread' | 'pack'
  loaded?: 'first' | 'no'
  alone?: false | number
  idleAfter?: string
  mayStop?: boolean
  lost?: number
  next?: { kind: string; after: readonly ('lost' | 'wait' | 'memory')[] }
  orHere?: boolean | 'busy'
  outside?: 'writer' | { services?: 'writer'; models?: 'writer'; fetch?: 'writer' }
  systemWork?: false
  limits?: { perDay?: Units; perCallerPerDay?: Units; atLimit?: 'wait' | 'fail' }
  countBy?: 'app'
}

/** What the project states for the MCP door. */
interface Mcp {
  toolsListed?: number
  asks?: 'engine' | 'client' | readonly string[]
  only?: 'queries' | readonly (string | Marker)[]
  clients?: readonly ({ id: string; name?: string; redirects?: readonly string[]; for?: 'mcp' | 'app' } | AnyoneRule)[]
  on?: Record<string, string | Marker>
  anyone?: boolean
  stream?: boolean
  scopes?: Record<string, readonly (string | Marker)[]>
  inline?: string | number
  names?: Record<string, string>
}

/** The Python of the project, and what its lock is made with. */
interface Python {
  version?: string
  index?: readonly (string | { url: string; user?: Secret; password?: Secret })[]
  build?: readonly string[]
  own?: { version: string; address: string; fingerprint: string }
  locks?: Record<string, { version?: string }>
}

/** The ways out of the content policy of a page, each of which opens one thing. */
interface Unlock {
  scripts?: readonly string[]
  styles?: readonly string[]
  fonts?: readonly string[]
  frames?: readonly string[]
  styleTags?: boolean
  wasm?: boolean
  blobWorkers?: boolean
  eval?: boolean
  camera?: boolean
  location?: boolean
  microphone?: boolean
  more?: Record<string, readonly string[]>
}

/** The options of `project`. */
interface ProjectOptions {
  title?: string
  languages?: readonly string[]
  zone?: string
  currency?: string
  icon?: Asset
  head?: readonly HeadLine[]
  html?: Record<string, string>
  state?: Record<string, State>
  signInPath?: string
  identify?: (o: never) => string | undefined | Promise<string | undefined>
  onRequest?: (
    request: Request,
    next: (request: Request) => Promise<Response>,
    about: never,
  ) => Response | Promise<Response>
  uploads?: Rule
  images?: { widths?: readonly number[]; formats?: readonly ('avif' | 'webp')[] }
  cookies?: { sameSite?: 'lax' | 'none'; domain?: string }
  cli?: { name?: string; names?: Record<string, string>; login?: 'key' }
  mcp?: Mcp
  python?: Python
  describeTo?: Rule
  api?: { names?: Record<string, string>; headers?: readonly string[]; origins?: readonly string[] | AnyoneRule }
  roots?: readonly string[]
  trailingSlash?: 'strip' | 'keep'
  settings?: Record<string, { type: Type; public?: boolean }>
  mail?: { from: string | { name: string; address: string }; send?: Secret | string }
  files?: { store?: FileStoreWord }
  limits?: Record<string, number | string>
  redirects?: readonly { from: string; to: string; permanent?: boolean }[]
  hosts?: readonly string[]
  unlock?: Unlock
  privateHosts?: readonly string[]
  hold?: true | { net?: readonly string[]; programs?: readonly string[]; native?: readonly string[] }
  countBy?: 'app' | 'caller' | 'limits'
  workers?: Record<string, WorkerKind>
  backups?: {
    every?: string | false
    keep?: number
    beforeChanges?: boolean
    test?: boolean
    archive?: boolean
    store?: FileStoreWord
  }
  history?: { leave?: readonly string[] }
  publish?: { health?: string | Marker; within?: string }
  cache?: { keysHeader?: string }
  release?: {
    gradual?: boolean
    steps?: readonly number[]
    every?: string
    watch?: { failures?: number; slower?: number; slowerBy?: string; calls?: number }
  }
  // The share of the page views whose speed is measured in the browsers of real visitors.
  vitals?: { share?: number }
  trace?: { share?: number; otlp?: { url: string | Setting; headers?: Record<string, string | Secret | Setting> } }
  removed?: readonly string[]
  build?: { vite?: (config: never) => unknown }
  was?: string | readonly string[]
}

/** What `project` returns: a record that carries its options, which backend code reads. */
type ProjectDefinition<Name extends string, Options> = Definition<'project', Name, Options>

/** Takes the name of the app and the options of the project. Answers the definition, which only records them. */
export function project<const Name extends string, const Options extends ProjectOptions>(
  name: Name,
  o: Options & {
    [Unknown in Exclude<keyof Options, keyof ProjectOptions>]: never
  },
): ProjectDefinition<Name, Options>
export function project(name: string, o: object): object {
  return record('project', name, o)
}
