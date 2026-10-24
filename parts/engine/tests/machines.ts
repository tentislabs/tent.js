import assert from 'node:assert/strict'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import type { App, Engine, Events, Frame, Lease, Link, Reach, Store } from '../index.ts'
import type { Bundle } from './apps.ts'
import { engineOf, system, testClock, workFolder } from './apps.ts'

export const keys = { near: 'n'.repeat(40), far: 'f'.repeat(40), other: 'o'.repeat(40), none: 'x'.repeat(40) }
export const readers = [keys.near, keys.other, { key: keys.far, far: true as const }]
export const machineAddress = { writer: 'https://writer.test', near: 'https://near.test', far: 'https://far.test' }

/** A moment of the runtime, in which what the links carry arrives and is taken. */
export const moment = (ms = 10): Promise<void> => new Promise((done) => setTimeout(done, ms))

export async function until(what: string, holds: () => boolean, tries = 300): Promise<void> {
  for (let i = 0; i < tries && !holds(); i++) await moment()
  assert.equal(holds(), true, `never: ${what}`)
}

/** The machines of one test: they share a clock that the test moves, and reach each other with no network. */
export interface World {
  work: string
  clock: ReturnType<typeof testClock>
  apps: Record<string, App | undefined>
  // How often each address of the link was asked, by its path.
  asked: Record<string, number>
  reach: Reach
  engine(o?: { lease?: Lease; store?: () => Store }): Engine
  heard: string[]
  beat(times?: number): Promise<void>
}

export function worldOf(t: TestContext): World {
  const clock = testClock()
  const apps: World['apps'] = {}
  const asked: World['asked'] = {}
  const heard: string[] = []
  const tell = <Event extends keyof Events>(engine: Engine, event: Event): void =>
    engine.on(event, (told) => void heard.push(`${event} ${told.app.role}`))
  return {
    work: workFolder(t),
    clock,
    apps,
    asked,
    heard,
    reach: (to) => ({
      async request(request, o) {
        const { pathname } = new URL(request.url)
        asked[pathname] = (asked[pathname] ?? 0) + 1
        const app = apps[to]
        if (!app) throw new Error(`${to} does not run`)
        return app.request(request, o)
      },
      link(request) {
        const app = apps[to]
        if (!app) throw new Error(`${to} does not run`)
        return app.link(request)
      },
    }),
    engine(o = {}) {
      const { lease, store } = o
      const engine = engineOf(t, {
        makers: { clock: () => clock.clock, ...(lease ? { lease: () => lease } : {}), ...(store ? { store } : {}) },
      })
      for (const event of [
        'reader.joined',
        'reader.left',
        'machine.ahead',
        'machine.behind',
        'machine.current',
      ] as const)
        tell(engine, event)
      for (const event of ['writer.changed', 'writer.other'] as const) tell(engine, event)
      return engine
    },
    async beat(times = 1) {
      for (let i = 0; i < times; i++) {
        clock.advance(1000)
        await moment(15)
      }
    },
  }
}

/**
 * Has the beats of a world pass until a reader is current. A beat and its answer cross in a moment: where they did
 * not within some beats, the computer is slow, and each later beat is given a longer one.
 */
export async function current(world: World, reader: App): Promise<void> {
  for (let i = 0; i < 80 && !reader.at().current; i++) {
    world.clock.advance(1000)
    await moment(i < 8 ? 15 : 100)
  }
  assert.equal(reader.at().current, true, 'a reader is current after its beats')
}

/**
 * Has more time pass than a writer keeps what a reader that fetched its data may still need, which is twice
 * `changesKept`. The time passes in steps shorter than a reader may be behind, each with a moment for what the
 * links carry, so that no reader gives its link up on the way.
 */
export async function pastKeeping(world: World): Promise<void> {
  for (let passed = 0; passed < 21 * 60_000; passed += 4000) {
    world.clock.advance(4000)
    await moment(1)
  }
  await world.beat(2)
}

/** Opens the writer of a world on its folder, with the keys of the readers. */
export async function writerIn(world: World, bundle: Bundle, engine = world.engine()): Promise<App> {
  const app = await engine.open(bundle.folder, {
    dataFolder: join(world.work, 'writer'),
    mode: 'test',
    address: '*',
    own: machineAddress.writer,
    readers,
  })
  world.apps[machineAddress.writer] = app
  return app
}

/** Opens a reader of a world on its folder. `reach` is how it reaches the others, where a test stands in between. */
export async function readerIn(
  world: World,
  kind: 'near' | 'far',
  engine = world.engine(),
  reach = world.reach,
): Promise<App> {
  const app = await engine.read({
    from: machineAddress.writer,
    key: keys[kind],
    dataFolder: join(world.work, kind),
    far: kind === 'far',
    own: machineAddress[kind],
    readers,
    reach,
    address: '*',
  })
  world.apps[machineAddress[kind]] = app
  return app
}

export const addNote = (app: App, title: string): Promise<unknown> =>
  app.write([{ add: 'tags', values: { name: title } }], { as: system })

export const tags = async (app: App): Promise<string[]> =>
  Object(await app.read({ from: 'tags', sort: [{ by: 'createdAt' }] }, { as: system })).map(
    (row: { name: string }) => row.name,
  )

/** Opens a link by hand, as a reader would, and answers it with every message it was sent. */
export function rawLink(
  app: App,
  key: string,
  scheme = 'https',
): { link: Link; got: Record<string, unknown>[]; closed: () => boolean } {
  const link = app.link(new Request(`${scheme}://writer.test/_t/copy`, { headers: { authorization: `Bearer ${key}` } }))
  const got: Record<string, unknown>[] = []
  let closed = false
  link.each(
    (frame: Frame) => void (typeof frame === 'string' && got.push(JSON.parse(frame))),
    () => {
      closed = true
    },
  )
  return { link, got, closed: () => closed }
}

export const placeTold = (app: App, id: string, more: object = {}): string =>
  JSON.stringify({
    t: 'from',
    id,
    n: app.at().n,
    epoch: app.at().epoch,
    sum: app.at().sum,
    far: false,
    engine: '3',
    layout: 1,
    ...more,
  })
