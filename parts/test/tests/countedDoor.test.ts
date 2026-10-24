import assert from 'node:assert/strict'
import test from 'node:test'
import { counts } from '../../engine/index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

test('[21-22] a screen that is drawn, a route and a call coming in are each counted under their names on a built project, with calls, ms, mainCpuMs and bytesOut, and the processor time of the queries a screen reads is booked to the screen', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'countedDoor') })
  closing(t, () => app.close())
  const page = await app.request(new Request('http://localhost/'))
  assert.equal(page.status, 200)
  const html = await page.text()
  const feed = await app.request(new Request('http://localhost/feed'))
  const feedText = await feed.text()
  const hook = await app.request(
    new Request('http://localhost/hooks/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
    }),
  )
  await hook.text()
  // What was gathered is written once a minute has passed by the clock of the app.
  app.clock.advance('1 minute')
  const rows: unknown = await app.read(counts.where({}), { as: 'system' })
  const all = (Array.isArray(rows) ? rows : []).map((one) => Object(one))
  const sum = (name: string, unit: string): number =>
    all.filter((one) => one.name === name && one.unit === unit).reduce((total, one) => total + Number(one.amount), 0)
  for (const name of ['homeScreen', 'feed', 'openEvents']) {
    assert.ok(sum(name, 'calls') >= 1, `${name} is counted`)
    assert.ok(sum(name, 'ms') > 0, `${name} took some time`)
  }
  assert.equal(sum('homeScreen', 'bytesOut'), new TextEncoder().encode(html).length)
  assert.equal(sum('feed', 'bytesOut'), new TextEncoder().encode(feedText).length)
  // The query of the screen held the processor: that time is the screen's, and not the query's alone.
  assert.ok(sum('homeScreen', 'mainCpuMs') + sum('homeScreen', 'cpuMs') >= 5, JSON.stringify(all))
})
