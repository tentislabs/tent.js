import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { bundled, send, system } from './apps.ts'
import { addNote, current, machineAddress, moment, readerIn, readers, tags, worldOf, writerIn } from './machines.ts'

/** Has a piece of work end within a time of the test's own, and fails with its name where it does not. */
function within<Answer>(what: string, work: Promise<Answer>, ms = 15_000): Promise<Answer> {
  return new Promise((done, failed) => {
    const timer = setTimeout(() => failed(new Error(`it did not end within ${ms} ms: ${what}`)), ms)
    work.then(
      (answer) => {
        clearTimeout(timer)
        done(answer)
      },
      (error) => {
        clearTimeout(timer)
        failed(error)
      },
    )
  })
}

/** The names of the tags in the data file of a machine, read on the disk beside whatever holds it open. */
function tagsOnDisk(folder: string): string[] {
  const db = new DatabaseSync(join(folder, 'data.db'), { readOnly: true })
  try {
    return db
      .prepare('SELECT "name" FROM "tags" ORDER BY "name"')
      .all()
      .map((row) => String(row.name))
  } finally {
    db.close()
  }
}

test('[29-11.5] an old writer that comes back and is sent writes: T0030 for each, and its readers take nothing from it', {
  timeout: 120_000,
}, async (t) => {
  const world = worldOf(t)
  const bundle = await bundled(t, {}, world.work)
  const oldEngine = world.engine()
  const old = await writerIn(world, bundle, oldEngine)
  const near = await readerIn(world, 'near')
  const far = await readerIn(world, 'far')
  await current(world, near)
  await current(world, far)
  // A write of the old writer waits for its near reader, which the beats of the test let confirm.
  const first = addNote(old, 'settled before the writer stopped')
  for (let i = 0; i < 20 && near.at().n !== old.at().n; i++) await world.beat()
  await within('the write of the old writer was answered', first)

  // The writer stops, as a machine that lost its power does.
  world.apps[machineAddress.writer] = undefined
  await within('the old writer closed', oldEngine.close())
  // Its near reader hears nothing of it, is current no more, and takes over.
  for (let i = 0; i < 30 && near.at().current; i++) await world.beat()
  assert.equal(near.at().current, false, 'the near reader is current no more once its writer is gone')
  const took = await within('the near reader took over', near.takeOver())
  assert.equal(near.role, 'writer')
  assert.equal(took.epoch.split('.')[0], '2')
  const second = addNote(near, 'written by the new writer')
  for (let i = 0; i < 10; i++) await world.beat()
  await within('the write of the new writer was answered', second)

  // The old writer comes back on its folder, started as it was started before, with no word of what happened.
  const backEngine = world.engine()
  const back = await within(
    'the old writer opened again',
    backEngine.open(bundle.folder, {
      dataFolder: join(world.work, 'writer'),
      mode: 'test',
      address: '*',
      own: machineAddress.writer,
      readers,
    }),
  )
  world.apps[machineAddress.writer] = back
  // The machine that took over tells it so, every beat, until it is answered: the old writer is stopped for good.
  /** Has the beats of the machines pass while a piece of work waits, which may wait for a time of the app's clock. */
  const beating = async <Answer>(what: string, work: Promise<Answer>): Promise<Answer> => {
    let over = false
    const ended = () => {
      over = true
    }
    work.then(ended, ended)
    for (let i = 0; i < 200 && !over; i++) await world.beat()
    return within(what, work, 2000)
  }
  const asked = (name: string, input: object = {}) =>
    beating(`the old writer answered ${name}`, send(back, `https://writer.test/_t/call/${name}`, { input }))
  let stopped = false
  for (let i = 0; i < 40 && !stopped; i++) {
    await world.beat()
    stopped = (await asked('addWord', { text: `sent to the old writer ${i}` })).error.code === 'T0030'
  }
  assert.equal(stopped, true, 'the old writer was told that a machine took over, and stopped')
  // From then on each write that it is sent is T0030, whoever sends it and however.
  for (let i = 0; i < 5; i++) {
    const answer = await asked('addWord', { text: `refused ${i}` })
    assert.deepEqual([answer.status, answer.error.code], [409, 'T0030'], `write ${i}`)
  }
  const code = async (work: Promise<unknown>): Promise<unknown> =>
    beating('a member of the old writer answered', work).then(
      () => undefined,
      (error: unknown) => Object(error).code,
    )
  assert.equal(await code(addNote(back, 'by the program that holds it')), 'T0030')
  assert.equal(await code(back.call('addWord', { text: 'by a call in code' }, { as: system })), 'T0030')
  // Its folder does not open as a writer again.
  await within('the old writer closed again', backEngine.close())
  world.apps[machineAddress.writer] = undefined
  const again = world.engine()
  const opened = again.open(bundle.folder, { dataFolder: join(world.work, 'writer'), mode: 'test', readers })
  assert.equal(await code(opened), 'T0030')

  // Its readers took nothing from it: both follow the new writer, and hold what it wrote and no word of the old one.
  for (let i = 0; i < 60 && (far.at().n !== near.at().n || !far.at().current); i++) await world.beat()
  await moment(50)
  const held = await within('the new writer answered a read', tags(near))
  assert.deepEqual(held, ['settled before the writer stopped', 'written by the new writer'])
  assert.deepEqual(tagsOnDisk(join(world.work, 'far')), [...held].sort())
  assert.equal(far.at().epoch, near.at().epoch, 'the far reader follows the machine that took over')
  for (const folder of ['near', 'far', 'writer']) {
    const words = new DatabaseSync(join(world.work, folder, 'data.db'), { readOnly: true })
    try {
      assert.equal(Number(words.prepare('SELECT count(*) AS n FROM "words"').get()?.n), 0, folder)
    } finally {
      words.close()
    }
  }
})
