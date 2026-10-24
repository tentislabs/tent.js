import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { testApp } from '../../test/index.ts'
import type { Bounds, Keeper } from '../rooms/callables.ts'
import { outOf } from '../rooms/callables.ts'
import { callsOf } from '../rooms/calls.ts'
import { resolveIn } from '../rooms/resolve.ts'
import type { Room } from '../rooms/room.ts'
import { laidAttack } from './attacks/laid.ts'

const codeOf = (error: unknown): unknown => Reflect.get(Object(error), 'code')

// A keeper that keeps nothing of its own: the attacks on the copy do not hand a function, a stream or a `db`.
const bareKeeper: Keeper = { fn: () => 0, promise: () => 0, stream: () => 0, db: () => undefined }
const bounds: Bounds = { depth: 64, size: 5000 }

// [05-19.1] Code in a room walks from a callable it was handed to the engine's heap.
test('[05-19.1] code that walks from a callable it was handed - its constructor, its prototype - reaches nothing of the engine heap in the test room, though it reaches it in the room of the program', async (t) => {
  const marker = `held-${Math.random()}`
  Reflect.set(globalThis, '__tentEngineMarker', marker)
  t.after(() => void Reflect.deleteProperty(globalThis, '__tentEngineMarker'))
  const apart = await testApp({ folder: laidAttack(t), room: 'apart' })
  t.after(() => apart.close())
  assert.equal(
    await apart.as('nobody').call('reachEngine', {}),
    'not reached',
    'from the test room a callable reaches a heap with no marker of the engine',
  )
  // The same walk in the room of the program reaches the one heap, so the test can tell a leak: it is no proof of
  // the seam, only that the attack would be caught.
  const program = await testApp({ folder: laidAttack(t), room: 'program' })
  t.after(() => program.close())
  assert.equal(await program.as('nobody').call('reachEngine', {}), marker, 'in the program the heap is the engine')
})

// [05-19.1] A handle crosses as a record of callables: a member it does not hold of its own is out of reach.
test('[05-19.1] code that walks a handle to a member its working object inherits - its constructor - reaches nothing of the engine heap in the test room, though it reaches it in the room of the program', async (t) => {
  const marker = `inherited-${Math.random()}`
  Reflect.set(Object, '__tentEngineMarker', marker)
  t.after(() => void Reflect.deleteProperty(Object, '__tentEngineMarker'))
  const apart = await testApp({ folder: laidAttack(t), room: 'apart' })
  t.after(() => apart.close())
  assert.equal(
    await apart.as('nobody').call('reachThroughHandle', {}),
    'not reached',
    'from the test room a handle answers its own members alone',
  )
  // In the program the handle is the engine's working object itself, so the same walk reaches the marker there.
  const program = await testApp({ folder: laidAttack(t), room: 'program' })
  t.after(() => program.close())
  assert.equal(await program.as('nobody').call('reachThroughHandle', {}), marker)
})

// [05-19.2] A number of a call belongs to its call, and only while it is open.
test('[05-19.2] a callable kept past its call, a number made up, and a number of another call are each T0013', () => {
  const room = { crosses: true } as Room
  const calls = callsOf(room)
  const open = calls.open(undefined)
  // A number the call was never handed, and one made up, are not found.
  assert.throws(
    () => calls.find(open + 1),
    (error) => codeOf(error) === 'T0013',
  )
  assert.throws(
    () => calls.find(9999),
    (error) => codeOf(error) === 'T0013',
  )
  // Once the call is closed its number belongs to no one: a callable kept past it finds nothing.
  calls.close(open)
  assert.throws(
    () => calls.find(open),
    (error) => codeOf(error) === 'T0013',
  )
})

// [05-19.3] The numbers of a room are its own: a number of another app's room reaches nothing.
test('[05-19.3] a call number of another app of the same program reaches that app no data: each room has its own numbers', () => {
  const roomA = { crosses: true } as Room
  const roomB = { crosses: true } as Room
  const n = callsOf(roomA).open(undefined)
  // The number stands in room A, and in room B it is unknown: `ways` of B would find no call.
  assert.doesNotThrow(() => callsOf(roomA).find(n))
  assert.throws(
    () => callsOf(roomB).find(n),
    (error) => codeOf(error) === 'T0013',
  )
})

// [05-19.4] A value built to hurt the copy is copied in the room's heap or refused, and the engine reads only data.
test('[05-19.4] a value deeper than 64 or larger than valueSize is T0009, a cycle and a proxy are copied as plain data, and a getter that throws throws where it is read', () => {
  // Deeper than the bound.
  let deep: Record<string, unknown> = {}
  const top = deep
  for (let i = 0; i < 70; i++) {
    const next: Record<string, unknown> = {}
    deep.at = next
    deep = next
  }
  assert.throws(
    () => outOf(top, bareKeeper, bounds),
    (error) => codeOf(error) === 'T0009',
  )
  // Larger than the bound.
  assert.throws(
    () => outOf(new Array(6000).fill(1), bareKeeper, bounds),
    (error) => codeOf(error) === 'T0009',
  )
  // A cycle is carried by the seen map, as structured clone carries one: copied, not looped on.
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  const crossed = outOf(cyclic, bareKeeper, bounds) as Record<string, unknown>
  assert.equal(crossed.self, crossed, 'the cycle is kept in the copy')
  assert.notEqual(crossed, cyclic, 'and the copy is not the value itself')
  // A proxy is read once into a plain record: the engine holds no proxy that could run code on a read.
  const proxy = new Proxy({ a: 1 }, { get: (t, k) => Reflect.get(t, k) })
  const plain = outOf(proxy, bareKeeper, bounds) as Record<string, unknown>
  assert.deepEqual(plain, { a: 1 })
  assert.equal(Reflect.getPrototypeOf(plain), Object.prototype, 'the copy is a plain record')
  // A getter that throws throws in the heap the value came from: the engine reads nothing.
  const bad = Object.defineProperty({}, 'x', {
    get: () => {
      throw new Error('read of the getter')
    },
    enumerable: true,
  })
  assert.throws(() => outOf(bad, bareKeeper, bounds), /read of the getter/)
})

