import assert from 'node:assert/strict'
import test from 'node:test'
import type { ChangeSink } from '../index.ts'
import { bundled, engineOf } from './apps.ts'
import { addNote, current, machineAddress, readerIn, readers, until, worldOf } from './machines.ts'

type SinkChange = Parameters<ChangeSink['wrote']>[0]

test("[29-7@7a] a ChangeSink is the writer's: a reader starts none, and the machine that took over starts it and hands it its writes", async (t) => {
  const world = worldOf(t)
  // One database of the builder's own, which the sink of each machine writes into.
  const database: { starts: string[]; took: SinkChange[] } = { starts: [], took: [] }
  const engineFor = (machine: string) =>
    engineOf(t, {
      makers: {
        clock: () => world.clock.clock,
        changes: (): ChangeSink => ({
          start(n) {
            database.starts.push(machine)
            return database.took.at(-1)?.n ?? n
          },
          wrote(change) {
            database.took.push(change)
          },
        }),
      },
    })
  const bundle = await bundled(t, {}, world.work)
  const writer = await engineFor('writer').open(bundle.folder, {
    dataFolder: `${world.work}/writer`,
    mode: 'test',
    address: '*',
    own: machineAddress.writer,
    readers,
  })
  world.apps[machineAddress.writer] = writer
  await addNote(writer, 'by the writer')
  const near = await readerIn(world, 'near', engineFor('near'))
  await current(world, near)
  // The reader started no sink: the writes it applies are the writer's to hand on.
  assert.deepEqual(database.starts, ['writer'])
  const handed = database.took.length
  assert.ok(handed > 0)

  // The writer is gone, and the reader takes over: it starts the sink, and hands it what it writes from then on.
  world.apps[machineAddress.writer] = undefined
  await writer.close()
  await world.beat(7)
  await near.takeOver()
  assert.deepEqual(database.starts, ['writer', 'near'])
  await addNote(near, 'by the machine that took over')
  await until('the sink was handed the write of the new writer', () =>
    database.took
      .slice(handed)
      .some((one) => one.rows?.some((row) => Object(row.row).name === 'by the machine that took over')),
  )
})
