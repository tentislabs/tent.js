import { dirname, join } from 'node:path'
import { TentError } from '../../../core/index.ts'
import { intoOf, outOf } from '../callables.ts'
import { askerOf, boundsOf, callsOf, keeperOf } from '../calls.ts'
import { placedVersion, placeOfVersion } from '../inProgram/loader.ts'
import { inProgramRoom } from '../inProgram/room.ts'
import type { Called, Entry, Room, RoomInput, RoomVersion } from '../room.ts'
import type { HeldProgram } from './process.ts'
import { startHeld } from './process.ts'
import { refusedOut } from './refused.ts'
import { projectZone } from '../../../core/internal.ts'

/** What the held room holds of one version: its actions' modules and, from its first action, its held program. */
interface Held {
  version: RoomVersion
  actions: RoomVersion['modules']
  program?: HeldProgram
  loaded?: Promise<unknown>
  entries: Map<string, Promise<number>>
}

/** Whether a module of a version holds an action, and so is loaded in its held program. */
const holdsAction = (one: RoomVersion['modules'][number]): boolean => one.kinds.includes('action')

/** Whether a module of a version is needed by its actions alone, and so is not loaded in the engine's program. */
const actionsAlone = (one: RoomVersion['modules'][number]): boolean => one.kinds.every((kind) => kind === 'action')

/**
 * The held room, what `hold` of a project is: every kind of code runs in the program, as in the room of the
 * program, and an action, with every package it imports, in a held program of its version under the runtime's
 * permission model, started with its first action. The held program reaches the engine by the same crossing as
 * any room: a refusal of the permission model becomes T0035, naming the packages that reach that way.
 */
export function heldRoom(o: RoomInput): Room {
  const inner = inProgramRoom(o)
  const versions = new Map<string, Held>()
  // The held program that each open call reached, by its number, which a function it handed is called back in.
  const programs = new Map<number, HeldProgram>()
  let room: Room | undefined
  const roomOf = (): Room => {
    if (!room) throw new TentError('T0009', 'The held room was used before it was made.')
    return room
  }
  /** The held program of a version, started where it is not, with the modules of its actions loaded in it. */
  const programOf = (held: Held): HeldProgram => {
    if (held.program?.alive()) return held.program
    // A program that ended, as by a package that ended it, is started anew with its entries asked again.
    held.program?.close()
    held.entries.clear()
    const hold = held.version.hold
    const native = hold === true || hold === undefined ? [] : (hold.native ?? [])
    // A named native package is loaded from the project's own installed package: the project lies above the data folder.
    const nativeFolders = native.map((name) => join(dirname(o.dataFolder), 'node_modules', name))
    const program = startHeld({ place: placeOfVersion(held.version), native, nativeFolders, serve: served })
    held.program = program
    held.loaded = program.channel.ask('load', { version: { id: held.version.id, modules: held.actions } })
    return program
  }
  /** What the held program asks the engine: the ways of the room. */
  const served = (what: string, body: unknown): unknown => {
    const b: Record<string, unknown> = Object(body)
    const call = Number(b.call)
    const args = Array.isArray(b.args) ? b.args : []
    const way = (): unknown => {
      if (what === 'runtime') return o.ways.runtime(call, wordOf(b.word), args)
      if (what === 'db') return o.ways.db(call, Number(b.db), memberOf(b.member), args)
      if (what === 'back') return o.ways.back(call, Number(b.fn), args)
      if (what === 'fetch') return o.ways.fetch(call, b.request)
      throw new TentError('T0009', `The held program asked for what the engine does not give: ${what}.`)
    }
    // Each answer to the program is told the clock of the engine first, so that `now()` of the call follows it.
    const ticked = (): void => {
      const program = programs.get(call)
      if (!program) return
      const now = callsOf(roomOf()).find(call).cx?.app.clock.now()
      if (now !== undefined) void Promise.resolve(program.channel.ask('clock', { call, now })).catch(() => undefined)
    }
    const answer = way()
    if (!(answer instanceof Promise)) {
      ticked()
      return answer
    }
    return answer.then(
      (value: unknown) => {
        ticked()
        return value
      },
      (error: unknown) => {
        ticked()
        throw error
      },
    )
  }
  /** An action of a version, carried out in its held program. */
  const action = (version: string, entry: Entry): Called => {
    return async (handed, c) => {
      const held = versions.get(version)
      if (!held) throw new TentError('T0011', `The held room holds no version ${version}.`)
      const program = programOf(held)
      await held.loaded
      const key = [entry.module, ...entry.path].join('\u0000')
      let far = held.entries.get(key)
      if (!far) {
        far = program.channel.ask('entry', { version, entry }).then(Number)
        held.entries.set(key, far)
      }
      const cx = callsOf(roomOf()).find(c.call).cx
      const bounds = boundsOf(cx)
      const project = cx?.app.description.project ?? {}
      const drawn = {
        now: cx?.app.clock.now() ?? Date.now(),
        zone: projectZone(project),
        valueSize: bounds.size,
        // An app with a source of its own hands each call a seed of it, from which the call draws in the program.
        ...(cx?.app.random ? { seed: String(cx.app.random()) } : {}),
      }
      programs.set(c.call, program)
      try {
        const sent = outOf(handed, keeperOf(roomOf(), c.call), bounds)
        const answer = await program.channel.ask('call', {
          entry: await far,
          call: c.call,
          handed: sent,
          drawn,
          bounds,
        })
        return await intoOf(answer, askerOf(roomOf(), c.call))
      } catch (error) {
        throw cx ? refusedOut(error, cx.work.name, cx.app.description) : error
      }
    }
  }
  room = {
    crosses: true,
    async load(version) {
      const held = versions.get(version.id)
      const actions = version.modules.filter(holdsAction)
      if (held) held.actions = [...held.actions, ...actions]
      else versions.set(version.id, { version, actions, entries: new Map() })
      const rest = { ...version, modules: version.modules.filter((one) => !actionsAlone(one)) }
      await inner.load(placedVersion(rest, placeOfVersion(version)))
    },
    entry: (version, entry) => (entry.kind === 'action' ? action(version, entry) : inner.entry(version, entry)),
    draw: (version) => inner.draw(version),
    back(call, fn, args, c) {
      const program = programs.get(call)
      if (!program) throw new TentError('T0013', 'The held program of that call is not under way.')
      const bounds = boundsOf(callsOf(roomOf()).find(c.call).cx)
      return program.channel.ask('back', { call, fn, args, as: c.call, bounds })
    },
    program: (start) => inner.program(start),
    unload(version) {
      versions.get(version)?.program?.close()
      versions.delete(version)
      inner.unload(version)
    },
    close() {
      for (const held of versions.values()) held.program?.close()
      versions.clear()
      return inner.close()
    },
  }
  // What the code of a call handed the engine is let go in its program once the call has ended.
  callsOf(room).ended((call) => {
    const program = programs.get(call)
    programs.delete(call)
    program?.channel.ask('forget', { call }).catch(() => undefined)
  })
  return room
}

/** A word of the runtime slot that the held program names. */
function wordOf(word: unknown): 'call' | 'handle' | 'start' | 'emit' | 'draw' {
  if (word === 'call' || word === 'handle' || word === 'start' || word === 'emit' || word === 'draw') return word
  throw new TentError('T0013', 'The held program asked for a word the runtime does not give.')
}

/** A member of `db` that the held program names. */
function memberOf(member: unknown): 'read' | 'write' | 'sql' {
  if (member === 'read' || member === 'write' || member === 'sql') return member
  throw new TentError('T0013', 'The held program asked for a member of `db` that it does not have.')
}
