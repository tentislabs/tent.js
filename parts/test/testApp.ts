import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after } from 'node:test'
import { buildProject } from '../build/index.ts'
import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { App, Unsent } from '../engine/index.ts'
import { noteOpened, noteUnheld } from '../engine/index.ts'
import { keysOfProject, testSecrets } from './secrets.ts'
import type { Asked, TestCaller } from './as.ts'
import { as } from './as.ts'
import type { BrowserOptions, TestBrowser } from './browser.ts'
import { browser } from './browser.ts'
import type { TestClock } from './clock.ts'
import { testClock } from './clock.ts'
import { chanceOf } from './chance.ts'
import { settledOf } from './settled.ts'
import type { Alone, OpenOptions, Pages } from './open.ts'
import { opener } from './open.ts'
import type { Page } from './page.ts'
import { closePage, pagesLanded } from './page.ts'
import type { Machine, World } from './machines.ts'
import {
  closeMachine,
  killMachine,
  machineIn,
  openReader,
  openWriter,
  putBack,
  whileAlive,
  worldOf,
} from './machines.ts'
import { mailOf } from './mailbox.ts'
import type { TestRoom } from './room.ts'
import { roomMaker } from './room.ts'
import type { Mark } from './marks.ts'
import { marks } from './marks.ts'
import type { Rows } from './rows.ts'
import { rows } from './rows.ts'
import { user } from './user.ts'
import { cli } from './cli.ts'
import type { CliAsked } from './cli.ts'
import { connection } from './connection.ts'
import type { Answers, Faked } from './fake.ts'
import type { FakedModel, ModelAnswers } from './fakeModel.ts'
import { fakesOf } from './fake.ts'
import type { IncomingAsked } from './incoming.ts'
import { incoming } from './incoming.ts'
import type { KeyAsked } from './key.ts'
import { key } from './key.ts'
import { make } from './make.ts'
import type { McpAsked, TestMcp } from './mcp.ts'
import { mcp } from './mcp.ts'
import { grant } from './grant.ts'
import type { GrantGiven } from '../engine/index.ts'
import type { TestWorker, WorkerAsked } from './worker.ts'
import { workerOf } from './worker.ts'

/** What `testApp` takes. `folder` is the folder of the project, and the folder the test was started in where none is named. */
export interface TestOptions {
  folder?: string
  /** The values of secrets, by their names. Every other secret that a definition names has the value `test-<NAME>`. */
  secrets?: Record<string, string>
  /** The services that are let through to where they are: every other one fails its calls until it is faked. */
  real?: string[]
  /** Where the code of the app runs: `tenant`, the test room, which crosses every call; the room of the program where it is left out, unless the run states `TENT_ROOM=apart`. */
  room?: TestRoom
  /**
   * `'held'`: the clock of the app stands until the test moves it, with `app.clock.advance` and `app.clock.set`, as
   * the fake timers of the strongest test runners stand. Left out, it runs on with the time of the system.
   */
  clock?: 'held'
  /**
   * The seed of every number the app draws: `random()`, `token()`, `step.random()`, its row ids and `Math.random()`
   * in its code. Left out, it is the name of the test that runs, so the same test draws the same numbers everywhere.
   */
  randomSeed?: string
}

/**
 * A test app: the app of the engine, as a program holds it, with the helpers of a test beside its members.
 * `close` closes the app with its engine, and for the app that `testApp` answered every reader of it too, and
 * removes its temporary data.
 */
