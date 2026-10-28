import { randomBytes } from 'node:crypto'
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../core/index.ts'
import type { Clock } from '../core/internal.ts'
import type { App, Engine, Makers, Reach, Unsent } from '../engine/index.ts'
import { readBody } from '../build/index.ts'
import { createEngine, mailboxOf } from '../engine/index.ts'
import type { Gate } from './gate.ts'
import { gateOf } from './gate.ts'

/** One machine of a test: its address among the machines of the test, its data folder, and the app while it runs. */
export interface Machine {
  address: string
  folder: string
  engine?: Engine
  app?: App
  // The key it reads with, where it is or was a reader.
  key?: string
  far: boolean
  held: boolean
  cut: boolean
  // The links it opened to another machine, each behind the gate that the test holds.
  gates: Set<Gate>
  // The links that other machines opened to it, and whether it is being killed: then it answers nothing.
  toward: Set<Gate>
  killing: boolean
  // What refuses each call of the machine that is under way, to its caller: a kill calls them all.
  under: Set<(error: unknown) => void>
  // The mail that the apps it ran before kept in their mailboxes.
  mailed: Unsent[]
}

/** The machines of one test app: they share the bundle, the clock and the keys, and reach each other with no network. */
export interface World {
  home: string
  bundle: string
  clock: Clock
  machines: Map<string, Machine>
  // The keys that every machine lets join: the near ones, and the far ones.
  near: string[]
  far: string[]
  // How many keys of each kind were handed to a reader.
  taken: { near: number; far: number }
  // Whether the machines were opened with the keys: a test app with no reader is opened with none.
  keyed: boolean
  // The keys of the workers that the writer lets join, and whether it was opened with them.
  workers: string[]
  working: boolean
  count: number
  // What closes the pages that each test app of the world opened: they are closed before its machines.
  pageEnds: (() => Promise<void>)[]
  // Where the code of each machine runs: the test room where the test or its run asks for it.
  room?: Makers['room']
  // The source of numbers of every machine of the test app, from its random seed.
  random?: () => number
}

const newKey = (): string => randomBytes(32).toString('base64url')

/** Makes the world of a test app, with no machine in it yet. */
export const worldOf = (home: string, bundle: string, clock: Clock): World => ({
  home,
  bundle,
  clock,
  machines: new Map(),
  near: Array.from({ length: 6 }, newKey),
  far: Array.from({ length: 6 }, newKey),
  taken: { near: 0, far: 0 },
  keyed: false,
  workers: Array.from({ length: 10 }, newKey),
  working: false,
  count: 0,
  pageEnds: [],
})

/** Answers a new machine of the world, which is not opened yet: its address is a name that no network knows. */
export function machineIn(world: World, name: string, o: { far?: boolean; own?: string; key?: string } = {}): Machine {
  const machine: Machine = {
    address: o.own ?? `https://${name}-${++world.count}.tent.test`,
    folder: join(world.home, `${name}-${world.count}`),
    far: o.far === true,
    held: false,
    cut: false,
    gates: new Set(),
    toward: new Set(),
    killing: false,
    under: new Set(),
    mailed: [],
    ...(o.key ? { key: o.key } : {}),
  }
  world.machines.set(machine.address, machine)
  return machine
}

/** Takes the next key of a kind that no reader of the world holds yet. Throws T0013 once they are all handed out. */
function keyFor(world: World, far: boolean): string {
  const kind = far ? 'far' : 'near'
  const key = world[kind][world.taken[kind]++]
  if (key === undefined)
    throw new TentError('T0013', `A test app has ${world[kind].length} ${kind} readers at the most.`, {
      fix: 'Use fewer readers in one test.',
    })
  return key
}

const readersOf = (world: World): (string | { key: string; far: true })[] => [
  ...world.near,
  ...world.far.map((key) => ({ key, far: true as const })),
]

const gone = (address: string): TentError =>
  new TentError('T0029', `The machine at ${address} does not run in this test.`, {
    fix: 'Open it again with `restart`.',
  })

/**
 * Answers how one machine of the world reaches the others, in place of the network. An address of the test is
 * answered by the app that runs there, and fails as a machine that is gone where none does. A link that the
 * machine opens passes the gate that the test holds, and cannot be opened while the machine is cut off.
 */
export function reachFor(world: World, from: Machine): Reach {
  return (address) => {
    if (!address.endsWith('.tent.test') && !world.machines.has(address)) return undefined
    const target = world.machines.get(address)
    return {
      async request(request, o) {
        if (!target?.app || target.killing) throw gone(address)
        return target.app.request(request, o)
      },
      link(request) {
        if (!target?.app || target.killing || from.cut) throw gone(address)
        const gate = gateOf(target.app.link(request), from.held)
        from.gates.add(gate)
        target.toward.add(gate)
        return gate
      },
    }
  }
}

/** What every engine of a machine of the world is made with: the clock, the source of numbers, and the room. */
export const makersOf = (world: World): Makers => ({
  clock: () => world.clock,
  ...(world.random ? { random: () => world.random ?? Math.random } : {}),
  ...(world.room ? { room: world.room } : {}),
})

/** Opens a machine of the world as the writer of its data folder, in the mode `test`, where it answers on every name. */
export async function openWriter(world: World, machine: Machine): Promise<App> {
  machine.engine = createEngine({
    port: 0,
    makers: makersOf(world),
    // A test app is built where the build tools are, so its engine reads sequences as `tent start` does.
    readBody,
  })
  machine.app = await machine.engine.open(world.bundle, {
    dataFolder: machine.folder,
    mode: 'test',
    address: '*',
    ...(world.keyed ? { own: machine.address, readers: readersOf(world) } : {}),
    ...(world.working ? { workers: world.workers } : {}),
  })
  return machine.app
}

