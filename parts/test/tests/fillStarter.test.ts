import assert from 'node:assert/strict'
import test from 'node:test'
import { appIn } from './desks.ts'
import type { Seen } from './filling/helpers/seen.ts'
import { listened } from './probe.ts'
import { copyOf } from './projects.ts'
import { logOf } from './sieges.ts'

const moment = (ms = 20): Promise<void> => new Promise((done) => setTimeout(done, ms))

test('[51-12] the work of a filled column runs as the system under the starter of its column, which the log of its call names', async (t) => {
  const seen: Seen = { calls: [] }
  listened(t, 'tentjs.test.filling', (told) => void seen.calls.push(Object(told)))
  const { app, dataFolder } = await appIn(t, copyOf(t, 'filling'))
  await app.write([{ add: 'orders', values: { title: 'Tea', note: 'green' } }], { as: 'system' })
  for (let i = 0; i < 300 && !logOf(dataFolder, 'calls').some((row) => row.callerId === 'fill:orders.summary'); i++) {
    app.clock.advance('1 second')
    await moment()
  }
  const [row] = logOf(dataFolder, 'calls').filter((one) => one.callerId === 'fill:orders.summary')
  assert.ok(row, 'the call of the work names the starter of its column')
  assert.equal(row.callerKind, 'system')
})
