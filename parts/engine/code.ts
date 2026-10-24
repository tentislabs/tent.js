import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import type { RuleCode } from '../data/index.ts'
import { underWay } from './context.ts'
import { bytesAt } from './files.ts'
import { keepBackfills } from './backfilled.ts'
import type { Opened } from './opened.ts'
import { keepProjectCode } from './ownCode.ts'
import { pythonAhead, pythonRun } from './pythonRun.ts'
import { callIn } from './rooms/calls.ts'
import type { Kept } from './rooms/entries.ts'
import { entriesOf } from './rooms/entries.ts'
import { placedVersion } from './rooms/inProgram/loader.ts'
import { heldNative, holdOf } from './rooms/hold.ts'
import type { Called, Room, RoomVersion } from './rooms/room.ts'
import { keepRoutes } from './routes.ts'

const lacking = (what: string, cause?: unknown): TentError => {
  const failed = new TentError('T0011', `The bundle holds no code for ${what}.`, {
    fix: 'Build the project again, and run the bundle as the build wrote it.',
  })
  if (cause !== undefined) failed.cause = cause
  return failed
}

/**
 * Takes what the engine holds of a version, and the modules of it to load with the kinds that need them. Answers
 * the version as its room loads it: from the folder it is run from, or through the list of a development version.
 */
export function roomVersionOf(o: Opened, modules: RoomVersion['modules']): RoomVersion {
  const screens: unknown = Reflect.get(Object(o.description.server), 'screens')
  const hold = holdOf(o.description)
  const version: RoomVersion = {
    id: o.version,
    modules,
    read: (path) => bytesAt(o.bundle, path),
    ...(typeof screens === 'string' ? { page: screens } : {}),
    ...(hold === undefined ? {} : { hold }),
  }
  return placedVersion(version, o.bundle)
}

/** Asks the room for one entry, by its second way where the first finds no arrow. Throws T0011 where neither does. */
function calledOf(room: Room, version: string, kept: Kept): Called {
  if (kept.entry.module === '') throw lacking(kept.what)
  try {
    return room.entry(version, kept.entry)
  } catch (error) {
    if (!kept.or) throw lacking(kept.what, error)
    try {
      return room.entry(version, { ...kept.entry, path: kept.or })
    } catch {
      throw lacking(kept.what, error)
    }
  }
}

/**
 * Has the room of an app load the code of the version that the record names, for this record alone, and keeps
 * what the room answers for each entry where the engine keeps its arrows: the `run` of each function and flow, the
 * rules, the routes, the project's own arrows and the backfills. Throws T0011 where the bundle lacks one.
 */
export async function loadCode(o: Opened): Promise<void> {
  const { entries, modules } = entriesOf(o.description)
  heldNative(o.description)
  // The seed is loaded when it is applied, and not before.
  const loaded = modules.filter(({ kinds }) => kinds.some((kind) => kind !== 'seed'))
  await o.room.load(roomVersionOf(o, loaded))
  const routes = new Map<string, { run?: Called; access?: Called }>()
  const project = new Map<string, Called>()
  const backfills = new Map<string, Called>()
  for (const kept of entries) {
    if (kept.keep === 'seed') continue
    const called = calledOf(o.room, o.version, kept)
    if (kept.keep === 'run') o.runs.set(kept.name, called)
    else if (kept.keep === 'allow') o.allows.set(kept.name, called)
    else if (kept.keep === 'rule') o.rules[kept.name] = ruleCode(o.room, called)
    else if (kept.keep === 'route') routes.set(kept.name, { ...routes.get(kept.name), run: called })
    else if (kept.keep === 'routeRule') routes.set(kept.name, { ...routes.get(kept.name), access: called })
    else if (kept.keep === 'project') project.set(kept.name, called)
    else backfills.set(kept.name, called)
  }
  keepRoutes(o, routes)
  keepProjectCode(o, project)
  keepBackfills(o, backfills)
  let python = false
  for (const [name, record] of Object.entries(o.description.functions))
    if (typeof record.python === 'object' && record.python !== null) {
      python = true
      o.runs.set(name, pythonRun(o, name, record))
    }
  if (python) pythonAhead(o)
}

/** A rule of a table that is code, as the plans of `data` ask it: pure, and at once. */
const ruleCode =
  (room: Room, called: Called): RuleCode =>
  (user, db) =>
    Object(callIn(underWay(), room, called, [user, db], true, true))

/** The names of the functions that a stored body calls, wherever a call stands in it. */
function calledIn(node: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) for (const one of node) calledIn(one, found)
  else if (typeof node === 'object' && node !== null) {
    const named: unknown = Reflect.get(Object(Reflect.get(node, 'call')), 'function')
    if (typeof named === 'string') found.add(named)
    for (const one of Object.values(node)) calledIn(one, found)
  }
  return found
}

/**
 * Takes a description and the name of a function. Answers whether carrying the function out may need a module of
 * the bundle: it is code, its rule is code, a rule of a table is code, or its body calls a function, however deep,
 * of which one of these holds. A function of which none holds is carried out from the description alone.
 */
export function needsCode(description: Description, name: string): boolean {
  const { entries } = entriesOf(description)
  if (entries.some((one) => one.keep === 'rule')) return true
  const coded = new Set(entries.filter((one) => one.keep === 'run' || one.keep === 'allow').map((one) => one.name))
  const seen = new Set<string>()
  const needs = (one: string): boolean => {
    if (seen.has(one)) return false
    seen.add(one)
    const record = Object.hasOwn(description.functions, one) ? description.functions[one] : undefined
    if (!record) return false
    // A `python` is carried out by what `loadCode` keeps for it, though its module holds no arrow.
    if (coded.has(one) || (typeof record.python === 'object' && record.python !== null)) return true
    return [...calledIn(record.body)].some(needs)
  }
  return needs(name)
}
