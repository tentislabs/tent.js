import { searchedForSecrets } from './browserSearched.ts'
import { cpSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import type { TableLayout, TableStep } from '../data/index.ts'
import { applySteps, filledBy, isChecked, layoutOf, setRunningVersion, waitsForBackfill } from '../data/index.ts'
import { backupsOf, takeBackup } from './backups.ts'
import { backOf } from './backTables.ts'
import type { MadeOld } from './fill/madeOld.ts'
import { loadCode } from './code.ts'
import { flowsOf } from './flows/needs.ts'
import { manyLimit } from './held.ts'
import { toolsChanged } from './mcp/kept.ts'
import { programsSwitched } from './mcp/outside/programs.ts'
import { readBundle } from './open.ts'
import { copiedTo, listAt, listKept, filePlaceOf } from './files.ts'
import { pythonSwitched } from './pythonRun.ts'
import type { Opened } from './opened.ts'
import { sealedAt } from './values/seal.ts'
import { engineTables, planTables } from './tableChanges.ts'
import type { QueryThreads } from './threads/pool.ts'
import { forgetFailures } from './failed/held.ts'
import { queryThreads } from './threads/pool.ts'
import type { ReleaseView } from './gradual/release.ts'
import { releaseOf } from './gradual/release.ts'
import type { SwitchTold } from './hub/hub.ts'
import { isSteady, moduleMarkOf } from './moduleMarks.ts'

/** One version of an app that can be loaded: where it is run from, since when, and the app as this version serves it. */
export interface Loadable {
  id: string
  // The place that the version is run from: its copy, or in development the place its list stands beside.
  folder: string
  addedAt: number
  // What the engine holds of the app, with the description and the code of this version: the app itself for the
  // version that runs.
  served: Opened
  // Ends the query threads that the version started beside those of the running one, where it started any.
  ends?: () => void
  // It is, or was, the running version.
  ran?: true
}

/** What one version holds of its own: its description, where it is run from, and the arrows that were loaded of its code. */
type Own = Pick<Opened, 'description' | 'version' | 'bundle' | 'runs' | 'allows' | 'rules'>

/** What a switch answers: whether it was hard, whether it opened the app again, and the table steps it applied. */
export interface Switched {
  hard: boolean
  opens: boolean
  steps: TableStep[]
  // On an app that keeps a data file for each tenant: how many files are behind the running layout, which for a
  // switch that was taken is the count its pass began with. `refused`: the switch was not taken, because the pass
  // of the switch before has not ended, or a file is failed.
  behind?: number
  // `'runs'`: a hard switch was not taken, because runs of an older version have not ended, which `runs` names.
  refused?: 'behind' | 'runs'
  runs?: string[]
  // The runs of an older version that a hard switch stopped, where it was asked to.
  stopped?: string[]
  // With `dry`: for each filled column whose work the version changes, how many values would become old.
  old?: MadeOld[]
  // With `gradual`: how the release stands.
  release?: ReleaseView
}

// The steps after which the older versions could not go on reading or writing the tables. This is the one list
// of them: a change of type is hard too where it is checked against the rows.
const hardSteps = [
  'renameTable',
  'renameColumn',
  'retireTable',
  'retireColumn',
  'addUnique',
  'require',
  'rebuild',
  'empty',
]

/** The error of a version that cannot be loaded, which names the one that runs. */
export const versionGone = (version: unknown): TentError =>
  new TentError(
    'T0007',
    `The version ${(JSON.stringify(version) ?? 'nothing').slice(0, 60)} can no longer be loaded.`,
    {
      fix: 'Load the page again: it then follows the running version.',
    },
  )

/** Throws T0030 on a reader: the versions of an app are its writer's, and a reader follows what the writer tells. */
export function writersOwn(o: Opened, what: string): void {
  const { reader } = o.machine
  if (reader)
    throw new TentError('T0030', `This machine is a reader, and ${what} is the writer's.`, {
      fix: `Do it on the writer, at ${reader.writer()}: its readers follow.`,
    })
}

/**
 * Takes what the engine holds of an app, and what one version holds of its own. Answers the app as that version
 * serves it: everything of the app but its description and its code, which are the version's. A heavy query of
 * the version is carried out on query threads of its own, which are started with its first one.
 */
function viewOf(o: Opened, own: Own): Pick<Loadable, 'served' | 'ends'> {
  const view: Opened = Object.create(o, {
    description: { value: own.description, enumerable: true },
    version: { value: own.version, enumerable: true },
    bundle: { value: own.bundle, enumerable: true },
    runs: { value: own.runs, enumerable: true },
    allows: { value: own.allows, enumerable: true },
    rules: { value: own.rules, enumerable: true },
  })
  let threads: QueryThreads | undefined
  Object.defineProperty(view, 'threads', {
    // An app whose store a program made has no query threads, in any version.
    get: () => {
      if (o.threads) threads ??= queryThreads(view)
      return threads
    },
    enumerable: true,
  })
  return { served: view, ends: () => void threads?.close() }
}

/** Answers every version of an app that can be loaded, by its id: the running one is among them from the start. */
function loadableOf(o: Opened): Map<string, Loadable> {
  o.versions ??= new Map([
    [o.version, { id: o.version, folder: o.bundle, addedAt: o.clock.now(), served: o, ran: true }],
  ])
  return o.versions
}

/**
 * Takes an app, and the version that a call, a read or a watch names. Answers the app as that version serves it:
 * the running one where none is named, and nothing for a version that cannot be loaded. In the mode
 * `development` a page is served by the running version only.
 */
export function servedBy(o: Opened, version: unknown): Opened | undefined {
  if (version === undefined || version === null || version === o.version) return o
  if (typeof version !== 'string' || o.mode === 'development') return undefined
  return o.versions?.get(version)?.served
}

/** The folder of versions of an app: `versions/` of its data folder. */
export const versionsOf = (o: Opened): string => join(o.dataFolder, 'versions')

/**
 * Takes away what `versions/` keeps of a version: its copy, or its list. The files of a list stay in their store,
 * which `tent dev` keeps tidy of the files that no list names.
 */
function forget(o: Opened, one: Loadable): void {
  // The room lets the code of the version go: it is loaded no more.
  o.room.unload(one.id)
  const kept = versionsOf(o)
  rmSync(join(kept, `${one.id}.json`), { force: true })
  if (one.folder === join(kept, one.id) && !listAt(one.folder))
    rmSync(one.folder, { recursive: true, force: true, maxRetries: 5 })
  one.ends?.()
}

/**
 * Takes an app and a bundle: its folder, or the list that a build of development wrote. Makes one more version
 * loadable: reads its description, copies the bundle into the folder of versions, loads every module of it, and
 * answers its id. A bundle that lies there already is run where it lies. In the mode `development` it makes no
 * copy: the version is the list of its files, kept in `versions/`. Throws T0011 for a bundle whose description
 * does not pass or whose code cannot be loaded: nothing is kept of it then.
 */
export async function addVersion(o: Opened, bundle: string): Promise<string> {
  const { description, version } = readBundle(bundle)
  const all = loadableOf(o)
  if (all.has(version)) return version
  const copied = o.mode !== 'development'
  const from = filePlaceOf(bundle)
  const folder = copied ? join(versionsOf(o), version) : listKept(o.dataFolder, version, from)
  if (copied && !existsSync(folder)) {
    if (listAt(from)) copiedTo(from, folder)
    else cpSync(from, folder, { recursive: true })
  }
  const one: Loadable = {
    id: version,
    folder,
    addedAt: o.clock.now(),
    ...viewOf(o, { description, version, bundle: folder, runs: new Map(), allows: new Map(), rules: {} }),
  }
  try {
    await loadCode(one.served)
    // The build of `tent dev` searched the same text for the same values: only a copied bundle is searched here.
    if (copied) searchedForSecrets(o, folder)
  } catch (error) {
    forget(o, one)
    throw error
  }
  all.set(version, one)
  // Every reader is told of it at once, and fetches it.
  o.machine.writer?.toldVersions()
  return version
}

/**
 * Takes an app and the id of a version whose files lie in its folder of versions, as a reader keeps what
 * its writer told it. Makes the version loadable there, as `addVersion` does with a bundle. Throws T0011 for a
 * description that does not pass, and for code that cannot be loaded.
 */
export async function holdVersion(o: Opened, version: string): Promise<void> {
  const all = loadableOf(o)
  if (all.has(version)) return
  const folder = join(versionsOf(o), version)
  const { description } = readBundle(folder)
  const own = { description, version, bundle: folder, runs: new Map(), allows: new Map(), rules: {} }
  const one: Loadable = { id: version, folder, addedAt: o.clock.now(), ...viewOf(o, own) }
  await loadCode(one.served)
  // Two askings for one version may cross: the first one that loaded it holds.
  if (!all.has(version)) all.set(version, one)
}

/**
 * Takes an app and the ids of the versions that its writer names. Every other version but the running one can be
 * loaded no more, and a page that watches one is told to load anew. Answers the ids that were dropped.
 */
export function keepVersions(o: Opened, named: Set<string>): string[] {
  const all = loadableOf(o)
  const dropped: string[] = []
  for (const one of [...all.values()]) {
    if (one.id === o.version || named.has(one.id)) continue
    all.delete(one.id)
    forget(o, one)
    dropped.push(one.id)
  }
  if (dropped.length) o.hub?.switched(o.version, dropped)
  return dropped
}

/** Whether a version is needed: a live connection holds a watch that names it, or a run of it has not ended. */
const isNeeded = (o: Opened, version: string): boolean =>
  o.hub?.watched().has(version) === true || o.flows?.needs(version) === true

/** Answers the versions of an app that can be loaded, in the order in which they were added. */
export function listVersions(
  o: Opened,
): { id: string; running: boolean; needed: boolean; addedAt: number; share?: number }[] {
  const release = releaseOf(o)
  // While a release goes, each of its two versions says the share of the callers it is given.
  const shareOf = (id: string): number | undefined =>
    !release ? undefined : id === release.to ? release.share : id === release.from ? 1 - release.share : undefined
  return [...loadableOf(o).values()].map((one) => {
    const share = shareOf(one.id)
    return {
      id: one.id,
      running: one.id === o.version,
      needed: isNeeded(o, one.id),
      addedAt: one.addedAt,
      ...(share === undefined ? {} : { share }),
    }
  })
}

/**
 * Takes an app and the id of a version. A version that is neither running nor needed can no longer be loaded:
 * what `versions/` keeps of it is taken away. Answers whether it was dropped.
 */
export function dropVersion(o: Opened, version: string): boolean {
  const all = loadableOf(o)
  const one = all.get(version)
  if (!one || version === o.version || isNeeded(o, version)) return false
  all.delete(version)
  forget(o, one)
  o.machine.writer?.toldVersions()
  return true
}

/**
 * Takes an app, and the id of a loadable version that its data names as the running one. Makes it the running one
 * in memory: a call that names no version is served by it from here on, and the version that ran is one more
 * loadable version. A writer does it after the write of its switch, and a reader after it applied that write.
 * Does nothing for a version that runs already, and for one that cannot be loaded.
 */
export function becomeRunning(o: Opened, version: string): void {
  const all = loadableOf(o)
  const next = all.get(version)
  if (!next || version === o.version) return
  const from = o.version
  const left = all.get(from)
  const ran: Own = {
    description: o.description,
    version: from,
    bundle: o.bundle,
    runs: o.runs,
    allows: o.allows,
    rules: o.rules,
  }
  const threads = o.threads
  const { served } = next
  Object.assign(o, {
    description: served.description,
    version,
    bundle: served.bundle,
    runs: served.runs,
    allows: served.allows,
    rules: served.rules,
  })
  // A query thread reads under the version it was started for: those of both versions are ended, and each
  // version starts its own anew with its next heavy query.
  if (threads) {
    void threads.close()
    o.threads = queryThreads(o)
  }
  next.ends?.()
  delete next.ends
  next.served = o
  next.ran = true
  if (left) Object.assign(left, viewOf(o, ran))
}

/** Whether steps make a switch hard: after one of them the older versions could not go on reading or writing the tables. */
const isHard = (steps: TableStep[], layout: TableLayout[]): boolean =>
  steps.some(
    (step) =>
      hardSteps.includes(step.do) ||
      (step.do === 'retype' &&
        isChecked(
          step,
          layout.find((table) => table.name === step.table),
        )),
  )

/**
 * Takes an app and a version that a gradual release begins with. Applies the table steps of that version at once:
 * a release begins only where none is hard, so the version that runs reads the data as before, and a caller the
 * release gives the new version reads what it adds. Of an app that has tenant tables, each file of a tenant is
 * brought up as a switch brings it up, when the release reaches every visitor.
 */
export async function applyReleased(o: Opened, version: string): Promise<void> {
  const next = loadableOf(o).get(version)
  if (!next) throw versionGone(version)
  const planned = planTables(o.store, next.served.description, await engineTables())
  const steps = [...planned.own, ...planned.steps]
  if (!steps.length) return
  if (planned.held && backupsOf(next.served.description).beforeChanges) await takeBackup(o)
  o.store.write((tx) => applySteps(tx, o.store, steps, { ...sealedAt(o.dataFolder), now: () => o.clock.now() }), {
    steps: true,
  })
}

/**
 * Takes an app and the id of a loadable version. Makes it the running one: its table changes are applied inside
 * one write, which names the version too, and from then on a call that names no version is served by it. Where a
 * step is refused nothing is changed, and it throws the finding: T2001 to T2004. On an app with readers the write
 * waits until each reader holds the version, for `versionWait` at most. On an app that keeps a data file for each
 * tenant the files are checked first, and brought up by a pass after: a switch that changes a tenant table
 * while a file is still behind answers `refused: 'behind'` with the count, and changes nothing. A hard switch
 * drops the older versions at once, and their pages are told to reload. In the mode `development` every open page
 * is told the version that runs now. With `dry` everything is checked and nothing is changed. Answers whether it
 * was hard, and the steps it applied. Throws T0007 for a version that cannot be loaded.
 */
export async function switchVersion(
  o: Opened,
  version: string,
  how: {
    dry?: boolean
    move?: boolean
    hard?: 'refuse' | 'stop'
    back?: boolean
    backup?: boolean
    swap?: string[]
    reload?: boolean
  } = {},
): Promise<Switched> {
  const dry = how.dry === true
  const backup = how.backup === true
  const all = loadableOf(o)
  if (!all.has(version)) throw versionGone(version)
  if (version === o.version) return { hard: false, opens: false, steps: [] }
  // A reader that does not hold the version could not go on once the write of the switch reaches it.
  if (!dry) await o.machine.writer?.versionHeld(version)
  const next = all.get(version)
  if (!next) throw versionGone(version)
  if (version === o.version) return { hard: false, opens: false, steps: [] }
  const to: Description = next.served.description
  // Made things belong to the app: a version whose makers are not those it was opened with opens it again.
  const makersOf = (described: Description): unknown => Reflect.get(Object(described.server), 'makers')
  const opens = makersOf(to) !== makersOf(o.description)
  const behind = manyLimit(o.description, 'behind')
  const layout = o.store.layout()
  let told: Switched
  // The steps that make a column required which a backfill of the new version fills: taken once it ran.
  let later: TableStep[] = []
  // The first version that has a tenant table, switched to with `move`, has an app on one machine open its files.
  const first = !o.tenantFiles && !dry && how.move === true && layoutOf(to).some((one) => one.tenant !== undefined)
  if (first && !o.machine.many()) await o.toFiles?.()
  if (o.tenantFiles) {
    // What a file of a tenant holds is known to the files alone: they are loaded for an app that keeps them.
    const { switchTenantFiles } = await import('./files/switching.ts')
    // A hard switch is not taken while a run of an older version has not ended, in any file, unless it is to stop those runs.
    let held: { refused: boolean; runs: string[] } | undefined
    if (o.flows) {
      const look = await switchTenantFiles(o, o.tenantFiles, next.served, version, {
        dry: true,
        move: how.move === true,
      })
      const hard = look.moved || isHard(look.steps, [...layout, ...layoutOf(o.description)])
      held = hard ? o.flows.beforeHard(version, how.hard === 'stop', dry) : undefined
      if (held?.refused)
        return { hard, opens: false, steps: look.steps, behind: look.behind, refused: 'runs', runs: held.runs }
    }
    const done = await switchTenantFiles(o, o.tenantFiles, next.served, version, {
      dry,
      move: how.move === true,
      backup,
    })
    told = {
      // The tenant tables stand in no shared file: what they held is what the version that runs describes.
      // Rows that moved are where no older version reads them.
      hard: done.moved || isHard(done.steps, [...layout, ...layoutOf(o.description)]),
      opens,
      steps: done.steps,
      behind: done.behind,
      ...(done.refused ? { refused: done.refused } : {}),
      ...(held?.runs.length ? { stopped: held.runs } : {}),
    }
    if (!done.taken) return told
    later = done.later ?? []
  } else {
    // Going back, what the older files do not know is retired without a statement.
    const planned = planTables(
      o.store,
      how.back === true ? backOf(o.store, to, o.description) : to,
      await engineTables(),
    )
    told = { hard: isHard(planned.steps, layout), opens, steps: planned.steps }
    // A hard switch is not taken while a run of an older version has not ended, unless it is to stop those runs.
    const held = told.hard ? o.flows?.beforeHard(version, how.hard === 'stop', dry) : undefined
    if (dry) return held?.refused ? { ...told, refused: 'runs', runs: held.runs } : told
    if (held?.refused) return { ...told, refused: 'runs', runs: held.runs }
    if (held?.runs.length) told.stopped = held.runs
    // What a table change could lose is kept first: a backup of the data as it stood.
    if ((planned.steps.length || backup) && planned.held && backupsOf(to).beforeChanges) await takeBackup(o)
    const fills = filledBy(to)
    later = planned.steps.filter((step) => waitsForBackfill(step, fills))
    const steps = [...planned.own, ...planned.steps.filter((step) => !waitsForBackfill(step, fills))]
    o.store.write(
      (tx) => {
        if (steps.length) applySteps(tx, o.store, steps, { ...sealedAt(o.dataFolder), now: () => o.clock.now() })
        setRunningVersion(tx, version)
      },
      steps.length ? { steps: true } : {},
    )
  }
  const from = o.version
  becomeRunning(o, version)
  // The runner reads its triggers and its schedule from the version that runs now.
  await flowsOf(o)
  // The kept columns that the switch made are filled, by the one walk of a switch.
  await (await import('./keptWalk.ts')).walkKept(o)
  // The backfills of the version run once on the writer, and then the steps that wait for them.
  if (Object.keys(o.description.backfills ?? {}).length || later.length)
    await (await import('./backfilled.ts')).backfilled(o, later)
  // After a hard switch the older versions could not go on reading or writing the tables: they are dropped.
  const dropped: string[] = []
  if (told.hard) {
    // An older version is one that was added before the new one, or that ran: a version that was added after
    // it and never ran stays for the switch that makes it run.
    let before = true
    for (const one of [...all.values()]) {
      if (one.id === version) {
        before = false
        continue
      }
      if (!before && !one.ran) continue
      all.delete(one.id)
      forget(o, one)
      dropped.push(one.id)
    }
  }
  // A reader that was cut off before the switch may answer for as long as the version before let it.
  o.machine.writer?.switched(behind)
  o.machine.writer?.toldVersions()
  // A failure of the version that ran is shown no more: a save that switched may have mended it.
  forgetFailures(o)
  o.hub?.switched(version, dropped, toldOf(o, how))
  // The filled columns of the version that runs now are looked at: a work that changed makes its values old.
  o.filling?.switched()
  // A client of MCP that keeps a stream is told that the tools may have changed.
  toolsChanged(o)
  // A Python program of an older version ends once it holds no call: new code runs in programs of its own.
  pythonSwitched(o)
  // A program of an outside server of MCP follows the version that runs, from the folder of its files.
  programsSwitched(o)
  o.raise('version.switched', { app: o.app, from, to: version })
  if (opens) await o.again?.(next.folder)
  return told
}

/**
 * What a switch tells the open pages of development beside the version: each module that a save of the look alone
 * changed, at its mark in the version that runs now, which the pages take in place; or that they load their address
 * anew. Nothing in any other mode, and for every other switch.
 */
function toldOf(o: Opened, how: { swap?: string[]; reload?: boolean }): SwitchTold | undefined {
  if (o.mode !== 'development') return undefined
  if (how.reload) return { reload: true }
  const swap = how.swap
    ?.filter((path) => isSteady(o, path))
    .map((address) => ({ address, mark: moduleMarkOf(o, address) }))
  return swap?.length ? { swap } : undefined
}

/** Closes the query threads that the versions of an app started beside those of the running one. */
export function closeVersions(o: Opened): void {
  for (const one of o.versions?.values() ?? []) one.ends?.()
}
