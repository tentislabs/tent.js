import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { beat, codeOf, current, folderOf, level, machinesOf, moment, send, titles, until, writerOf } from './many.ts'

const lostIn = (folder: string): string[] => readdirSync(folder).filter((name) => name.startsWith('lost.'))

test('[29-7] with the writer killed the near reader takes over with every settled write, the far reader follows it by its own address, and the old writer comes back as a reader', async (t) => {
  const { app, near, far } = await machinesOf(t)
  for (const title of ['one', 'two', 'three']) await send(app, 'addOrder', { title })
  await level(app, near, far)
  const before = app.at()
  // A reader that is current does not take over: its writer runs.
  assert.equal(await codeOf(near.takeOver()), 'T0032')
  assert.equal(await codeOf(app.takeOver()), 'T0030')
  await app.kill()
  await beat(near, 6)
  assert.equal(near.at().current, false)
  // What the writer counted as it was killed may have reached the reader: it holds that too, past the last call.
  const held = near.at().n
  assert.ok(held >= before.n)
  const took = await near.takeOver()
  // It is the writer of everything that was settled, under a new epoch of its own.
  assert.deepEqual([near.role, took.n, took.epoch.split('.')[0]], ['writer', held + 1, '2'])
  assert.equal(took.epoch, near.at().epoch)
  assert.deepEqual(await titles(near), ['one', 'two', 'three'])
  assert.equal((await send(near, 'addOrder', { title: 'by the new writer' })).status, 200)
  // The far reader finds the new writer by the address the near reader stated, and follows it.
  await until(
    'the far reader follows the new writer',
    async () => {
      await beat(far)
      return far.at().epoch === took.epoch && far.at().n === near.at().n
    },
    40,
  )
  await current(near, far)
  assert.equal(Object((await send(far, 'listOrders')).value).length, 4)
  // The old writer, started again as a reader of the new one, held nothing that the new one lacks: it goes on
  // with its data, and is a reader.
  await app.restart({ reads: near })
  await until(
    'the old writer follows the new one',
    async () => {
      await beat(near)
      return app.role === 'reader' && app.at().n === near.at().n
    },
    40,
  )
  assert.deepEqual(lostIn(folderOf(t, 'data')), [])
  assert.equal(app.at().epoch, took.epoch)
  await current(near, app)
  assert.equal(Object((await send(app, 'listOrders')).value).length, 4)
})

test('[29-7] a near reader that was cut off takes over without the writes that were answered meanwhile, and the old writer keeps them as lost', async (t) => {
  const { app, near } = await machinesOf(t)
  await send(app, 'addOrder', { title: 'settled on both' })
  await level(app, near)
  near.cut()
  await beat(app, 7)
  // The writer stopped waiting for the reader, and answers on.
  assert.equal((await send(app, 'addOrder', { title: 'answered by the old writer alone' })).status, 200)
  const [old, n] = [app.at().n, near.at().n]
  assert.equal(old, n + 1)
  await app.kill()
  const took = await near.takeOver()
  assert.equal(took.n, n + 1)
  assert.deepEqual(await titles(near), ['settled on both'])
  // The old writer comes back as a reader: what it held and the new writer lacks is kept as a lost file.
  near.join()
  await app.restart({ reads: near })
  await until(
    'the old writer fetched the data of the new one',
    async () => {
      await beat(near)
      return app.role === 'reader' && app.at().epoch === took.epoch && app.at().n === near.at().n
    },
    40,
  )
  assert.deepEqual(lostIn(folderOf(t, 'data')), [`lost.1.${old}.db`])
  await current(near, app)
  assert.deepEqual(await titles(app), ['settled on both'])
})

test('[29-7] an old writer that is told took stops for good, and a took of a far key or of a reader stops nothing', async (t) => {
  const { app, near, far } = await machinesOf(t)
  await send(app, 'addOrder', { title: 'one' })
  await level(app, near, far)
  // A far reader that takes over is not believed: the writer goes on.
  far.cut()
  await beat(app, 7)
  await far.takeOver()
  await beat(app, 2)
  assert.equal(app.role, 'writer')
  assert.equal((await send(app, 'addOrder', { title: 'the writer goes on' })).status, 200)
  // The near reader takes over while the old writer still runs: its took stops the old writer for good.
  near.cut()
  await beat(app, 7)
  const took = await near.takeOver()
  await until(
    'the old writer was told',
    async () => {
      await beat(app)
      return (await send(app, 'addOrder', { title: 'refused' })).code === 'T0030'
    },
    20,
  )
  const read = await send(app, 'listOrders')
  assert.deepEqual([read.status, read.code], [503, 'T0029'])
  assert.equal(near.role, 'writer')
  assert.equal(near.at().epoch, took.epoch)
  // Its folder is not opened again as a writer.
  await app.kill()
  assert.equal(await codeOf(app.restart()), 'T0030')
  await moment()
})

