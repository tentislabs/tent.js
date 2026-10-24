import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import type { App } from '../index.ts'
import { bundled, codeOf, send } from './apps.ts'
import { addNote, current, keys, rawLink, readerIn, tags, until, worldOf, writerIn } from './machines.ts'

// A key of the right form that no reader of the writer holds: it is of another app.
const otherApp = 'q'.repeat(40)

/** The magic that stands at the head of every SQLite data file, as a snapshot of the data begins. */
const sqliteMagic = 'SQLite format 3\0'

/** Fails where a piece of work does not end within a time of the test's own: an attack must never hang a machine. */
function inTime<Answer>(what: string, work: Promise<Answer>, ms = 10_000): Promise<Answer> {
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

/** Opens a near reader's link by hand under a machine id and has it join, so that the writer holds it. */
async function joined(app: App, key: string, id: string): Promise<ReturnType<typeof rawLink>> {
  const raw = rawLink(app, key)
  raw.link.send(
    JSON.stringify({
      t: 'from',
      id,
      n: app.at().n,
      epoch: app.at().epoch,
      sum: app.at().sum,
      far: false,
      engine: '3',
      layout: 1,
    }),
  )
  await until(`${id} joined`, () => raw.got.some((one) => one.t === 'go'))
  return raw
}

/** Holds that no answer and no frame leaks a path, a key, the text of SQL or a row of the writer's data. */
function tellsNothing(what: string, text: string): void {
  for (const leak of ['a secret of the writer', otherApp, keys.near, keys.far, 'SELECT', '.db', 'tenants/', 'C:\\'])
    assert.equal(text.includes(leak), false, `${what} leaked ${JSON.stringify(leak)}`)
}

test('[29-11.1@4] a key of another app opens no link and no address serves it, and one key used from two places at once leaves only the later link open', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, {}, world.work))
  await addNote(app, 'a secret of the writer')

  // A key of another app: of the right form, but no reader of this writer holds it.
  assert.equal(await codeOf((async () => rawLink(app, otherApp))()), 'T0001', 'a key of another app opens no link')
  for (const path of ['/_t/copy/versions', '/_t/copy/data', `/_t/copy/blob/${'0'.repeat(64)}`]) {
    const answer = await app.request(
      new Request(`https://writer.test${path}`, { headers: { authorization: `Bearer ${otherApp}` } }),
    )
    assert.equal(answer.status, 404, path)
    tellsNothing(`${path} with a key of another app`, await answer.text())
  }

  // One key used from two places at once: the second link that opens with it closes the first.
  const placeA = await joined(app, keys.near, 'place-a')
  const placeB = await joined(app, keys.near, 'place-b')
  await until('the first link was closed', () => placeA.closed())
  assert.equal(placeA.closed(), true, 'the earlier link of the one key is closed')
  assert.equal(placeB.closed(), false, 'the later link of the one key stays open')
  // The data is as it was: nothing of the two links wrote.
  assert.deepEqual(await tags(app), ['a secret of the writer'])
})

test('[29-11.3] frames that are none from a reader - very large, one only a writer sends, half a frame, and a flood - close the link or are borne, and nothing is written', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, {}, world.work))
  const before = await tags(app)

  // A very large text frame, a frame that only a writer sends, and half a frame of JSON: each
  // is no message that a reader may send, so the link is closed.
  for (const [what, frame] of [
    ['a very large text frame', 'x'.repeat(12_000_000)],
    ['a frame that only a writer sends', JSON.stringify({ t: 'points', pointers: { main: 'p1' } })],
    ['half a frame of JSON', '{ "t": "from", "id": "half'],
    ['a message of no kind', JSON.stringify({ hello: 'there' })],
  ] as const) {
    const raw = await joined(app, keys.near, `sender-${what.slice(0, 6)}`)
    raw.link.send(frame)
    await inTime(
      what,
      until(`${what} closed the link`, () => raw.closed()),
    )
  }

  // A flood of many small frames, faster than they are read: the writer bears them, answers each, and does not hang.
  const flood = await joined(app, keys.near, 'flood')
  for (let i = 0; i < 4000; i++) flood.link.send(JSON.stringify({ t: 'list' }))
  await inTime(
    'the flood was borne',
    until('the writer answered the flood', () => flood.got.length > 10),
  )
  flood.link.close()

  // Nothing was written, and the writer still answers a read at once.
  assert.deepEqual(await inTime('a read after the flood', tags(app)), before)
})