export interface TestApp extends App {
  /** Adds a row to `users` with those columns, as the system, and answers a caller. T0014 with no `users` table. */
  user(values?: Record<string, unknown>): Promise<Caller>
  /** Writes that many rows of a table as the system, each filled from its types where the function gives no value. */
  make(
    table: string,
    count: number,
    values?: (i: number) => Record<string, unknown>,
  ): Promise<Record<string, unknown>[]>
  /** Writes a connection of a user to a service whose sign-in is `oauth`, as a connect would. */
  connection(user: string | Caller, service: string, o?: { account?: string }): Promise<void>
  /** Stands in for an outside service with these answers, and keeps what it was sent: `app.fake(service).sent`. */
  fake(target: unknown, answers?: Answers | ModelAnswers): Faked & FakedModel
  /** Sends a call to an `incoming`, signed the way its scheme asks unless `sign` is false. */
  incoming(name: string, o?: IncomingAsked): Promise<Response>
  /** Makes a key, and answers the caller that it is and the key itself. */
  key(o?: KeyAsked): Promise<{ caller: Caller; key: string }>
  /** Runs the app's own command line with those words, and answers what it printed and how it ended. */
  cli(words: string[], o?: CliAsked): Promise<{ code: number; out: string; err: string }>
  /** A client of MCP joined to the app with no network, in the newest form or an older one, as a caller or a token. */
  mcp(o?: McpAsked): TestMcp
  /** Makes a grant, as a person who allowed a program would, and answers its id, its caller and its access token. */
  grant(o: GrantGiven): Promise<{ id: string; caller: Caller; token: string }>
  /**
   * Opens an address of the app in a real browser, as nobody or as the user that `as` names, or a component alone
   * with its `props`, and answers the page once it has landed: its steps find what they name by name, and wait for
   * what they set off by fact.
   */
  open(target: string | Alone, o?: OpenOptions): Promise<Page>
  /** Answers what calls a function as a caller, the id of a user, `'nobody'` or `'system'`, through steps 5 to 10 of the door. */
  as(caller: TestCaller): Asked
  /**
   * Answers a caller that is a browser: it keeps cookies and has an address, and each request of it passes every
   * step of the door, in the program and with no network. `as` makes it a user, by a session that `app.session` made.
   */
  browser(o?: BrowserOptions): TestBrowser
  /**
   * Every row of a table, with full access, typed by the type list of the project where it holds the name of the
   * table. Of a tenant table: the rows of the tenant that `of` names, and without it of every tenant
   * in turn.
   */
  rows: Rows
  /** The mail that was sent, in order, each as a `Mailer` is handed it: a test app sends none. */
  readonly mailbox: Unsent[]
  /** Takes a mark: the data as it is now. */
  mark(): Promise<Mark>
  /** Puts the data back as it was when the mark was taken. */
  back(mark: Mark): Promise<void>
  /** The clock of the app, which a test moves: the beats and the waits of an app on many machines run on it. */
  readonly clock: TestClock
  /**
   * A reader of this test app in the same program, joined over the link with no network. It shares the clock of
   * its writer. `far` makes it a far reader, and `own` names the address the other machines reach it by.
   */
  reader(o?: { far?: boolean; own?: string; secretKey?: string; secrets?: Record<string, string> }): Promise<TestReader>
  /**
   * A worker of this test app in the same program, joined over the link with no network: the writer is opened
   * again with the keys of its workers the first time. It shares the clock of the writer.
   */
  worker(o?: WorkerAsked): Promise<TestWorker>
  /** Ends the machine as a killed program would: nothing more is committed, answered or sent. */
  kill(): Promise<void>
  /**
   * Opens the folder again after `close` or `kill`. `reads` opens it as a reader of that app, and `at` first puts
   * the data file of that mark in place, as a disk that lost its last writes.
   */
  restart(o?: { reads?: TestApp; at?: Mark }): Promise<void>
  /**
   * Answers once no run of the app is queued or working, in every file of it: each is done, failed or stopped, or
   * waits for a time, an event or a person.
   */
  settled(): Promise<void>
}

/** A reader of a test app: a test app, and what holds its link back and cuts it. */
export interface TestReader extends TestApp {
  /** Holds back everything the link carries to it and from it. */
  hold(): void
  /** Lets go what was held back. Handed the id of a worker, it is `app.release` of the writer. */
  release(): void
  release(worker: string): boolean
  /** Closes its link, which is not opened again until `join`. */
  cut(): void
  /** Lets its link be opened again. */
  join(): void
}

// Carries work out in the context this file was loaded in, which a test file does before its tests: a hook that the
// runner is handed there is one of the whole file, also where a test or a `before` hook opened the app.
const inFile = AsyncLocalStorage.snapshot()

const removed = (folder: string): void =>
  rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })

// The machine behind each test app, by which one test app names another.
const machines = new WeakMap<object, Machine>()

