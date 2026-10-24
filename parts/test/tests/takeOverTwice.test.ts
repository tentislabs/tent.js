import assert from 'node:assert/strict'
import test from 'node:test'
import { beat, codeOf, level, machinesOf, send, titles } from './many.ts'

test('[29-7] a second takeOver while one is under way is answered as the first is: one taking over at a time, one new epoch, and a machine that is the writer after it', async (t) => {
  const { app, near } = await machinesOf(t)
  for (const title of ['one', 'two']) await send(app, 'addOrder', { title })
  await level(app, near)
  const before = app.at()
  await app.kill()
  await beat(near, 6)
  // What the writer counted as it was killed may have reached the reader: it holds that too, past the last call.
  const held = near.at().n
  assert.ok(held >= before.n)
  // Two are asked at once, and a third a turn of the program later, while the first still waits for its files.
  const first = near.takeOver()
  const second = near.takeOver()
  await Promise.resolve()
  const third = near.takeOver()
  const [a, b, c] = await Promise.all([first, second, third])
  assert.deepEqual([b, c], [a, a])
  assert.deepEqual([near.role, a.n, a.epoch.split('.')[0]], ['writer', held + 1, '2'])
  assert.equal(near.at().epoch, a.epoch)
  assert.deepEqual(await titles(near), ['one', 'two'])
  assert.equal((await send(near, 'addOrder', { title: 'by the new writer' })).status, 200)
  // Asked once it is done, it is the writer already.
  assert.equal(await codeOf(near.takeOver()), 'T0030')
})
