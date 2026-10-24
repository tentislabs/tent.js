import { existsSync, readdirSync, rmSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { basename, join, resolve } from 'node:path'
import type { Source } from '../build/index.ts'
import { buildSaved, readBody, storeTidied, watchProject } from '../build/index.ts'
import { keepTypes, rulesThread } from '../check/index.ts'
import type { Finding } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { finding, limitDefaults } from '../core/internal.ts'
import type { App } from '../engine/index.ts'
import { createEngine, makeSecretKey, placedTidied } from '../engine/index.ts'
import { openHistory } from '../history/index.ts'
import { heldBack } from './backHeld.ts'
import { heldAndAdded } from './heldAndAdded.ts'
import { historyWritten, writes } from './historyBranches.ts'
import { browserPackages, packagesWatched } from './packagesWatched.ts'
import { pushed } from './pushed.ts'
import { failuresTold } from './devFailures.ts'
import { guardOf } from './guarded.ts'
import { historyWork, person, shown } from './historyWork.ts'
import type { Lying } from './lying.ts'
import { changedFrom, lyingIn } from './lying.ts'
import { findingText } from './print.ts'
import { engineAt } from './reach.ts'
import { unread } from './unread.ts'

/** A session of `tent dev`: the app that it runs, and what ends it. */
export interface Dev {
  folder: string
  port: number
  app(): App
  /** The id of the version that runs now. */
  version(): string
  /** What the last save was found with, and what the type checker reported last. */
  findings(): Finding[]
  /** What the session ran, as the command answers it when it ends. */
  ran(): { app: string; version: string; port: number; mode: 'development' }
  /** Ends the watching, the type checker and the engine. */
  close(): Promise<void>
}

// What `--fresh` leaves in the engine's own folder: all but the development data. A secret is shown nowhere to be
// typed again, so the secrets, the settings and their key stay, with the bundles, the history, backups and pictures.
const kept = [
  'build',
  'cache',
  'history.db',
  'history.db-wal',
  'history.db-shm',
  'secret.key',
  'secrets.test',
  'secrets.live',
  'settings.test',
  'settings.live',
  'backups',
  'certs',
  'evals',
  'shots',
]

// The memory above which the session says that starting it again clears it.
const much = 1024 ** 3

// How long a session is quiet before it does what a save left: long enough for the open pages to follow the save.
const quiet = 250

const isError = (one: Finding): boolean => one.level === 'error'

/**
 * Throws T0013 where an engine runs on the data folder already, and says where: only where what `engine.json`
 * names proved that it holds the token. A file that a stopped engine left keeps no project shut.
 */
async function refuseSecond(dataFolder: string): Promise<void> {
  const running = await engineAt(dataFolder)
  if (!running) return
  throw new TentError(
    'T0013',
    `This project runs already, in the program ${running.pid}, at http://localhost:${running.port}: one \`tent dev\` runs in a project.`,
    { fix: 'Use the one that runs, or end it first with Ctrl+C in its terminal.' },
  )
}

/** Whether this computer lets a program listen on a port now. */
const isFree = (port: number): Promise<boolean> =>
  new Promise((done) => {
    const probe = createServer()
    probe.once('error', () => done(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)))
  })

/** The port that was asked for, or the next one after it that is free. The port 0 is left to the system. */
async function freePort(asked: number): Promise<number> {
  if (asked === 0) return 0
  for (let port = asked; port < asked + 100 && port < 65536; port++) if (await isFree(port)) return port
  throw new Error(`No port from ${asked} to ${asked + 99} is free.`)
}

/** What a thing that was thrown is as a finding: an error of our own with its code and its fix, and anything else as it reads. */
function foundIn(thrown: unknown): Finding {
  if (thrown instanceof TentError)
    return finding(thrown.code, thrown.message, thrown.fix === undefined ? {} : { fix: thrown.fix })
  return finding('T0009', thrown instanceof Error ? thrown.message : String(thrown))
}

