import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import type { Mode } from '../../data/index.ts'
import { sqliteStore } from '../../data/index.ts'
import type { App } from '../app.ts'
import type { Machine, MachineTold } from '../copy/machine.ts'
import type { OpenCounting } from '../counts/options.ts'
import { list as handleList } from '../handles/list.ts'
import { makerSecrets } from '../handles/secrets.ts'
import type { Lease, MakerInput, Makers } from '../makers.ts'
import { systemClock } from '../makers.ts'
import type { Identify } from '../open.ts'
import type { Events, Opened } from '../opened.ts'
import type { Room } from '../rooms/room.ts'
import type { PartsFrom } from '../parts.ts'
import type { Sleeper } from '../sleep/sleeper.ts'
import type { About, Came } from '../web/proxy.ts'
import type { Listening } from '../web/secureWeb.ts'
import type { WorkerKey } from '../work/keys.ts'

/** What an engine hands the opening of an app: where it is reached, its makers, and how it tells its events. */
export interface Program {
  // Starts the web side where it does not run yet, and answers the port that it listens on. `at` is the first app.
  listening(at?: Listening): Promise<number>
  // What the engine knows of a request, by the proxies it was told of.
  about(came: Came, headers: Headers): About
  token: string
  // `web.openTime` and `web.stopTime` of the engine, in milliseconds.
  waits: { open: number; stop: number }
  makers: Makers
  // Where the engine takes the parts that are fetched at their first use, where its program says so.
  parts?: PartsFrom
  raise<Event extends keyof Events>(event: Event, told: Events[Event]): void
  // Is told each app that opened, and each that closed.
  opened(o: Opened): void
  left(o: Opened): void
  // Is told each app that fell asleep, which a request for one of its names wakes, and each that woke or was closed.
  asleep?(sleeper: Sleeper): void
  awake?(sleeper: Sleeper): void
}

/** What one opening works on: the folder that was claimed, the version to run, and what the app is among its machines. */
export interface Opening {
  dataFolder: string
  // The folder that holds the version, its description and its id.
  bundleFolder: string
  description: Description
  version: string
  mode: Mode
  address?: string | string[]
  told: MachineTold
  // The makers that the opening of this app was handed, which win over those of the engine.
  makers?: Makers
  // Whether mail is sent where the mode would write it to the log.
  sendMail?: boolean
  // Whether the rows past the time their table keeps them are removed where the mode would keep them.
  keepRows?: boolean
  // The keys of the workers that the app lets join.
  workers?: WorkerKey[]
  // The app that is opened again, which stays the object it was.
  app?: App
  // What the host opened the app with for its counts.
  counting?: OpenCounting
  // The `identify` that the program hands the app in place of the project's, and the sites that may frame it.
  identify?: Identify
  framedBy?: string[] | 'anyone'
}

/** A refusal of an opening: its code, its words, and what mends it. */
export const refused = (code: string, words: string, fix: string): TentError => new TentError(code, words, { fix })

/**
 * What an opening holds while it is under way: what the engine will hold of the app, and each thing that the
 * opening started, with what takes it back.
 */
export interface UnderWay {
  program: Program
  w: Opening
  o: Opened
  // What a maker is handed.
  input: MakerInput
  // The lease that a maker made, where the program has one.
  leased?: Lease
  // What takes back each thing that was started, in the order it was started: a failed opening calls them from the last.
  started: (() => void | Promise<void>)[]
  // The app and its machine are made late: what the engine holds of the app answers them from then on.
  setApp(app: App): void
  setMachine(machine: Machine): void
  machine(): Machine | undefined
}

/** The name of an address, with its port, as a request names it: nothing for a text that is no address. */
function nameOf(address: string | undefined): { host: string; scheme: string } | undefined {
  try {
    const url = new URL(address ?? '')
    return { host: url.host.toLowerCase(), scheme: url.protocol.replace(/:$/, '') }
  } catch {
    return undefined
  }
}

/**
 * Takes what the engine hands an opening and what the opening works on. Answers the frame of the opening: what
 * the engine holds of the app, with nothing opened yet, its handles, and the clock and the lease of the makers.
 */
export async function frameOf(program: Program, w: Opening, room: Room): Promise<UnderWay> {
  const { dataFolder, description, version, mode } = w
  const handles = new Map<string, object>()
  let app: App | undefined
  let machine: Machine | undefined
  const own = nameOf(w.told.own)
  const o: Opened = {
    name: description.app.name,
    mode,
    dataFolder,
    bundle: w.bundleFolder,
    version,
    description,
    store: sqliteStore(),
    clock: systemClock,
    log: {
      write: () => undefined,
      writeAll: () => undefined,
      rows: () => [],
      withTrace: () => [],
      traceOfRun: () => undefined,
      last: () => 0,
      dropBefore: () => 0,
      forget: () => 0,
      close: () => undefined,
    },
    room,
    runs: new Map(),
    allows: new Map(),
    rules: {},
    handles,
    // The room is closed with what the makers made.
    made: [room],
    before: [],
    inFlight: new Set(),
    closed: false,
    token: program.token,
    ...(w.workers ? { workerKeys: w.workers } : {}),
    ...(w.counting ? { counting: w.counting } : {}),
    ...(w.identify ? { identify: w.identify } : {}),
    ...(w.framedBy ? { framedBy: w.framedBy } : {}),
    get app(): App {
      if (!app) throw new TentError('T0013', `The app ${description.app.name} is not open yet.`)
      return app
    },
    get machine(): Machine {
      if (!machine) throw new TentError('T0013', `The app ${description.app.name} is not open yet.`)
      return machine
    },
    waits: program.waits,
    web: {
      names: () => false,
      own: (host, scheme) => own !== undefined && own.host === host.toLowerCase() && own.scheme === scheme,
      about: (came, headers) => program.about(came, headers),
    },
    raise: (event, told) => program.raise(event, told),
    left: () => program.left(o),
  }
  for (const { name, load } of handleList) handles.set(name, (await load()).handle(o))
  const input: MakerInput = {
    dataFolder,
    // A maker runs before any call: the secrets it is handed open with `reveal()` there.
    secrets: makerSecrets(o),
    settings: handles.get('settings') ?? {},
    // A request of the standard down the kept stream of a grant's client, loaded at its first use.
    mcp: {
      request: async (grant, method, params) =>
        (await import('../mcp/streams.ts')).mcpRequest(o, grant, method, params),
    },
  }
  const { clock, lease } = program.makers
  o.clock = clock?.(input) ?? systemClock
  const leased = lease?.(input)
  o.made.push(o.clock, ...(leased ? [leased] : []))
  return {
    program,
    w,
    o,
    input,
    ...(leased ? { leased } : {}),
    started: [],
    setApp: (made) => {
      app = made
    },
    setMachine: (made) => {
      machine = made
    },
    machine: () => machine,
  }
}
