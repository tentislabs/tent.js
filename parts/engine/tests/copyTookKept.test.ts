import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { bundled } from './apps.ts'
import {
  addNote,
  current,
  keys,
  machineAddress,
  placeTold,
  rawLink,
  readerIn,
  readers,
  until,
  worldOf,
  writerIn,
} from './machines.ts'

for (const [right, key, far, role] of [
  ['far', keys.far, true, 'writer'],
  ['copy', keys.other, false, 'reader'],
] as const)
  test(`[29-11.9] a reader with a key of the right ${right} that states the address a writer took over from as its own: the writer ${far ? 'still knows whom it took over from, and started again with the address it read it goes on as the writer' : 'takes it for the old writer that came back, and forgets the address'}`, async (t) => {
    const world = worldOf(t)
    const first = world.engine()
    const app = await writerIn(world, await bundled(t, {}, world.work), first)
    const second = world.engine()
    const near = await readerIn(world, 'near', second)
    await current(world, near)
    await addNote(app, 'one')
    // The writer is gone, and the near reader takes over from its address.
    world.apps[machineAddress.writer] = undefined
    await first.close()
    await world.beat(7)
    await near.takeOver()
    // A reader joins with that key, and states the address of the writer that is gone as the one it is reached by.
    const joined = rawLink(near, key)
    joined.link.send(placeTold(near, 'machine-that-states', { far, own: machineAddress.writer }))
    await until('the reader was taken', () => joined.got.some((one) => one.t === 'go'))
    joined.link.close()
    world.apps[machineAddress.near] = undefined
    await second.close()
    // The machine that took over is started again by the command that nobody changed: with the address it read.
    const again = await world.engine().read({
      from: machineAddress.writer,
      key: keys.near,
      dataFolder: join(world.work, 'near'),
      own: machineAddress.near,
      readers,
      reach: world.reach,
      address: '*',
    })
    assert.equal(again.role, role)
  })
