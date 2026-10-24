import assert from 'node:assert/strict'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { App } from '../index.ts'
import { writeKey } from '../index.ts'
import { bundled } from './apps.ts'
import type { World } from './machines.ts'
import { addNote, current, machineAddress, tags, until, worldOf } from './machines.ts'

/** Opens the writer of a world with no readers named: the keys of its readers are rows of its keys. */
async function writerOf(world: World, t: TestContext, own = true): Promise<App> {
  const app = await world.engine().open((await bundled(t, {}, world.work)).folder, {
    dataFolder: join(world.work, 'writer'),
    mode: 'test',
    address: '*',
    ...(own ? { own: machineAddress.writer } : {}),
  })
  world.apps[machineAddress.writer] = app
  return app
}

/**
 * Has the beats of a world pass until a piece of work has ended: a write may wait for a near reader, for a time
 * that the clock of the world counts. Answers what it answered.
 */
async function beating<Answer>(world: World, work: Promise<Answer>): Promise<Answer> {
  let done = false
  const ended = work.finally(() => {
    done = true
  })
  for (let k = 0; k < 200 && !done; k++) await world.beat()
  return ended
}

/** Opens a reader of a world with a key of its own, which says whether it is far. */
async function readerOf(world: World, key: string, name: 'near' | 'far', far: boolean): Promise<App> {
  const app = await world.engine().read({
    from: machineAddress.writer,
    key,
    dataFolder: join(world.work, name),
    far,
    own: machineAddress[name],
    reach: world.reach,
    address: '*',
  })
  world.apps[machineAddress[name]] = app
  return app
}

test('[29-11] a reader joins with a key that holds the right copy or far, and with no other; one of far is far whatever it says, and its took is not believed', async (t) => {
  const world = worldOf(t)
  const writer = await writerOf(world, t)
  const copy = writeKey(writer, { name: 'near', rights: ['copy'] }).key
  const far = writeKey(writer, { name: 'far', rights: ['far'] }).key
  const read = writeKey(writer, { name: 'reads', rights: ['read'] }).key
  const api = writeKey(writer, { name: 'api', scopes: ['*'] }).key
  await addNote(writer, 'first')
  // A key of another right, and a key of the API, open no address of the link.
  for (const key of [read, api]) {
    const answer = await writer.request(
      new Request('https://writer.test/_t/copy/versions', { headers: { authorization: `Bearer ${key}` } }),
    )
    assert.equal(answer.status, 404)
  }
  const near = await readerOf(world, copy, 'near', false)
  await current(world, near)
  assert.deepEqual(await tags(near), ['first'])
  // The reader of a key of `far` says that it is near: it is far all the same.
  const distant = await readerOf(world, far, 'far', false)
  await current(world, distant)
  const rows = writer.machines()
  assert.equal(rows.find((one) => one.id === near.machines().find((m) => m.role !== 'writer')?.id)?.far ?? false, false)
  assert.equal(rows.filter((one) => one.role !== 'writer' && one.far).length, 1, 'one far reader')
  assert.equal(rows.filter((one) => one.role !== 'writer' && !one.far).length, 1, 'one near reader')
  // A far reader is believed in nothing it says of a new writer: its took stops no writer.
  const took = await writer.request(
    new Request('https://writer.test/_t/copy/took', {
      method: 'POST',
      headers: { authorization: `Bearer ${far}`, 'content-type': 'application/json' },
      body: JSON.stringify({ epoch: '999:zzzz', own: machineAddress.far }),
    }),
  )
  assert.notEqual(took.status, 200)
  await addNote(writer, 'second')
  assert.deepEqual((await tags(writer)).sort(), ['first', 'second'], 'the writer goes on')
})

test('[29-11] an app opened with no readers that has written keeps no change; a reader that joins it by a key, while writes go on, holds every write with one fetch; and the writer opened again serves it from what it kept', async (t) => {
  const world = worldOf(t)
  const writer = await writerOf(world, t, false)
  for (let n = 0; n < 5; n++) await addNote(writer, `before ${n}`)
  assert.equal(writer.machines().length, 1, 'an app of one machine')
  const copy = writeKey(writer, { name: 'near', rights: ['copy'] }).key
  // The first ask of the link loads it, and the reader dials again.
  const opening = readerOf(world, copy, 'near', false)
  let n = 0
  let joined: App | undefined
  const writes: Promise<unknown>[] = []
  void opening.then((one) => {
    joined = one
  })
  while (!joined && n < 60) {
    // A write may wait for the reader that joins, whose beats the clock of the world gives: it is not waited for here.
    writes.push(addNote(writer, `while ${n++}`))
    await world.beat()
  }
  assert.ok(joined, 'the reader joined')
  const near = await opening
  await current(world, near)
  await Promise.all(writes)
  assert.equal(world.asked['/_t/copy/data'], 1, 'one fetch of the data')
  await until('the reader holds every write', () => near.at().n === writer.at().n)
  assert.equal((await tags(near)).length, 5 + n)
  // The reader stops, the writer writes ten times and is opened again with no readers: it serves the reader from
  // what it kept, with no second fetch.
  await near.close()
  for (let k = 0; k < 10; k++) await beating(world, addNote(writer, `after ${k}`))
  await writer.close()
  await writerOf(world, t, false)
  const back = await readerOf(world, copy, 'near', false)
  await current(world, back)
  assert.equal((await tags(back)).length, 15 + n)
  assert.equal(world.asked['/_t/copy/data'], 1, 'still one fetch: the ten writes came from what was kept')
})