test('[29-7] tent machines answers the epoch, the machines and nothing else, then another writer that was heard of with its address, and on a stopped writer the one that stopped it', async (t) => {
  const { app, near, far } = await machinesOf(t)
  /** What the command of the admin channel answers on the first machine of the test. */
  const listed = async (): Promise<Record<string, unknown>> => {
    const { port, token } = JSON.parse(readFileSync(join(folderOf(t, 'data'), 'engine.json'), 'utf8'))
    const answer = await app.request(
      new Request(`http://127.0.0.1:${port}/_t/admin/machines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ args: {} }),
      }),
    )
    return Object(Object(await answer.json()).value)
  }
  assert.deepEqual(Object.keys(await listed()).sort(), ['epoch', 'machines'])
  const ownOf = (id: string): string | undefined => app.machines().find((one) => one.id === id)?.own
  const [nearOwn, farOwn] = [ownOf(near.machines()[1].id), ownOf(near.machines()[2].id)]
  // A far reader that takes over is not believed: the writer goes on, and names it as another writer.
  far.cut()
  await beat(app, 7)
  const first = await far.takeOver()
  await until('the writer heard of the far reader that took over', async () => {
    await beat(app)
    return (await listed()).other !== undefined
  })
  assert.deepEqual((await listed()).other, { epoch: first.epoch, own: farOwn })
  assert.deepEqual(Object.keys(await listed()).sort(), ['epoch', 'machines', 'other'])
  assert.equal(app.role, 'writer')
  // The near reader takes over, and its took stops the writer: a stopped writer names the one that stopped it.
  near.cut()
  await beat(app, 7)
  const second = await near.takeOver()
  await until('the old writer was stopped', async () => {
    await beat(app)
    return (await send(app, 'addOrder', { title: 'refused' })).code === 'T0030'
  })
  assert.deepEqual((await listed()).other, { epoch: second.epoch, own: nearOwn })
})

test('[29-7] two readers that take over at the same write end with one writer', async (t) => {
  const app = await writerOf(t)
  const [first, second] = [await app.reader(), await app.reader()]
  await current(app, first, second)
  await send(app, 'addOrder', { title: 'one' })
  await level(app, first, second)
  first.cut()
  second.cut()
  await beat(app, 7)
  const [a, b] = [await first.takeOver(), await second.takeOver()]
  assert.equal(a.n, b.n)
  assert.notEqual(a.epoch, b.epoch)
  first.join()
  second.join()
  // Each tells the old writer, which still answers: the one of the newer epoch stays, and the other gives way.
  const writes = async (one: typeof first): Promise<boolean> =>
    (await send(one, 'addOrder', { title: 'x' })).status === 200
  await until(
    'one writer is left',
    async () => {
      await beat(app)
      const [one, other] = [await writes(first), await writes(second)]
      return one !== other
    },
    30,
  )
  const newer = a.epoch > b.epoch ? first : second
  assert.equal(await writes(newer), true)
  assert.equal((await send(app, 'addOrder', { title: 'the old writer is stopped' })).code, 'T0030')
})

test('[29-7] a writer that opens behind its near reader stands back, stands back again when it is opened once more, and a take-over on either of the two ends it', async (t) => {
  for (const on of ['reader', 'writer'] as const) {
    const { app, near } = await machinesOf(t)
    await send(app, 'addOrder', { title: 'kept' })
    const mark = await app.mark()
    for (let i = 0; i < 5; i++) await send(app, 'addOrder', { title: `lost ${i}` })
    await level(app, near)
    const held = near.at().n
    // The writer loses power, and opens five writes behind the near reader that holds them.
    near.cut()
    await app.kill()
    await app.restart({ at: mark })
    near.join()
    await until(
      'the writer stands back',
      async () => {
        await beat(app)
        return (await send(app, 'listOrders')).code === 'T0029'
      },
      20,
    )
    assert.equal((await send(app, 'addOrder', { title: 'refused' })).code, 'T0029')
    assert.equal(app.at().n, held - 5)
    // Opened once more, it stands back again.
    await app.kill()
    await app.restart()
    assert.equal((await send(app, 'listOrders')).code, 'T0029', on)
    if (on === 'reader') {
      // The reader goes on with all it holds, and stops the writer with its took.
      await beat(app, 6)
      const took = await near.takeOver()
      assert.equal(took.n, held + 1)
      assert.equal((await titles(near)).length, 6)
    } else {
      // The writer goes on with what it holds, under a new epoch, and the reader keeps its file as lost.
      const took = await app.takeOver()
      assert.equal(took.epoch.split('.')[0], '2')
      assert.equal((await send(app, 'addOrder', { title: 'the writer goes on' })).status, 200)
      await until(
        'the reader fetched the data anew',
        async () => {
          await beat(app)
          return near.at().epoch === took.epoch && near.at().n === app.at().n
        },
        40,
      )
      assert.deepEqual(lostIn(folderOf(t, 'reader-2')), [`lost.1.${held}.db`])
      assert.deepEqual(await titles(app), ['kept', 'the writer goes on'])
    }
    await app.close()
  }
})

test('[29-7] a far reader that is started again while its writer is gone still finds the machine that took over, by the address that its writer last named and that its data keeps', async (t) => {
  const { app, near, far } = await machinesOf(t)
  await send(app, 'addOrder', { title: 'one' })
  await level(app, near, far)
  // The far reader is stopped. Its writer is killed, and the near reader takes over.
  await far.kill()
  await app.kill()
  await beat(near, 6)
  const took = await near.takeOver()
  await send(near, 'addOrder', { title: 'by the new writer' })
  // Started again with the address of the writer that is gone, it was told the machines by nobody since.
  await far.restart({ reads: app })
  await until(
    'the far reader follows the new writer',
    async () => {
      await beat(near)
      return far.at().epoch === took.epoch && far.at().n === near.at().n
    },
    60,
  )
  await current(near, far)
  assert.deepEqual(await titles(far), ['one', 'by the new writer'])
})
