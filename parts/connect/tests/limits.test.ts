import assert from 'node:assert/strict'
import type { ServerResponse } from 'node:http'
import test from 'node:test'
import { get, service } from '../../core/index.ts'
import { calling } from './calling.ts'
import { standIn } from './servers.ts'

test('[24-4] with `perSecond: 20` the 21st call of a second starts in the next', async (t) => {
  const server = await standIn(t, (_, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end('{}')
  })
  const shop = service('shop', {
    url: server.origin,
    limits: { perSecond: 20 },
    calls: { one: get('/o', { input: {} }) },
  })
  const counted = calling([shop])
  const began = counted.at()
  await Promise.all(Array.from({ length: 21 }, () => counted.call('shop', 'one', {})))
  assert.equal(server.asked.length, 21)
  // The clock of the test moves only by a wait: the first twenty waited for nothing, and the 21st for the next second.
  assert.equal(counted.slept.filter((ms) => ms > 0).length, 1)
  assert.ok(counted.at() - began >= 1000)
  assert.ok(counted.at() - began < 2000)
})

test('[24-4] with `perMinute: 3` the fourth call of a minute waits for the minute', async (t) => {
  const server = await standIn(t, (_, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end('{}')
  })
  const shop = service('shop', {
    url: server.origin,
    limits: { perMinute: 3 },
    calls: { one: get('/o', { input: {} }) },
  })
  const counted = calling([shop])
  const began = counted.at()
  for (let n = 0; n < 4; n++) await counted.call('shop', 'one', {})
  assert.ok(counted.at() - began >= 60_000)
})

test('[24-4] with `atOnce: 2` a third call waits for one of the two to end', async (t) => {
  const held: ServerResponse[] = []
  const server = await standIn(t, (_, response) => void held.push(response))
  const shop = service('shop', {
    url: server.origin,
    limits: { atOnce: 2 },
    calls: { one: get('/o', { input: {} }) },
  })
  const counted = calling([shop], { real: true })
  const calls = [counted.call('shop', 'one', {}), counted.call('shop', 'one', {}), counted.call('shop', 'one', {})]
  const until = async (count: number): Promise<void> => {
    const ends = performance.now() + 10_000
    while (server.asked.length < count) {
      assert.ok(performance.now() < ends, `${server.asked.length} requests arrived`)
      await new Promise((done) => setTimeout(done, 5))
    }
  }
  await until(2)
  await new Promise((done) => setTimeout(done, 200))
  assert.equal(server.asked.length, 2, 'the third waits while two are under way')
  const first = held.shift()
  first?.writeHead(200, { 'content-type': 'application/json' })
  first?.end('{}')
  await until(3)
  for (const one of held) {
    one.writeHead(200, { 'content-type': 'application/json' })
    one.end('{}')
  }
  await Promise.all(calls)
})

test('[24-4] under `atOnce: 1` a call whose wait ends leaves no place behind it: the next freed place goes to a call that still waits', async (t) => {
  const held: ServerResponse[] = []
  const server = await standIn(t, (_, response) => void held.push(response))
  const shop = service('shop', {
    url: server.origin,
    limits: { atOnce: 1 },
    calls: { one: get('/o', { input: {} }) },
  })
  const counted = calling([shop], { real: true })
  const until = async (count: number): Promise<void> => {
    const ends = performance.now() + 10_000
    while (server.asked.length < count) {
      assert.ok(performance.now() < ends, `${server.asked.length} requests arrived`)
      await new Promise((done) => setTimeout(done, 5))
    }
  }
  const first = counted.call('shop', 'one', {})
  await until(1)
  const ended = new AbortController()
  const gone = counted.call('shop', 'one', {}, { signal: ended.signal })
  const live = counted.call('shop', 'one', {})
  await new Promise((done) => setTimeout(done, 50))
  ended.abort(new Error('the time of the action is over'))
  await assert.rejects(gone)
  const answer = (): void => {
    const one = held.shift()
    one?.writeHead(200, { 'content-type': 'application/json' })
    one?.end('{}')
  }
  answer()
  await first
  // The call that still waits is woken by the freed place, and not the one whose wait ended.
  await until(2)
  answer()
  await live
  assert.equal(server.asked.length, 2)
})

test('[24-4] the limits are counted for each service apart', async (t) => {
  const server = await standIn(t, (_, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end('{}')
  })
  const of = (name: string) =>
    service(name, { url: server.origin, limits: { perMinute: 1 }, calls: { one: get('/o', { input: {} }) } })
  const counted = calling([of('first'), of('second')])
  await counted.call('first', 'one', {})
  await counted.call('second', 'one', {})
  assert.deepEqual(
    counted.slept.filter((ms) => ms > 0),
    [],
  )
})