/**
 * Takes the folder of a project, the port to listen on, where the session says what it does, and whether the
 * development data is emptied first. Builds the project for development, opens it in an engine in the mode
 * `development`, seeds data that is empty, and watches the folder: each save is built and held against our own
 * rules, and with no error the new version is added and switched to, so that open pages follow it. With an error
 * the last good version keeps running, and what was found is said and shown on the open pages. The type checker
 * runs beside this and holds nothing back. Throws T0013 where a program runs the project already.
 */
export async function startDev(
  folder: string,
  o: {
    port?: number
    fresh?: boolean
    mail?: boolean
    keep?: boolean
    inspect?: string
    // What ends the session while it still waits for a project that builds, and so has answered nothing to close.
    signal?: AbortSignal
    out(line: string): void
  },
): Promise<Dev> {
  const dataFolder = join(folder, '.tent')
  await refuseSecond(dataFolder)
  // Our rules run on a thread of their own, beside the build of a save and the load of its version.
  const rules = rulesThread()
  if (o.fresh && existsSync(dataFolder))
    for (const name of readdirSync(dataFolder))
      if (!kept.includes(name))
        rmSync(join(dataFolder, name), { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })

  let closed = false
  let app: App | undefined
  let pending = false
  let wake: (() => void) | undefined
  let working: Promise<void> | undefined
  let failed: Finding[] = []
  let typed: Finding[] = []
  let said = ''
  // The folders of the project's files, and what the disk said of each file in them when the sweep last looked, from
  // before the first build: the sweep tells of each file whose entry changed since, as the watcher tells of a save.
  let folders = [folder]
  let lying: Lying = lyingIn(folders)
  // What the newest build read, the files that were told of since a round last began, and whether a save was found
  // with no file named: a save is one round, however many times it is told of.
  let read: Record<string, string> | undefined
  const told = new Set<string>()
  let found = false
  let saidMuch = false
  // The lists of the versions that this session wrote: one whose version can no longer be loaded is removed, and
  // with it each file of the store that no list names any more.
  const wrote = new Set<string>()

  /** Says what was found, once for as long as it stays the same. */
  const tell = (found: Finding[]): void => {
    const text = found.map(findingText).join('\n')
    if (text !== said && text) o.out(text)
    said = text
  }
  const show = (): void => {
    if (app && !closed) app.show([...failed, ...typed])
  }

  /** What our rules found of a build: where the thread of the rules could not hold it, its error is the finding. */
  const ruled = (built: { source: Source; description: Description }): Promise<Finding[]> =>
    rules.over(built).catch((error: unknown) => [foundIn(error)])

  /**
   * Builds the project as its files stand. Answers the build, with what our rules found of it: they hold it from the
   * moment the build has read and described the project, while the build writes the bundle.
   */
  const build = async (
    running?: string,
  ): Promise<Awaited<ReturnType<typeof buildSaved>> & { ruled: Promise<Finding[]> }> => {
    let held: Promise<Finding[]> | undefined
    const built = await buildSaved(folder, {
      ...guardOf(folder),
      // A save is sorted against the version that runs: where it changed the look alone, its pages take it in place.
      ...(running ? { running } : {}),
      checkable: (whole) => {
        held = ruled(whole)
      },
    })
    read = built.prints
    if (built.bundleList) wrote.add(resolve(built.bundleList))
    return { ...built, ruled: held ?? ruled(built) }
  }

  /** Whether what was told of since a round last began holds a save that the newest build did not read. */
  const unbuilt = (): boolean => {
    const files = [...told]
    told.clear()
    const prints = read
    const any = found || prints === undefined || files.some((file) => unread(folder, file, prints))
    found = false
    return any
  }

  /** Builds the project as its files stand, before anything runs, and holds what was read against our own rules. */
  const firstBuild = async (): Promise<Awaited<ReturnType<typeof buildSaved>>> => {
    const built = await build()
    built.findings.push(...(await built.ruled))
    return built
  }

  /**
   * Drops each version that neither runs nor is needed, removes the list of each version of this session that can
   * no longer be loaded, each file of the store that no list names any more, and each folder of links that a
   * program was handed of a version that is loaded no more.
   */
  const tidy = async (running: App): Promise<void> => {
    for (const one of running.versions()) if (!one.running && !one.needed) await running.drop(one.id)
    const loadable = new Set(running.versions().map((one) => one.id))
    let removed = false
    for (const list of wrote) {
      if (loadable.has(basename(list, '.json'))) continue
      // Taken away beside the answers of the engine: the page that a save just reached loads its new modules meanwhile.
      await rm(list, { force: true, maxRetries: 20, retryDelay: 50 })
      wrote.delete(list)
      removed = true
    }
    if (!removed) return
    await storeTidied(folder, [join(dataFolder, 'versions')])
    placedTidied([...loadable].map((id) => join(dataFolder, 'versions', id)))
  }

  const watchers: { close(): Promise<void> }[] = []
  const saved = (file?: string): void => {
    if (file === undefined) found = true
    else told.add(file)
    pending = true
    if (wake) wake()
    else if (app) turn()
  }
  // The watcher is started beside the first build. A save that it does not see, as one that comes before it has
  // read the folder, is found by the sweep.
  const watched = watchProject(folder, saved).then((one) => watchers.push(one))

  // The session can be ended while it waits for a save that mends the project, before it answers what closes it.
  // Once the session runs, `close` ends it: the signal ends no more, or it would leave `close` nothing to close.
  const endedWaiting = (): void => {
    closed = true
    wake?.()
  }
  o.signal?.addEventListener('abort', endedWaiting, { once: true })
  let built = await firstBuild()
  while (built.findings.some(isError) || !built.versionId) {
    // With nothing to run yet, the session waits for the save that mends the project.
    tell(built.findings)
    await watched
    // A notice of a file that the build read as it lies now is no save: the session waits on.
    for (;;) {
      if (!pending && !closed)
        await new Promise<void>((done) => {
          wake = done
        })
      wake = undefined
      pending = false
      if (closed || unbuilt()) break
    }
    if (closed) break
    built = await firstBuild()
  }
  o.signal?.removeEventListener('abort', endedWaiting)
  if (closed) {
    await watched
    for (const one of watchers) await one.close()
    await rules.close()
    throw new TentError('T0013', 'The session was ended before the project could be built and run.')
  }
  tell(built.findings)
  // The roots are known once the project is read: from then on the sweep looks over them too.
  folders = [folder, ...built.roots]
  for (const [lies, said] of lyingIn(built.roots)) lying.set(lies, said)

  // The build tools are loaded here already, so the engine of `tent dev` reads sequences as `tent start` does.
  const engine = createEngine({ port: await freePort(o.port ?? 3000), readBody })
  let opened: App
  let inspectToken: string | undefined
  try {
    const empty = !existsSync(join(dataFolder, 'data.db'))
    // A project that seals a column needs the key of the secrets from its first write: on a computer of your own
    // the key file is made here, by the one rule of who makes one.
    if (sealsColumn(built.description)) makeSecretKey(dataFolder)
    // With `--mail` a message is sent in development too, for a builder who wants to see a real one arrive.
    const sends = o.mail === true ? { sendMail: true } : {}
    // With `--keep` the rows past the time their table keeps them are removed in development too.
    const keeps = o.keep === true ? { keep: true } : {}
    opened = await engine.open(built.bundleList, { dataFolder, mode: 'development', ...sends, ...keeps })
    // A token of the inspect mode for the tool of that origin: one that is no origin ends the session before it runs.
    inspectToken = o.inspect === undefined ? undefined : opened.inspect({ framedBy: o.inspect })
    if (empty) await opened.seed()
  } catch (error) {
    await engine.close()
    await rules.close()
    await watched
    for (const one of watchers) await one.close()
    throw error
  }
  app = opened
  // The session holds the history open: a command that needs it meanwhile asks over the admin channel.
  const history = openHistory(dataFolder)
  // A new history starts at the files as they are.
  if (!history.find('now'))
    history.record(folder, {
      by: person,
      kind: 'save',
      checked: true,
      description: built.described,
      known: built.prints,
    })
  // The version of the newest point that this session recorded: a build of the same files records no second one.
  let recorded = built.versionId
  // What the newest build found of the files, which a point that a command records meanwhile is recorded with.
  let lastFound: { checked: boolean; description?: typeof built.described } = {
    checked: true,
    description: built.described,
  }
  // Whether the files are those of a point that was gone back to: the switch to them retires what they do not
  // know, and the first build of them marks the point of going back, where it records none.
  let backing = false
  let marking = false
  // Why the last switch was refused, where it was.
  let refusal: Finding | undefined
  const pointsKept = Number(Object(built.description.project.limits).historyKept ?? limitDefaults.project.historyKept)
  engine.give('upkeep', 'history', { daily: () => void history.tidy(Date.now(), { kept: pointsKept }) }, opened)
  const port = Number(engine.port)
  const name = built.description.app.name
  // After its end the session answers the version that it ran last.
  let last = ''
  const running = (): string => (closed ? last : (opened.versions().find((one) => one.running)?.id ?? ''))
  // What a save leaves until its pages are told: the point of the history and the cleaning of the versions it left. It
  // is done once the session is quiet, before the next save is built, and before anything reads the history, so that
  // what the pages ask for as they follow the save is answered at once.
  let owed: (() => Promise<void>) | undefined
  let owedFor: ReturnType<typeof setTimeout> | undefined
  let paying = Promise.resolve()
  /** Does what a save left, where it left something, and answers once all that was left is done. */
  const paid = (): Promise<void> => {
    clearTimeout(owedFor)
    const one = owed
    owed = undefined
    if (one)
      paying = paying.then(one).catch((error: unknown) => {
        failed = [foundIn(error)]
        tell(failed)
        show()
      })
    return paying
  }
  const owe = (work: () => Promise<void>): void => {
    owed = work
    clearTimeout(owedFor)
    owedFor = setTimeout(() => void paid(), quiet)
  }
  await tidy(opened)
  o.out(`${name} runs at http://localhost:${port} (development). Press Ctrl+C to stop it.`)
  if (inspectToken !== undefined)
    o.out(`In the inspect mode, for the tool at ${o.inspect}: http://localhost:${port}/?t-inspect=${inspectToken}`)
  for (const root of built.roots) watchers.push(await watchProject(root, saved))
  // Each failure while running that the open pages show, the terminal says too, with the path of its file.
  const unwatch = failuresTold({ app: opened, port, folder: resolve(folder), out: o.out })
  // A file of a package that a screen imports that changes has every open page load its address anew: a package is
  // never taken in place.
  const packages = packagesWatched(folder, () => {
    if (!closed) void opened.switch(running(), { reload: true }).catch(() => undefined)
  })
  packages.watch(browserPackages(built.description))

  // The type checker runs beside the saves: what it reports arrives when it is ready, and holds no switch back.
  let source = built.source
  let types = keepTypes(resolve(folder), source)
  // Whether the first pass of the type checker that runs has answered, and whether a save came before it did.
  let ready = false
  let early = false
  const reported = (kept: typeof types, found: Finding[]): void => {
    if (closed || kept !== types) return
    const text = found.map(findingText).join('\n')
    if (text && text !== typed.map(findingText).join('\n')) o.out(text)
    typed = found
    // Where the type checker answers later, what it found is written onto the point then, once that point stands.
    const checked = !failed.length && !found.some(isError)
    void paid().then(() => {
      if (!closed) history.mark('now', { checked })
    })
    show()
  }
  // A pass that had begun when it was asked answers nobody, and the type checker may notice a save before the
  // watcher does. So it is asked twice over: once ahead of any save, and once at each save. Whatever a pass
  // answers is the newest that is known.
  const followTypes = (kept: typeof types): void => {
    kept.next().then(
      (found) => {
        if (closed || kept !== types) return
        if (!ready && early) {
          // The type checker does not see a save that comes during its first pass: it is started anew, and
          // reads the files as they stand.
          kept.stop()
          ready = false
          early = false
          types = keepTypes(resolve(folder), source)
          return followTypes(types)
        }
        ready = true
        reported(kept, found)
        followTypes(kept)
      },
      (error: unknown) => {
        if (closed || kept !== types) return
        o.out(`The types are no longer checked: ${error instanceof Error ? error.message : String(error)}.`)
      },
    )
  }
  followTypes(types)

  /** One save: built, held against the rules while its version is loaded, and with no error switched to. */
  const round = async (): Promise<void> => {
    await paid()
    const kept = types
    if (ready)
      kept.next().then(
        (found) => reported(kept, found),
        () => undefined,
      )
    else early = true
    const next = await build(running())
    source = next.source
    packages.watch(browserPackages(next.description))
    if (closed) return
    refusal = undefined
    let switched = false
    const held = await heldAndAdded({
      findings: next.findings,
      versionId: next.versionId,
      list: next.bundleList,
      running: running(),
      rules: () => next.ruled,
      add: (list) => opened.add(list),
    })
    next.findings.push(...held.found)
    try {
      if ('failed' in held) throw held.failed
      // The rows of a table that gains or loses `tenant` are moved at once: the data is that of development.
      if (held.version !== undefined) {
        // A save of the look alone is taken in place by the pages, by Fast Refresh; a way back never is.
        const swap = next.swap && !backing ? { swap: next.swap } : {}
        await opened.switch(held.version, { move: true, ...(backing ? { back: true } : {}), ...swap })
        switched = true
      }
    } catch (error) {
      // A version that cannot be loaded, or a table change that is refused, is a finding like any other: the
      // version that ran keeps running.
      refusal = foundIn(error)
      next.findings.push(refusal)
    }
    // A way back holds until the files of it run: a save that mends a point that did not build is switched to so.
    if (next.versionId && next.versionId === running()) backing = false
    const errors = next.findings.filter(isError)
    // Each build that a save caused is a point: a broken state too, which is recorded as not checked.
    const checked = !errors.length && !typed.some(isError)
    const found = { checked, ...(checked ? { description: next.described } : {}) }
    lastFound = found
    const marks = marking
    const records = !next.versionId || next.versionId !== recorded
    marking = false
    recorded = next.versionId
    owe(async () => {
      await tidy(opened)
      if (marks) history.mark('now', found)
      // The files that the build read are kept by the fingerprints it made: only what the save changed is read again.
      else if (records) history.record(folder, { by: person, kind: 'save', ...found, known: next.prints })
    })
    // A save that switched to nothing gives the pages nothing to follow: what it left is done before it is told.
    if (!switched) await paid()
    failed = errors
    tell(next.findings)
    show()
    if (!saidMuch && process.memoryUsage.rss() > much) {
      saidMuch = true
      o.out(
        'The engine holds more than 1 GB of memory: the runtime cannot forget a module that it loaded. Start `tent dev` again to clear it.',
      )
    }
  }

  // Saves are built one after another, in their order: a save that arrives during a build is built after it.
  function turn(): void {
    if (working) return
    const saves = async (): Promise<void> => {
      // The loop starts once it stands as the one that works, and stands so no longer from the moment it finds no
      // save left: a save told in between, as the second of two that one sweep finds, starts the next loop.
      await undefined
      try {
        while (pending && !closed) {
          pending = false
          if (!unbuilt()) continue
          try {
            await round()
          } catch (error) {
            failed = [foundIn(error)]
            tell(failed)
            show()
          }
        }
      } finally {
        working = undefined
      }
    }
    working = saves()
  }
  /** Tells of each file whose entry on the disk changed since the sweep last looked, as the watcher tells of one. */
  const look = (): void => {
    const now = lyingIn(folders)
    const changed = changedFrom(lying, now)
    lying = now
    for (const file of changed) saved(file)
  }
  await watched
  look()
  if (pending) turn()
  // The watcher of the system may miss a save, most of all right after it started: the folders are looked over
  // too, and what changed is held to the same rule as what the watcher tells of.
  const sweep = setInterval(() => {
    if (!closed && !pending && !working) look()
  }, 500)

  /** Builds the files as they stand now, and switches to them where they differ from what runs. */
  const settle = async (): Promise<void> => {
    saved()
    turn()
    await working
    await paid()
  }

  /**
   * Goes back to a point: where the data can follow, the files are written, and the save that follows is built and
   * switched to at once. Where it cannot, no file changes: with what the point was kept with that is known before,
   * and else the files of the present are written again. Either way the command ends with why.
   */
  const goBack = async (word: string): Promise<unknown> => {
    await working
    await paid()
    await heldBack(history, opened, word)
    const point = history.back(folder, word, person)
    backing = true
    marking = true
    await settle()
    const why = refusal
    if (why) {
      const [present] = point.parents
      history.back(folder, present, person)
      backing = false
      marking = true
      await settle()
      throw new TentError(
        why.code,
        `Going back to ${word} was undone, since the data cannot follow it: ${why.message}`,
        {
          fix: why.fix ?? 'Change the rows that do not fit, or go back to another point.',
        },
      )
    }
    return {
      point: shown(point),
      version: running(),
      note: 'Rows that `tent data clean` dropped are not brought back.',
      findings: failed.map((one) => ({ code: one.code, message: one.message })),
    }
  }
  /**
   * A switch, a merge or a settle: the files are written, and the save that follows is built, held against the
   * rules and switched to, and its point marked with what was found. A switch is held first as going back is.
   */
  const written = async (args: object): Promise<unknown> => {
    await working
    await paid()
    const name: unknown = Reflect.get(args, 'name')
    if (Reflect.get(args, 'what') === 'switch' && typeof name === 'string' && history.pointer(name) !== undefined)
      await heldBack(history, opened, name)
    // A head with no word of the check is marked with what the session found of its files before it is merged into.
    if (history.find('now')?.checked === undefined) history.mark('now', lastFound)
    const done = await historyWritten(history, folder, args)
    backing = Reflect.get(args, 'what') === 'switch'
    marking = true
    await settle()
    return {
      ...done,
      checked: history.find('now')?.checked ?? false,
      version: running(),
      findings: failed.map((one) => ({ code: one.code, message: one.message })),
    }
  }
  engine.give(
    'admin',
    'history',
    {
      run: async (_app: App, args: object) => {
        if (Reflect.get(args, 'what') === 'back' || writes(args)) {
          try {
            if (writes(args)) return await written(args)
            return await goBack(String(Reflect.get(args, 'point') ?? ''))
          } catch (error) {
            // The channel sends a code that no caller sees as T0009: why going back was refused is answered whole.
            if (!(error instanceof TentError)) throw error
            return { refused: { code: error.code, message: error.message, ...(error.fix ? { fix: error.fix } : {}) } }
          }
        }
        // A save that is being built is built first, so that a point is recorded with what was found of its files.
        await working
        await paid()
        if (Reflect.get(args, 'what') === 'push') return await pushed(history, folder, args, lastFound)
        return historyWork(history, folder, args, lastFound)
      },
    },
    opened,
  )

  return {
    folder,
    port,
    app: () => opened,
    version: running,
    findings: () => [...failed, ...typed],
    ran: () => ({ app: name, version: running(), port, mode: 'development' }),
    async close() {
      if (closed) return
      last = running()
      closed = true
      await watched
      for (const one of watchers) await one.close()
      types.stop()
      unwatch()
      packages.close()
      clearInterval(sweep)
      await working
      await paid()
      await engine.close()
      await rules.close()
      history.close()
    },
  }
}

/** Whether a description holds a column that is stored encrypted. */
function sealsColumn(description: { tables: Record<string, { columns?: unknown }> }): boolean {
  return Object.values(description.tables).some((table) =>
    Object.values(Object(table.columns)).some((type) => Reflect.get(Object(type), 'sealed') === true),
  )
}