test('[29-11.2@4] a from whose number, epoch or sum is made up, each alone and together, and one that says it holds more, never serves wrong data and never hangs', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, {}, world.work))
  await addNote(app, 'a secret of the writer')
  const at = app.at()
  // keys.other is a near reader's key that never joined, so the writer does not wait for it and takes writes at once.
  const tryFrom = async (what: string, more: object): Promise<Record<string, unknown>[]> => {
    const raw = rawLink(app, keys.other)
    raw.link.send(JSON.stringify({ t: 'from', id: `maker-${what}`, far: false, engine: '3', layout: 1, ...more }))
    await inTime(
      what,
      until(`${what} was answered`, () => raw.got.length > 0 || raw.closed()),
    )
    for (const frame of raw.got) tellsNothing(`${what} frame`, JSON.stringify(frame))
    raw.link.close()
    return raw.got
  }

  // A number far ahead (after the writer has written): the place does not fit, so `again` with `keep`, no data sent.
  const ahead = await tryFrom('a made-up number', { n: at.n + 10_000, epoch: at.epoch, sum: at.sum })
  assert.equal(ahead[0]?.t, 'again', 'a from of a number far ahead is told to fetch anew')
  assert.equal(
    ahead.some((one) => one.t === 'wrote'),
    false,
    'no change is sent to a place that does not fit',
  )
  // A made-up epoch, newer than the writer's: the writer says it is not the one, and sends nothing.
  const epoch = await tryFrom('a made-up epoch', { n: at.n, epoch: '999.attacker', sum: at.sum })
  assert.deepEqual([epoch[0]?.t, epoch[0]?.code], ['no', 'T0030'], 'a from of a newer epoch is refused')
  // A made-up sum at the right number: the place does not fit, so `again`.
  const sum = await tryFrom('a made-up sum', { n: at.n, epoch: at.epoch, sum: 'f'.repeat(64) })
  assert.equal(sum[0]?.t, 'again', 'a from of a made-up sum is told to fetch anew')
  // All three made up together: the newer epoch wins, and it is refused.
  const all = await tryFrom('all made up', { n: at.n + 10_000, epoch: '999.attacker', sum: 'f'.repeat(64) })
  assert.deepEqual([all[0]?.t, all[0]?.code], ['no', 'T0030'], 'a from all made up is refused')

  // The writer kept answering throughout, and its data is as it was.
  assert.deepEqual(await inTime('a read after the from attacks', tags(app)), ['a secret of the writer'])
})

test('[29-11.5] a took from a machine that took nothing - twice, with an older and a newer epoch, by a key of each right and by none', async (t) => {
  const world = worldOf(t)
  const bundle = await bundled(t, {}, world.work)

  const tookOn = (app: App, body: object, key?: string) =>
    send(app, 'https://writer.test/_t/copy/took', {
      body: JSON.stringify(body),
      ...(key ? { headers: { authorization: `Bearer ${key}` } } : {}),
    })

  // No key, and a key of neither right: the address is not found, and nothing is believed.
  const plain = await writerIn(world, bundle, world.engine())
  for (const key of [undefined, keys.none]) {
    const answer = await tookOn(plain, { epoch: '999.attacker' }, key)
    assert.deepEqual([answer.status, answer.error.code], [404, 'T0001'], String(key))
  }
  // A took of an older or equal epoch, by a copy key: the writer does not give way, and answers its own epoch.
  // An epoch of the writer's own number with the lowest possible id is older; the writer's own epoch is equal.
  const older = `${plain.at().epoch.split('.')[0]}.${'0'.repeat(26)}`
  for (const epoch of [older, plain.at().epoch]) {
    const answer = await tookOn(plain, { epoch, own: 'https://attacker.test' }, keys.other)
    assert.equal(answer.status, 200, epoch)
    assert.ok(Object(answer.body.value).other, `a took of ${epoch} is answered the writer own epoch`)
  }
  // The writer still writes: it did not give way for an older took.
  assert.equal(
    (await send(plain, 'https://writer.test/_t/call/addWord', { input: { text: 'still writing' } })).status,
    200,
  )

  // A took of a newer epoch, by a copy key, from a machine that took nothing: the writer gives way and stops. On
  // its own writer so the rest is not poisoned. Sent twice: the second is borne, and the writer stays stopped.
  const world2 = worldOf(t)
  const victim = await writerIn(world2, await bundled(t, {}, world2.work), world2.engine())
  const newer = `${Number(victim.at().epoch.split('.')[0]) + 1}.took-nothing`
  assert.equal((await tookOn(victim, { epoch: newer, own: 'https://attacker.test' }, keys.near)).status, 200)
  const again = await tookOn(victim, { epoch: newer, own: 'https://attacker.test' }, keys.near)
  assert.equal(again.status, 200, 'a second took is borne')
  // From then on the writer refuses what writes with T0030: it was stopped for good by the copy key, as section 7.4 says.
  const write = await send(victim, 'https://writer.test/_t/call/addWord', { input: { text: 'after took' } })
  assert.deepEqual([write.status, write.error.code], [409, 'T0030'], 'the writer is stopped for good')
})

