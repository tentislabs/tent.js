import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fetchPart } from '../index.ts'
import { nobody, refusal, workFolder } from './apps.ts'
import { everythingIn, lineOf, needing, partServer, placeOf, tgzOf } from './archives.ts'

test('[05-7.14] the address of a part that answers 404, or whose bytes are not the pinned ones, is told with no name, no password and nothing after a question mark', async (t) => {
  const bytes = tgzOf([{ path: 'tool.txt', text: 'the tool' }])
  const server = await partServer(t, { '/other.tgz?key=the-key': tgzOf([]) })
  const folder = workFolder(t)
  const told = async (from: string, own?: string): Promise<string> => {
    const list = [lineOf('tool', '1.0.0', from, bytes)]
    const error = await refusal(fetchPart('tool', { list, folder, mode: 'development', ...(own ? { from: own } : {}) }))
    assert.equal(error.code, 'T0016')
    const all: string[] = []
    for (let one: unknown = error, depth = 0; one instanceof Error && depth < 10; one = one.cause, depth++)
      all.push(one.message, JSON.stringify(Object.entries(one)))
    return all.join(' ')
  }
  const secret = /the-user|the-password|the-key/
  // An answer of 404, other bytes than the pinned ones, a name and a password, and a place where nothing listens.
  for (const from of [
    `${server.origin}/gone.tgz?key=the-key`,
    `${server.origin}/other.tgz?key=the-key`,
    `http://the-user:the-password@127.0.0.1:${server.port}/gone.tgz?key=the-key`,
    'http://127.0.0.1:9/tool.tgz?key=the-key',
  ]) {
    const all = await told(from)
    assert.ok(!secret.test(all), all)
    assert.ok(all.includes('tool'), all)
  }
  // An address of the builder's own, with a key in it: the fetch is still told without it.
  const all = await told('https://parts.example.test/gone.tgz', `${server.origin}/mirror?key=the-key`)
  assert.ok(!secret.test(all), all)
  assert.ok(all.includes(`${server.origin}/`), all)
})

test("[22-6] what a call of fetchPart does not give is taken from where it is made: the mode of the app, and the runner's folder", async (t) => {
  const bytes = tgzOf([{ path: 'tool.txt', text: 'the tool' }])
  const server = await partServer(t, { '/tool.tgz': bytes })
  const list = [lineOf('tool', '1.0.0', `${server.origin}/tool.tgz`, bytes)]
  const home = workFolder(t)
  const kept = process.env.TENT_HOME
  t.after(() => {
    if (kept === undefined) delete process.env.TENT_HOME
    else process.env.TENT_HOME = kept
    Reflect.deleteProperty(globalThis, 'partOfTheTest')
  })
  process.env.TENT_HOME = home

  // Outside a call the mode is `live`, where an address of this computer is refused without a secure connection.
  const outside = await refusal(fetchPart('tool', { list }))
  assert.equal(outside.code, 'T0016')
  assert.match(outside.message, /secure connection/)
  assert.deepEqual(server.asked, [])

  // In a call of an app on live data it is `live` too, and in one of an app in development it is `development`.
  Reflect.set(globalThis, 'partOfTheTest', () => fetchPart('tool', { list }))
  const live = await needing(t, 'live')
  assert.equal((await refusal(live.app.call('readsPart', {}, { as: nobody }))).code, 'T0016')
  assert.deepEqual(server.asked, [])
  const development = await needing(t, 'development')
  const place = placeOf(home, 'tool', '1.0.0')
  assert.equal(await development.app.call('readsPart', {}, { as: nobody }), place)
  assert.deepEqual(server.asked, ['/tool.tgz'])
  // The part lies in `fetched/` of the runner's folder, which `TENT_HOME` names here, and in no folder of the package.
  assert.equal(readFileSync(join(place, 'tool.txt'), 'utf8'), 'the tool')
  assert.equal(existsSync(join(import.meta.dirname, '..', '..', '..', 'fetched')), false)
  // Once it is there, a call on live data is answered its folder.
  assert.equal(await live.app.call('readsPart', {}, { as: nobody }), place)
})