/** Opens a machine of the world as a reader of another, joined over the link with no network. */
export async function openReader(world: World, machine: Machine, of: Machine): Promise<App> {
  machine.key ??= keyFor(world, machine.far)
  machine.engine = createEngine({
    port: 0,
    makers: makersOf(world),
  })
  try {
    machine.app = await machine.engine.read({
      from: of.address,
      key: machine.key,
      dataFolder: machine.folder,
      far: machine.far,
      own: machine.address,
      readers: readersOf(world),
      ...(world.working ? { workers: world.workers } : {}),
      reach: reachFor(world, machine),
      address: '*',
    })
  } catch (error) {
    await machine.engine.close()
    delete machine.engine
    throw error
  }
  return machine.app
}

/** Closes a machine: its links, its app and its engine. It can be opened again on its folder. */
export async function closeMachine(machine: Machine): Promise<void> {
  const { engine } = machine
  if (machine.app) machine.mailed.push(...mailboxOf(machine.app))
  delete machine.app
  delete machine.engine
  for (const gate of [...machine.gates]) gate.close()
  machine.gates.clear()
  await engine?.close()
}

/**
 * Takes a machine and a call of its app that is under way. Answers the call to its caller while the machine
 * lives. A kill refuses it, as a connection that closed, whatever the engine of the test still makes of it.
 */
export function whileAlive<Answer>(machine: Machine, work: Promise<Answer>): Promise<Answer> {
  return new Promise((done, failed) => {
    machine.under.add(failed)
    work.then(
      (answer) => {
        machine.under.delete(failed)
        done(answer)
      },
      (error) => {
        machine.under.delete(failed)
        failed(error)
      },
    )
  })
}

/** The files of a data folder that a closing in order changes or takes away: the file of the engine, each data file and the log, and what a store keeps beside its file while it is open. */
function heldOpenIn(folder: string, under = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(join(folder, under), { withFileTypes: true })) {
    const path = under ? `${under}/${entry.name}` : entry.name
    // The files of tenants lie under `tenants/`, and nothing that a kill leaves lies in a temporary folder.
    if (entry.isDirectory()) {
      if (path === 'tenants' || (path.startsWith('tenants/') && entry.name !== '.tmp'))
        found.push(...heldOpenIn(folder, path))
    } else if (path === 'engine.json' || /\.db(-wal)?$/.test(entry.name)) found.push(path)
  }
  return found
}

/**
 * Ends a machine as a killed program would. Its links are cut first, so that nothing more is sent. Every call
 * that is under way is refused to its caller, so that nothing more is answered. And what its data folder held at
 * that moment is what it holds afterwards, so that nothing more is committed or written into the log:
 * `engine.json`, each data file and the log as they stood, with what their stores kept beside them, and so a file
 * that was open is left marked open. The engine of the test lives in the program of the test, which goes on: its
 * handles are given up after the folder was read, and the folder is put back as it was read. It can be opened
 * again on its folder.
 */
export async function killMachine(machine: Machine): Promise<void> {
  // The links it opened and those opened to it are cut, and it answers no request while its engine closes: a
  // killed program sends nothing, also where its closing takes a moment, as a room's does.
  machine.killing = true
  for (const gate of [...machine.gates, ...machine.toward]) gate.close()
  machine.gates.clear()
  machine.toward.clear()
  const killed = new TentError('T0029', `The machine at ${machine.address} was killed while the call was under way.`, {
    fix: 'The call was not answered: ask again once the machine runs, or ask the machine that took over.',
  })
  for (const refuse of [...machine.under]) refuse(killed)
  machine.under.clear()
  const left = existsSync(machine.folder)
    ? heldOpenIn(machine.folder).map((path) => ({ path, bytes: readFileSync(join(machine.folder, path)) }))
    : []
  await closeMachine(machine)
  // A copy of the data that a reader fetched may still hold the file a moment after the close: a killed program
  // holds nothing, so the folder is put back once the last handle on a data file is given up.
  for (let tries = 0; tries < 250 && existsSync(machine.folder) && stillHeld(machine.folder); tries++)
    await new Promise((done) => setTimeout(done, 20))
  for (const { path, bytes } of left) writeFileSync(join(machine.folder, path), bytes)
  machine.killing = false
}

/** Whether a data file of a folder is still open: SQLite keeps the memory it shares beside a file while it is. */
const stillHeld = (folder: string, under = ''): boolean =>
  readdirSync(join(folder, under), { withFileTypes: true }).some((entry) =>
    entry.isDirectory()
      ? entry.name !== '.tmp' && stillHeld(folder, under ? `${under}/${entry.name}` : entry.name)
      : entry.name.endsWith('.db-shm'),
  )

/** Puts the data file of a mark in the place of the data of a machine that is closed, as a disk that lost its last writes. */
export function putBack(machine: Machine, file: string): void {
  for (const beside of ['-wal', '-shm']) rmSync(join(machine.folder, `data.db${beside}`), { force: true })
  // The mark of an app that keeps a data file for each tenant is a folder: its shared file is the one that is lost.
  cpSync(statSync(file).isDirectory() ? join(file, 'data.db') : file, join(machine.folder, 'data.db'))
}