// [05-19.5] A description that names a module outside the version is refused by resolveIn.
test('[05-19.5] resolveIn refuses a module outside the version - ../../, a path of the system, a bare name - with T0011', () => {
  const t0011 = (error: unknown): boolean => codeOf(error) === 'T0011'
  // A module named by the description is a plain path inside the version: not a relative path, not absolute, not a scheme.
  assert.throws(() => resolveIn(undefined, '../../secret.ts'), t0011)
  assert.throws(() => resolveIn(undefined, 'node:fs'), t0011)
  assert.throws(() => resolveIn(undefined, '/etc/passwd'), t0011)
  // A module imported by another module may not climb out of the version, or name a bare package.
  assert.throws(() => resolveIn('a/b.ts', '../../../out.ts'), t0011)
  assert.throws(() => resolveIn('a/b.ts', 'left-pad'), t0011)
  // What is allowed stands: the framework's entry, a path inside, the page code, a runtime module of an import.
  assert.deepEqual(resolveIn('a/b.ts', './c.ts'), { path: 'a/c.ts' })
  assert.ok('framework' in resolveIn(undefined, 'tentjs'))
  assert.deepEqual(resolveIn('a/b.ts', 'node:crypto'), { runtime: 'node:crypto' })
})

// [05-19.6] A bundle's engine.ts that gives `room` does not open.
test('[05-19.6] a bundle whose engine.ts gives `room`, to run its code in the program, does not open: T0011', async (t) => {
  const folder = laidAttack(t, {
    // The makers of `engine.ts` are the members of its default export, as the program's are of `createEngine`.
    'engine.ts': "export default { room: () => { throw new Error('never made') } }\n",
  })
  await assert.rejects(
    testApp({ folder, room: 'program' }).then((app) => app.close()),
    (error) => codeOf(error) === 'T0011',
  )
})

// [05-19.7] Code of a sync query that loops for ever is ended at its time in a room that crosses.
test('[05-19.7] code of a sync query that loops for ever, to hold the engine thread, is ended at queryTime (T0008) in the test room, and the engine answers the next call', async (t) => {
  const app = await testApp({ folder: laidAttack(t), room: 'apart' })
  t.after(() => app.close())
  const ended = await app
    .as('nobody')
    .call('loops', {})
    .then(
      () => undefined,
      (error: unknown) => codeOf(error),
    )
  assert.equal(ended, 'T0008')
  assert.equal(await app.as('nobody').call('count', {}), 0, 'the engine answers the next call')
})

// A failure that nothing waits for ends a program of the runtime by default, so the engine must leave none behind.
test('[05-19.7] after a query that loops has ended its thread, closing the app in the test room leaves no failure that nothing waits for, which would end the program of the engine', async (t) => {
  const left: unknown[] = []
  const heard = (reason: unknown): void => void left.push(reason)
  process.on('unhandledRejection', heard)
  t.after(() => void process.off('unhandledRejection', heard))
  const app = await testApp({ folder: laidAttack(t), room: 'apart' })
  await app
    .as('nobody')
    .call('loops', {})
    .catch(() => undefined)
  await app.close()
  await new Promise((done) => setTimeout(done, 1500))
  assert.deepEqual(
    left.map((one) => String(Reflect.get(Object(one), 'message') ?? one)),
    [],
    'a failure of the room was left that nothing waits for',
  )
})

// [05-19.8] The engine starts only the programs of a python, an outside MCP server and the hold: app code names none.
test('[05-19.8] no file outside the seam asks the room for a program the description does not name: only python and the outside MCP server start one', () => {
  const engine = join(import.meta.dirname, '..')
  const callers: string[] = []
  const walk = (folder: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const full = join(folder, entry.name)
      const rel = full
        .slice(engine.length + 1)
        .split('\\')
        .join('/')
      if (entry.isDirectory()) {
        if (entry.name === 'rooms' || entry.name === 'tests' || entry.name === 'node_modules') continue
        walk(full)
      } else if (entry.name.endsWith('.ts') && /\broom\.program\(/.test(readFileSync(full, 'utf8'))) {
        callers.push(rel)
      }
    }
  }
  walk(engine)
  // The only callers of `room.program` are the pieces of a `python` and of an outside MCP server: app code reaches none.
  assert.deepEqual(callers.sort(), ['mcp/outside/programs.ts', 'python/call.ts', 'python/programs.ts'])
})
