import { resolve } from 'node:path'
import type { ActionDb, TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { versionIdOf } from '../core/internal.ts'
import type { Mode } from '../data/index.ts'
import type { App } from './app.ts'
import type { MachineTold } from './copy/machine.ts'
import { forgetGivenKey, giveKey } from './values/key.ts'
import { removeEngineFile, runningElsewhere } from './engineFile.ts'
import { descriptionOf } from './format.ts'
import { holdsFile, filePlaceOf, textAt } from './files.ts'
import type { Makers } from './makers.ts'
import type { Opened } from './opened.ts'
import type { Program } from './opening/frame.ts'
import { refused } from './opening/frame.ts'
import { opening } from './opening/opening.ts'
import { drivenClosed } from './sessions.ts'
import { closeVersions } from './versions.ts'
import type { CountingOptions } from './counts/options.ts'
import { countingOf } from './counts/options.ts'

/**
 * What `engine.open` takes beside the folder of the bundle. `address` is the name, or the names, that the app
 * answers on: left out, it answers only as this computer, and `'*'` answers every name. `mode` is `'live'` where
 * it is left out. `readers` are the keys of the readers that the app lets join, each a text of 32 characters or
 * more, and a far one as `{ key, far: true }`. `own` is the address by which its readers reach it. `insecure` lets
 * the addresses of the link be found over a connection that is not secure, for machines on a network of their own.
 */
export interface OpenOptions {
  dataFolder: string
  address?: string | string[]
  mode?: Mode
  own?: string
  readers?: (string | { key: string; far: true })[]
  // The keys of the workers that the app lets join, each a key or one that is bound to kinds, a count at once and a count of workers.
  workers?: (string | { key: string; kinds?: string[]; atOnce?: number; workers?: number })[]
  insecure?: boolean
  // The makers of this app, which win over those of the engine.
  makers?: Makers
  // In the mode `development`, mail is sent in place of written to the log: what `tent dev --mail` asks for.
  sendMail?: boolean
  // A length of time, as '10 minutes': an app that nothing used for that long falls asleep. Left out, it never sleeps.
  sleepAfter?: string
  // The least that is counted of the app, and how often its counts are written and its levels measured, and kept.
  countBy?: CountingOptions['countBy']
  countEvery?: string
  levelEvery?: string
  callerCountsKept?: string
  countsKept?: string
  // The rows of a table that gains or loses `tenant` in the bundle are moved, as a switch with `move` moves them.
  move?: boolean
  // Of the program that holds the app: who a request is, asked in place of the `identify` of the project.
  identify?: Identify
  // The sites that may show every screen of the app in a frame, beside those a screen names itself.
  framedBy?: string[] | 'anyone'
  // What the app keeps in memory is made at its first use: a program that holds many apps says so.
  lazy?: boolean
  // In the mode `development`, the rows past the time their table keeps them are removed: what `tent dev --keep` asks for.
  keep?: boolean
  // The key of the secrets of this app, in place of `TENT_SECRET_KEY` and of `secret.key` of its data folder: so a
  // preview reads no key of the server's program.
  secretKey?: string
}

/**
 * Who a request is to an app, as a program that holds it names them: handed the request without its body, what
 * the engine knows of it, a `db` that reads with full access, and `call`, which calls a function as the system.
 * Answers the id of a row of `users`, or nothing.
 */
export type Identify = (o: {
  request: Request
  about: { from: string; origin: string }
  db: ActionDb
  call(fn: object, input?: unknown): Promise<unknown>
}) => string | undefined | Promise<string | undefined>

const modes: Mode[] = ['development', 'test', 'live']

// The data folders that this program holds open: one program opens a data folder for writing, once.
const openFolders = new Set<string>()

/** Whether this program holds a data folder open. */
export const heldHere = (dataFolder: string): boolean => openFolders.has(resolve(dataFolder))

/**
 * Reads the description of a version, the folder of a bundle or the list that a build of development wrote, and
 * the version id that its content gives. Throws T0011 for one that holds none.
 */
export function readBundle(given: string): { description: Description; version: string } {
  const place = filePlaceOf(given)
  if (!holdsFile(place, 'description.json'))
    throw refused(
      'T0011',
      `The folder ${given} holds no description.json, so it is no bundle.`,
      'Hand the engine the folder that `tent build` wrote.',
    )
  const text = textAt(place, 'description.json')
  const description = descriptionOf(text)
  return { description, version: versionIdOf(text, description) }
}

/**
 * Takes a data folder. Holds it for this program, which opens a data folder once. Answers its whole path, and
 * what gives it up again. Throws T0013 for no folder, and for one that an engine holds open already.
 */
export async function claimed(folder: unknown, option: string): Promise<{ dataFolder: string; release(): void }> {
  if (typeof folder !== 'string' || folder === '')
    throw refused(
      'T0013',
      'An app is opened on a data folder, and none was named.',
      `Name \`dataFolder\` in the options of \`${option}\`.`,
    )
  const dataFolder = resolve(folder)
  const holds = (other?: number): TentError =>
    refused(
      'T0013',
      `An engine holds the data folder ${dataFolder} open already${other === undefined ? '' : `, in the program ${other}`}: one program opens a data folder for writing.`,
      'Close the app that holds it, or talk to the engine that runs it.',
    )
  if (openFolders.has(dataFolder)) throw holds()
  // The folder is held from here on, so that no second opening of this program asks beside this one.
  openFolders.add(dataFolder)
  const release = (): void => void openFolders.delete(dataFolder)
  const other = await runningElsewhere(dataFolder)
  if (other !== undefined) {
    release()
    throw holds(other)
  }
  return { dataFolder, release }
}

/**
 * Takes what the engine hands an opening, the folder of a bundle, and the options of `engine.open`. Reads the
 * description of the bundle, has the makers make the store and the clock of the app, opens its data, applies the
 * table changes, loads its code, and writes `engine.json`. Answers the app, which is the writer of its data. Where
 * anything fails, the app does not open and what was opened for it is closed: T0011 for a description that does
 * not pass, T0018 for data that cannot be opened, T2001 to T2004 for a table change that is refused, T0013 for a
 * data folder that an engine holds open already and for a key of `readers` that is none, and T0030 for the data
 * folder of a reader or of a writer that was stopped.
 */
export async function openApp(program: Program, bundleFolder: string, options: OpenOptions): Promise<App> {
  // An app that may sleep is held by what puts it to sleep and wakes it, which opens it as any other.
  if (options?.sleepAfter !== undefined) {
    const { sleepAfter, ...plain } = options
    return (await import('./sleep/sleeper.ts')).sleepingApp(program, bundleFolder, plain, sleepAfter)
  }
  if (options.move === true) {
    const { move, ...plain } = options
    return (await import('./opening/moved.ts')).openMoved(
      (folder) => openApp(program, folder, plain),
      bundleFolder,
      resolve(plain.dataFolder),
      readBundle(bundleFolder).version,
    )
  }
  const mode = options?.mode ?? 'live'
  if (!modes.includes(mode))
    throw refused(
      'T0013',
      `An app is opened in the mode development, test or live, and never in ${JSON.stringify(mode)}.`,
      'Name one of the three modes, or none for live.',
    )
  const told: MachineTold = {
    // The keys of the readers are read by what holds the link, which an app that names none does not load.
    keys: options.readers === undefined ? [] : (await import('./copy/keys.ts')).readerKeysOf(options.readers),
    insecure: options.insecure === true,
    ...(typeof options.own === 'string' ? { own: options.own } : {}),
  }
  const { description, version } = readBundle(bundleFolder)
  const counting = countingOf(options)
  const { dataFolder, release } = await claimed(options.dataFolder, 'engine.open')
  try {
    if (options.secretKey !== undefined) giveKey(dataFolder, options.secretKey)
    return await opening(program, {
      dataFolder,
      bundleFolder: filePlaceOf(bundleFolder),
      description,
      version,
      mode,
      told,
      ...(options.address === undefined ? {} : { address: options.address }),
      ...(options.makers === undefined ? {} : { makers: options.makers }),
      ...(options.sendMail === true ? { sendMail: true } : {}),
      ...(options.keep === true ? { keepRows: true } : {}),
      ...(counting ? { counting } : {}),
      ...(options.identify ? { identify: options.identify } : {}),
      ...(options.framedBy === undefined ? {} : { framedBy: options.framedBy }),
      ...(options.workers?.length ? { workers: (await import('./work/keys.ts')).workerKeysOf(options.workers) } : {}),
    })
  } catch (error) {
    forgetGivenKey(dataFolder)
    release()
    throw error
  }
}

/**
 * Takes what the engine holds of an app. Closes the app for good: the calls of actions that are under way get
 * `web.stopTime` of the engine, its links and what else works on its data are stopped, `engine.json` is taken away, the log and the
 * store are closed, and each thing that a maker made and that has `close` is told, the clock among them. A second
 * closing does nothing.
 */
export async function closeApp(o: Opened, how: { asleep?: true } = {}): Promise<{ dueAt?: number }> {
  if (o.closed) return {}
  // The short beat of the upkeep is never due for an app that sleeps: it is caught up before it falls asleep.
  if (how.asleep) o.upkeep?.caughtUp()
  o.closed = true
  // The runs stop at a step boundary: a step that is under way is done and saved before the data is closed.
  o.work?.close()
  // What is due: the earliest of the shared file and the open files, and, by the directory, of every closed file.
  const filesDue = o.flows?.filesDue()
  // A step whose work never settles is given the time of the calls in flight, and the app closes after it.
  const ran = (await o.flows?.runner.close({ within: o.waits.stop }))?.dueAt
  // A closed app holds no timer: the files of tenants that close below set none.
  o.flows?.close()
  const dueAt = ran === undefined ? filesDue : filesDue === undefined ? ran : Math.min(ran, filesDue)
  if (o.inFlight.size) {
    let timer: NodeJS.Timeout | undefined
    const timeUp = new Promise<void>((done) => {
      timer = setTimeout(done, o.waits.stop)
    })
    await Promise.race([Promise.allSettled([...o.inFlight]), timeUp])
    clearTimeout(timer)
  }
  // An app that falls asleep wakes for the same browsers: those of a program that let go of it end here.
  if (!how.asleep) drivenClosed(o)
  o.hub?.close()
  closeVersions(o)
  await o.threads?.close()
  o.upkeep?.close()
  for (const one of o.before) one.close()
  o.machine.close()
  await o.tenantFiles?.close()
  // An app that falls asleep keeps `engine.json`, so that a command still finds its engine, and its clock.
  if (!how.asleep) removeEngineFile(o.dataFolder)
  o.log.close()
  o.store.close()
  for (const thing of o.made) {
    if (how.asleep && thing === o.clock) continue
    const close: unknown = Reflect.get(thing, 'close')
    if (typeof close === 'function') await Reflect.apply(close, thing, [])
  }
  openFolders.delete(o.dataFolder)
  forgetGivenKey(o.dataFolder)
  o.left()
  return dueAt === undefined ? {} : { dueAt }
}
