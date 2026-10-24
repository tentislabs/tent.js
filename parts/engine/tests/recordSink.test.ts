import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import type { ChangeSink } from '../index.ts'
import { codeOf, running, system, testClock, workFolder } from './apps.ts'

type Whole = Parameters<NonNullable<ChangeSink['renew']>>[0]
type SinkChange = Parameters<ChangeSink['wrote']>[0]

/** A copy that is the place of record, as a builder's database would be: it holds every write it took, and all of it anew at `renew`. */
function record(o: { n?: number; source?: Whole } = {}) {
  const { source } = o
  const took: SinkChange[] = []
  const renewed: { n: number; layout: Whole['layout']; tables: Record<string, unknown[]> }[] = []
  let held = 0
  let gate: Promise<void> = Promise.resolve()
  let open = (): void => undefined
  const sink: ChangeSink = {
    held: true,
    // It holds what it took: a number that it is told and that it does not hold is told by what it answers.
    start: () => ({ n: o.n ?? held, all: true }),
    async wrote(change) {
      await gate
      took.push(change)
      held = change.n
    },
    async renew(whole) {
      const tables: Record<string, unknown[]> = {}
      for await (const one of whole.tables) tables[one.table] = [...(tables[one.table] ?? []), ...one.rows]
      renewed.push({ n: whole.n, layout: whole.layout, tables })
      held = whole.n
    },
    ...(source ? { source: async () => source } : {}),
  }
  return {
    sink,
    took,
    renewed,
    /** Holds back every write that it is handed, until `release`. */
    hold() {
      gate = new Promise((done) => {
        open = done
      })
    },
    release: () => open(),
  }
}

/** Whether a promise is still waiting after the turns of the program that its answer would need. */
async function waits(work: Promise<unknown>): Promise<boolean> {
  let settled = false
  void work.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  for (let i = 0; i < 20; i++) await new Promise((done) => setImmediate(done))
  return !settled
}

test('[29-9@7a] with a sink that states held, a write is answered only once the sink took it; with the sink stopped answers wait, and after behind a new write is T0031', async (t) => {
  const copy = record()
  const { clock, advance } = testClock()
  const run = await running(t, { engine: { makers: { clock: () => clock, changes: () => copy.sink } } })
  await run.app.call('addTag', { name: 'first' }, { as: system })
  assert.equal(
    copy.took.at(-1)?.rows?.some((one) => one.table === 'tags'),
    true,
  )
  // The sink holds the next write back: the call that wrote it is not answered until the sink took it.
  copy.hold()
  const second = run.app.call('addTag', { name: 'second' }, { as: system })
  assert.equal(await waits(second), true)
  copy.release()
  await second
  assert.equal(
    copy.took.at(-1)?.rows?.some((one) => Object(one.row).name === 'second'),
    true,
  )
  // Stopped, the sink takes nothing: the answer waits, and once it has waited for behind a new write is refused.
  copy.hold()
  const third = run.app.call('addTag', { name: 'third' }, { as: system })
  assert.equal(await waits(third), true)
  advance(6000)
  assert.equal(await codeOf(run.app.call('addTag', { name: 'fourth' }, { as: system })), 'T0031')
  copy.release()
  await third
})

test('[29-9@7a] a sink that holds another number than the data at start is handed everything anew; an engine that opens on an empty folder with a sink that states source answers what the first engine did, under a new epoch', async (t) => {
  const first = await running(t, { engine: { makers: { changes: () => record().sink } } })
  for (const name of ['one', 'two', 'three']) await first.app.call('addTag', { name }, { as: system })
  const asked = await first.app.call('publicTags', {}, { as: system })
  const n = first.app.at().n
  await first.app.close()

  // Opened again with a sink that holds nothing yet: it is handed the whole data, at the number the data stands at.
  const again = record({ n: 0 })
  const second = await first.engine.open(first.bundle.folder, {
    dataFolder: first.dataFolder,
    mode: 'test',
    makers: { changes: () => again.sink },
  })
  assert.equal(again.renewed.length, 1)
  // The data stands where the first engine left it: past its last call by what the engine counted as it closed.
  assert.ok(again.renewed[0].n >= n, `${again.renewed[0].n} holds ${n}`)
  assert.deepEqual(again.renewed[0].tables.tags?.map((one) => Object(one).name).sort(), ['one', 'three', 'two'])
  const epoch = second.at().epoch
  await second.close()

  // An empty folder, and a sink that is the place of record: the data is made from what it holds.
  const kept = again.renewed[0]
  const source = record({
    n,
    source: {
      n,
      layout: kept.layout,
      tables: (async function* () {
        for (const [table, rows] of Object.entries(kept.tables)) yield { table, rows: rows.map((one) => Object(one)) }
      })(),
    },
  })
  const third = await first.engine.open(first.bundle.folder, {
    dataFolder: join(workFolder(t), 'data'),
    mode: 'test',
    makers: { changes: () => source.sink },
  })
  assert.deepEqual(await third.call('publicTags', {}, { as: system }), asked)
  // It goes on from the number that the record gave: the write that begins the new epoch is its first change.
  assert.ok(third.at().n > n)
  assert.notEqual(third.at().epoch, epoch)
  await third.close()
})

test('[29-9@7a] after a restore the place of record is handed everything anew, as the data holds it', async (t) => {
  const copy = record()
  const run = await running(t, { engine: { makers: { changes: () => copy.sink } } })
  await run.app.call('addTag', { name: 'kept' }, { as: system })
  const file = join(workFolder(t), 'snapshot.db')
  await run.app.snapshot(file)
  await run.app.call('addTag', { name: 'after' }, { as: system })
  const before = copy.renewed.length
  await run.app.restore(file)
  for (let i = 0; i < 200 && copy.renewed.length === before; i++) await new Promise((done) => setTimeout(done, 10))
  assert.equal(copy.renewed.length, before + 1)
  assert.deepEqual(
    copy.renewed.at(-1)?.tables.tags?.map((one) => Object(one).name),
    ['kept'],
  )
})