/** The test app of one machine of a world: each member is answered by the app that runs there now. */
function faceOf(
  world: World,
  machine: Machine,
  moves: TestClock,
  closeAll: () => Promise<void>,
  options: TestOptions,
): TestReader {
  const app = (): App => {
    if (!machine.app)
      throw new TentError('T0013', 'This machine of the test was closed or killed.', {
        fix: 'Open it again with `restart`.',
      })
    return machine.app
  }
  // The pages that the test opened on this machine, which are closed before it is.
  const pages: Pages = {
    open: new Set(),
    clock: moves,
    folder: options.folder ? resolve(options.folder) : process.cwd(),
    ...(world.random ? { random: world.random } : {}),
  }
  const closePages = async (): Promise<void> => {
    for (const page of [...pages.open]) await closePage(page).catch(() => undefined)
  }
  world.pageEnds.push(closePages)
  const open = opener(app, pages)
  const face: App & { readonly mailbox: Unsent[] } = {
    // The mail of the test app, as the engines of its machines keep it.
    get mailbox() {
      return mailOf(world)
    },
    get description() {
      return app().description
    },
    get role() {
      return app().role
    },
    // What a member answers is answered while the machine lives: a kill refuses each call that is under way.
    call: (name, input, o) => whileAlive(machine, app().call(name, input, o)),
    page: (path, o) => whileAlive(machine, app().page(path, o)),
    session: (user) => app().session(user),
    standIn: (name, stand) => app().standIn(name, stand),
    called: (work) => app().called(work),
    request: (request, o) => whileAlive(machine, app().request(request, o)),
    live: (request) => app().live(request),
    add: (bundleFolder) => whileAlive(machine, app().add(bundleFolder)),
    switch: (version, how) => whileAlive(machine, app().switch(version, how)),
    versions: () => app().versions(),
    drop: (version) => whileAlive(machine, app().drop(version)),
    show: (findings) => app().show(findings),
    inspect: (given) => app().inspect(given),
    logs: (asked) => whileAlive(machine, app().logs(asked)),
    read: (plan, o) => whileAlive(machine, app().read(plan, o)),
    write: (writes, o) => whileAlive(machine, app().write(writes, o)),
    seed: () => whileAlive(machine, app().seed()),
    shot: (path, how) => whileAlive(machine, app().shot(path, how)),
    export: (folder, how) => whileAlive(machine, app().export(folder, how)),
    snapshot: (file) => whileAlive(machine, app().snapshot(file)),
    restore: (file) => whileAlive(machine, app().restore(file)),
    facts: (description, how) => app().facts(description, how),
    values: (asked) => whileAlive(machine, app().values(asked)),
    caller: (request) => whileAlive(machine, app().caller(request)),
    link: (request) => app().link(request),
    at: () => app().at(),
    machines: () => app().machines(),
    workers: () => app().workers(),
    work: () => app().work(),
    release: (worker) => app().release(worker),
    filled: () => app().filled(),
    takeOver: () => whileAlive(machine, app().takeOver()),
    async close() {
      await closePages()
      await closeAll()
    },
    ready: () => app().ready(),
    start: (name, input, o) => whileAlive(machine, app().start(name, input, o)),
    get runs() {
      return app().runs
    },
  }
  function release(): void
  function release(worker: string): boolean
  function release(worker?: string): boolean | undefined {
    if (worker !== undefined) return app().release(worker)
    machine.held = false
    for (const gate of machine.gates) gate.release()
    return undefined
  }
  const fakes = fakesOf(app, options.real ?? [])
  const commandLine = cli(app, () => machine.folder)
  const secretOf = (name: string): string => options.secrets?.[name] ?? `test-${name}`
  const made: TestReader = Object.assign(face, {
    user: user(face),
    make: make(face),
    connection: connection(app),
    fake: fakes.fake,
    incoming: incoming(app, secretOf),
    key: key(app),
    // A call of every other caller answers once the pages that the test opened hold what it wrote, as a step of a
    // page does.
    async cli(words: string[], o?: CliAsked) {
      const ran = await commandLine(words, o)
      await pagesLanded(pages.open)
      return ran
    },
    mcp(o?: McpAsked): TestMcp {
      const client = mcp(app, () => machine.folder)(o)
      return {
        ...client,
        async call(name: string, input?: unknown, params?: Record<string, unknown>) {
          const answered = await client.call(name, input, params)
          await pagesLanded(pages.open)
          return answered
        },
      }
    },
    grant: grant(app),
    as: as(face, () => pagesLanded(pages.open)),
    browser: browser(face, app),
    // A page runs on the browser's own timing, which no held clock reaches: a test that opens one is told so.
    open: (target: string | Alone, o?: OpenOptions) => {
      if (options.clock === 'held') noteUnheld("the browser's own timing")
      return open(target, o)
    },
    rows: rows(face),
    ...marks(face, join(world.home, `marks-${machine.address.replace(/\W+/g, '-')}`)),
    clock: moves,
    async reader(
      o: { far?: boolean; own?: string; secretKey?: string; secrets?: Record<string, string> } = {},
    ): Promise<TestReader> {
      // The machines are opened with the keys of their readers once the first reader is asked for.
      if (!world.keyed) {
        world.keyed = true
        for (const one of world.machines.values())
          if (one.app) {
            await closeMachine(one)
            await openWriter(world, one)
          }
      }
      const reader = machineIn(world, 'reader', o)
      // The writer's key of the secrets, laid into the folder of the reader as its own key file.
      if (o.secretKey !== undefined) {
        mkdirSync(reader.folder, { recursive: true })
        writeFileSync(join(reader.folder, 'secret.key'), o.secretKey)
      }
      // The secrets of the reader's own machine, which its writer never sends it.
      if (o.secrets && machine.app) {
        mkdirSync(reader.folder, { recursive: true })
        testSecrets(reader.folder, machine.app.description, o.secrets)
      }
      await openReader(world, reader, machine)
      return faceOf(world, reader, moves, () => closeMachine(reader), options)
    },
    worker: (o?: WorkerAsked) => workerOf(world, machine, o),
    kill: () => killMachine(machine),
    settled: () => settledOf(app, moves),
    async restart(o: { reads?: TestApp; at?: Mark } = {}): Promise<void> {
      await closeMachine(machine)
      if (o.at) putBack(machine, o.at.file)
      const of = o.reads ? machines.get(o.reads) : undefined
      if (o.reads && !of) throw new TentError('T0013', '`reads` of `restart` names a test app of this test.')
      if (of) await openReader(world, machine, of)
      else await openWriter(world, machine)
      fakes.standIns()
    },
    hold() {
      machine.held = true
      for (const gate of machine.gates) gate.hold()
    },
    release,
    cut() {
      machine.cut = true
      for (const gate of [...machine.gates]) gate.close()
      machine.gates.clear()
    },
    join() {
      machine.cut = false
    },
  })
  machines.set(made, machine)
  // A service that the test did not fake reaches nothing outside, from the opening on.
  if (machine.app) fakes.standIns()
  return made
}