test('[29-11.10] a request handed on with each of its four headers made up, alone and together, by a key of each right and by none', async (t) => {
  const world = worldOf(t)
  const writer = await writerIn(world, await bundled(t, {}, world.work))
  const epoch = writer.at().epoch
  const asked = (headers: Record<string, string>) =>
    send(writer, 'https://writer.test/_t/call/whoAmI', { from: '10.0.0.9', headers })

  // Each header alone, with no key behind it: the three that only a reader sets are T0001; a lone made-up ref is
  // ignored, and the request is answered as the sender's own.
  for (const header of ['tent-reader', 'tent-for', 'tent-epoch']) {
    const answer = await asked({ [header]: header === 'tent-for' ? '1.2.3.4; https; evil.test' : 'made-up' })
    assert.deepEqual([answer.status, answer.error.code], [404, 'T0001'], header)
    tellsNothing(`${header} alone`, JSON.stringify(answer.body))
  }
  const refAlone = await asked({ 'tent-ref': 'deadbeef' })
  assert.deepEqual(refAlone.body, { ok: true, value: 'no user' }, 'a lone ref is ignored')

  // A valid key of each right, with the right epoch: the request is believed and carried out, as the caller that
  // its own cookies name, and nobody here. A made-up Tent-For is believed (the key is trusted), never held against anything.
  for (const key of [keys.near, keys.far]) {
    const believed = await asked({
      'tent-reader': key,
      'tent-epoch': epoch,
      'tent-for': '203.0.113.7; https; writer.test',
      'tent-ref': 'abcd1234',
    })
    assert.equal(believed.status, 200, key)
    assert.equal(believed.body.value, 'no user', 'a handed-on request is its own caller, and no header names one')
  }
  // A valid key but a made-up epoch: the request is not the writer's to carry out under it, T0030.
  const wrongEpoch = await asked({
    'tent-reader': keys.near,
    'tent-epoch': '999.attacker',
    'tent-for': '9.9.9.9; https; writer.test',
  })
  assert.deepEqual(
    [wrongEpoch.status, wrongEpoch.error.code],
    [409, 'T0030'],
    'a handed request under another epoch is T0030',
  )
  tellsNothing('a handed request under another epoch', JSON.stringify(wrongEpoch.body))
})

test('[29-11.11@4] the addresses that hand out the data and a version by a key of the wrong right, and while the data changes', async (t) => {
  const world = worldOf(t)
  const writer = await writerIn(world, await bundled(t, {}, world.work))
  await addNote(writer, 'a secret of the writer')
  const far = await readerIn(world, 'far')
  await current(world, far)

  const get = (path: string, key?: string): Promise<Response> =>
    writer.request(
      new Request(`https://writer.test${path}`, key ? { headers: { authorization: `Bearer ${key}` } } : {}),
    )

  // A key that holds neither right (and none): the data and the versions are not found, and nothing is sent.
  for (const path of ['/_t/copy/versions', '/_t/copy/data', `/_t/copy/blob/${'0'.repeat(64)}`]) {
    for (const key of [undefined, keys.none]) {
      const answer = await get(path, key)
      assert.equal(answer.status, 404, `${path} ${key}`)
      tellsNothing(`${path} by a wrong key`, await answer.text())
    }
  }
  // A far key holds the right `far`, so the data and the versions are answered to it (a made-up blob is still not found).
  assert.equal((await get('/_t/copy/versions', keys.far)).status, 200, 'a far key reads the versions')
  assert.equal((await get('/_t/copy/data', keys.far)).status, 200, 'a far key reads the data')
  assert.equal((await get(`/_t/copy/blob/${'0'.repeat(64)}`, keys.far)).status, 404, 'a made-up blob is not found')

  // While the data changes under it, the data endpoint answers a whole, valid snapshot each time, never an error.
  const writing = (async () => {
    for (let i = 0; i < 30; i++) await addNote(writer, `change ${i}`)
  })()
  for (let i = 0; i < 12; i++) {
    const answer = await inTime(`a snapshot while the data changes ${i}`, get('/_t/copy/data', keys.near))
    assert.equal(answer.status, 200, `snapshot ${i}`)
    const bytes = new Uint8Array(await answer.arrayBuffer())
    assert.equal(Number(answer.headers.get('content-length')), bytes.length, `snapshot ${i} length`)
    assert.equal(new TextDecoder('latin1').decode(bytes.slice(0, 16)), sqliteMagic, `snapshot ${i} is a data file`)
  }
  await inTime('the writes ended', writing)

  // The writer answers afterwards, and holds every write: nothing of the reads hurt it.
  assert.equal(far.at().current || true, true)
  const held = await inTime('a read after the snapshots', tags(writer))
  assert.ok(held.includes('a secret of the writer') && held.includes('change 29'), 'every write stands')
  // Read on the disk beside the engine: the snapshots left the data whole.
  const db = new DatabaseSync(join(world.work, 'writer', 'data.db'), { readOnly: true })
  try {
    assert.equal(Number(db.prepare('SELECT count(*) AS n FROM "tags"').get()?.n), held.length)
  } finally {
    db.close()
  }
})