test('[22-6] inside a call a fetch is waited for as long as limits.fetchTime of the project says, and outside one for the time that is handed', async (t) => {
  const bytes = tgzOf([{ path: 'tool.txt', text: 'the tool' }])
  // A place that answers after a minute, which is never while this test runs: the fetch ends by its own time
  // alone, however slow the computer is, and is told which time that was.
  const slow = await partServer(t, { '/tool.tgz': bytes }, 60_000)
  const list = [lineOf('tool', '1.0.0', `${slow.origin}/tool.tgz`, bytes)]
  /** Answers the time that a fetch says it was cut at, in milliseconds. */
  const cutAt = (message: string): number =>
    Number(/passed its time of (\d+(\.\d+)?) milliseconds/.exec(message)?.[1] ?? Number.NaN)
  const folder = workFolder(t)
  t.after(() => Reflect.deleteProperty(globalThis, 'partOfTheTest'))
  const { app } = await needing(t, 'development')

  Reflect.set(globalThis, 'partOfTheTest', () => fetchPart('tool', { list, folder }))
  const late = await refusal(app.call('readsPart', {}, { as: nobody }))
  assert.equal(late.code, 'T0016')
  // The fetch was handed what was left of the 400 ms of the project when the file was asked for: no more than
  // those, and not the two minutes.
  assert.ok(cutAt(late.message) > 0 && cutAt(late.message) <= 400, late.message)
  assert.deepEqual(slow.asked, ['/tool.tgz'])

  // Outside a call nothing names a project: the fetch is waited for the time that is handed, or two minutes.
  const handed = await refusal(fetchPart('tool', { list, folder, mode: 'development', time: 200 }))
  assert.ok(cutAt(handed.message) > 0 && cutAt(handed.message) <= 200, handed.message)
  // A time that is handed holds inside a call too, in place of the 400 ms of the project.
  Reflect.set(globalThis, 'partOfTheTest', () => fetchPart('tool', { list, folder, time: 150 }))
  const inside = await refusal(app.call('readsPart', {}, { as: nobody }))
  assert.ok(cutAt(inside.message) > 0 && cutAt(inside.message) <= 150, inside.message)
  // With a place that answers, the same call is answered.
  const quick = await partServer(t, { '/tool.tgz': bytes })
  const there = [lineOf('tool', '1.0.0', `${quick.origin}/tool.tgz`, bytes)]
  Reflect.set(globalThis, 'partOfTheTest', () => fetchPart('tool', { list: there, folder }))
  assert.equal(await app.call('readsPart', {}, { as: nobody }), placeOf(folder, 'tool', '1.0.0'))
})

test('[22-6] two calls for one part at once share a download only where they ask alike: the same folder, the same address and the same mode', async (t) => {
  const bytes = tgzOf([{ path: 'tool.txt', text: 'the tool' }])
  const server = await partServer(t, { '/tool.tgz': bytes, '/mirror/tool.tgz': bytes }, 200)
  const list = [lineOf('tool', '1.0.0', `${server.origin}/tool.tgz`, bytes)]

  // In another mode: the call on live data is refused by its own rule, and the one in development is answered.
  const first = workFolder(t)
  const [live, development] = await Promise.allSettled([
    fetchPart('tool', { list, folder: first, mode: 'live' }),
    fetchPart('tool', { list, folder: first, mode: 'development' }),
  ])
  assert.equal(live.status, 'rejected')
  assert.equal(Reflect.get(Object(Reflect.get(live, 'reason')), 'code'), 'T0016')
  assert.deepEqual(development, { status: 'fulfilled', value: placeOf(first, 'tool', '1.0.0') })
  assert.deepEqual(server.asked, ['/tool.tgz'])

  // From another address, and into another folder: each call asks for the file itself.
  server.asked.length = 0
  const second = workFolder(t)
  const o = { list, folder: second, mode: 'development' as const }
  const places = await Promise.all([
    fetchPart('tool', o),
    fetchPart('tool', { ...o, from: `${server.origin}/mirror` }),
    fetchPart('tool', { ...o, folder: workFolder(t) }),
  ])
  assert.equal(places[0], placeOf(second, 'tool', '1.0.0'))
  assert.equal(places[1], places[0])
  assert.deepEqual(server.asked.sort(), ['/mirror/tool.tgz', '/tool.tgz', '/tool.tgz'])
  // Nothing half-made is left where two fetches filled one place.
  assert.deepEqual(everythingIn(join(second, 'fetched')), ['.tmp', 'tool@1.0.0', 'tool@1.0.0/tool.txt'])

  // Alike in all three, two calls share one download.
  server.asked.length = 0
  const third = workFolder(t)
  const same = { list, folder: third, mode: 'development' as const, from: `${server.origin}/mirror` }
  await Promise.all([fetchPart('tool', same), fetchPart('tool', { ...same })])
  assert.deepEqual(server.asked, ['/mirror/tool.tgz'])
})