/**
 * Takes the options of a test app. Builds the project, opens it in an engine of its own, on empty temporary data
 * and in the mode `test`, where it answers on every name, and applies the seed. Answers the test app. The promise
 * is refused with the first error of the build where the project does not build, and with what the engine refused
 * the opening with, and nothing is left behind then.
 */
export async function testApp(options: TestOptions = {}): Promise<TestApp> {
  const project = resolve(options.folder ?? process.cwd())
  // Under `tent test`, an app opened by a hook of a whole file is shared by its tests, which then run whole.
  noteOpened()
  const home = mkdtempSync(join(tmpdir(), 'tent-test-'))
  const { clock, moves } = testClock({ held: options.clock === 'held' })
  const { random } = chanceOf(options.randomSeed)
  let world: World | undefined
  let closed: Promise<void> | undefined
  const close = (): Promise<void> => {
    closed ??= (async () => {
      // A page that the test left open holds its browser, which would keep the program from ending.
      for (const end of world?.pageEnds ?? []) await end()
      for (const machine of [...(world?.machines.values() ?? [])].reverse()) await closeMachine(machine)
    })().finally(() => removed(home))
    return closed
  }
  // The runner of the tests closes an app that its test left open, once the test file has run: a test that
  // failed before its `close()`, or never called it, would keep the program of the file from ending.
  inFile(() => after(close))
  try {
    const built = await buildProject(project, { for: 'dev', out: join(home, 'bundle') })
    const errors = built.findings.filter((one) => one.level === 'error')
    if (errors.length) {
      const [first] = errors
      const told = errors.map(
        (one) => `${one.code} ${one.where ? `${one.where.file}:${one.where.line} ` : ''}${one.message}`,
      )
      throw new TentError(first.code, `The project ${project} does not build:\n${told.join('\n')}`, {
        fix: first.fix ?? 'Run `tent check`, and mend what it finds.',
        ...(first.where ? { where: first.where } : {}),
      })
    }
    world = worldOf(home, built.bundleFolder, clock)
    world.random = random
    const room = roomMaker(options.room)
    if (room) world.room = room
    const writer = machineIn(world, 'data')
    writer.folder = join(home, 'data')
    // A test of AI behaviour, which `tent test --ai` runs, has the keys of the project's own test data.
    keysOfProject(writer.folder)
    testSecrets(writer.folder, built.description, options.secrets ?? {})
    const app = await openWriter(world, writer)
    await app.seed()
    return faceOf(world, writer, moves, close, options)
  } catch (error) {
    await close()
    throw error
  }
}
