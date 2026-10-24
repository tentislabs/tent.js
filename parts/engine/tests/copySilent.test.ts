import assert from 'node:assert/strict'
import type { Socket } from 'node:net'
import { createServer } from 'node:net'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { App, Reach } from '../index.ts'
import type { Bundle } from './apps.ts'
import { bundled, engineOf, portOf, system, workFolder } from './apps.ts'
import type { World } from './machines.ts'
import { addNote, current, machineAddress, moment, readerIn, worldOf, writerIn } from './machines.ts'

// The machines beat five times a second, so that a reader knows within a second that its writer is gone.
const quick = {
  change: (description: Bundle['description']) => {
    description.project.limits = { ...Object(description.project.limits), beat: 200, behind: 1000 }
  },
}

/**
 * How a reader of a world reaches the others, with the test in between: while `on` is set, the address of the
 * writer takes each link and says nothing, as a program that is stopped whole does. `dialled` counts those links.
 */
function silentAt(inner: Reach, address: string): { reach: Reach; on: boolean; dialled: number } {
  const state = {
    on: false,
    dialled: 0,
    reach: ((to) => {
      if (!state.on || to !== address) return inner(to)
      return {
        request: () => new Promise<Response>(() => undefined),
        link() {
          state.dialled++
          let closed: (() => void) | undefined
          return {
            send: () => undefined,
            each(_, whenClosed) {
              closed = whenClosed
            },
            close: () => closed?.(),
          }
        },
      }
    }) satisfies Reach,
  }
  return state
}

/**
 * Lets beats of a world pass, each with a quarter of a second of real time: a link is given up by the clock of
 * the app and by the time that really passed, and a beat of these machines is a fifth of a second.
 */
async function beats(world: World, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    world.clock.advance(1000)
    await moment(250)
  }
}

test('[29-7] a near reader whose dial is taken and never answered closes that link within a beat and dials again, beat after beat', async (t) => {
  const world = worldOf(t)
  const first = world.engine()
  const app = await writerIn(world, await bundled(t, quick, world.work), first)
  const silent = silentAt(world.reach, machineAddress.writer)
  const near = await readerIn(world, 'near', world.engine(), silent.reach)
  await current(world, near)
  await addNote(app, 'one')
  // The writer is gone, and what stands at its address takes each link and says nothing.
  world.apps[machineAddress.writer] = undefined
  silent.on = true
  await first.close()
  await beats(world, 12)
  assert.ok(silent.dialled >= 6, `the near reader dialled its writer ${silent.dialled} times in twelve beats`)
})

test('[29-7] a far reader whose dial is taken and never answered closes that link after `behind`, dials the next address, and follows the machine that took over', async (t) => {
  const world = worldOf(t)
  const first = world.engine()
  const app = await writerIn(world, await bundled(t, quick, world.work), first)
  const near = await readerIn(world, 'near')
  const silent = silentAt(world.reach, machineAddress.writer)
  const far = await readerIn(world, 'far', world.engine(), silent.reach)
  await current(world, near)
  await current(world, far)
  await addNote(app, 'one')
  world.apps[machineAddress.writer] = undefined
  silent.on = true
  await first.close()
  await beats(world, 8)
  const took = await near.takeOver()
  await addNote(near, 'by the new writer')
  for (let i = 0; i < 120 && far.at().epoch !== took.epoch; i++) await beats(world, 1)
  assert.ok(silent.dialled >= 1, 'the far reader dialled the address that says nothing')
  assert.equal(far.at().epoch, took.epoch, 'the far reader follows the machine that took over')
  await current(world, far)
  assert.equal(far.at().n, near.at().n)
})

const key = 'n'.repeat(40)
const farKey = 'f'.repeat(40)

/** A port of this computer that nothing listens on now. */
const freePort = (): Promise<number> =>
  new Promise((done) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const at = server.address()
      server.close(() => done(typeof at === 'object' && at ? at.port : 0))
    })
  })

/** Something that listens on a port, takes each connection, and never answers. */
function takesAndSaysNothing(t: TestContext, port: number): Promise<{ taken: () => number }> {
  const sockets: Socket[] = []
  const server = createServer((socket) => {
    sockets.push(socket)
    socket.on('error', () => undefined)
  })
  t.after(() => {
    for (const socket of sockets) socket.destroy()
    server.close()
  })
  return new Promise((done) => server.listen(port, '127.0.0.1', () => done({ taken: () => sockets.length })))
}

async function until(what: string, holds: () => boolean, ms = 30_000): Promise<void> {
  for (const ends = performance.now() + ms; performance.now() < ends; ) {
    if (holds()) return
    await new Promise((done) => setTimeout(done, 20))
  }
  assert.fail(`never: ${what}`)
}

test('[29-7] over the network: where a listener on the port of the writer that is gone takes each connection and never answers, the far reader still finds the machine that took over', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, quick, work)
  const [writerData, nearData, farData] = [join(work, 'writer'), join(work, 'near'), join(work, 'far')]
  const readers = [key, { key: farKey, far: true as const }]
  const first = engineOf(t)
  const writer = await first.open(bundle.folder, { dataFolder: writerData, mode: 'test', readers, insecure: true })
  const writerPort = portOf(writerData)
  const writerAt = `http://127.0.0.1:${writerPort}`
  // The near reader states the address that the others reach it by, on a port that is its own.
  const nearPort = await freePort()
  const nearAt = `http://127.0.0.1:${nearPort}`
  const options = { from: writerAt, readers, insecure: true }
  const near = await engineOf(t, { port: nearPort }).read({ ...options, key, dataFolder: nearData, own: nearAt })
  const far: App = await engineOf(t).read({ ...options, key: farKey, far: true, dataFolder: farData })
  await until('both readers are current', () => near.at().current && far.at().current)
  await writer.write([{ add: 'tags', values: { name: 'one' } }], { as: system })
  await until('the far reader was told of the near one', () => far.machines().some((one) => one.own === nearAt))
  await first.close()
  const listener = await takesAndSaysNothing(t, writerPort)
  await until('the near reader is current no more', () => !near.at().current)
  const took = await near.takeOver()
  await near.write([{ add: 'tags', values: { name: 'by the new writer' } }], { as: system })
  await until('the far reader follows the machine that took over', () => {
    const at = far.at()
    return at.epoch === took.epoch && at.n === near.at().n && at.current
  })
  assert.ok(listener.taken() >= 1, 'the listener took a connection of a reader')
})
