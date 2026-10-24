import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { App, Engine, Frame, Link, Reach } from '../index.ts'
import type { Bundle } from './apps.ts'
import { bundled, codeOf, engineOf, logRows, send, system, testClock, workFolder } from './apps.ts'

// The keys of the readers: a near one, a far one, and one that holds neither right.
const keys = { near: 'n'.repeat(40), far: 'f'.repeat(40), none: 'x'.repeat(40) }
const readers = [keys.near, { key: keys.far, far: true as const }]
const address = { writer: 'https://writer.test', near: 'https://near.test', far: 'https://far.test' }

const moment = (ms = 10): Promise<void> => new Promise((done) => setTimeout(done, ms))

async function until(what: string, holds: () => boolean, tries = 300): Promise<void> {
  for (let i = 0; i < tries && !holds(); i++) await moment()
  assert.equal(holds(), true, `never: ${what}`)
}

/** A world of machines that share a clock and reach each other with no network. */
interface World {
  work: string
  clock: ReturnType<typeof testClock>
  apps: Record<string, App | undefined>
  reach: Reach
  engine(): Engine
  beat(times?: number): Promise<void>
}

function worldOf(t: TestContext): World {
  const clock = testClock()
  const apps: World['apps'] = {}
  return {
    work: workFolder(t),
    clock,
    apps,
    reach: (to) => ({
      async request(request, o) {
        const app = apps[to]
        if (!app) throw new Error(`${to} does not run`)
        return app.request(request, o)
      },
      link(request) {
        const app = apps[to]
        if (!app) throw new Error(`${to} does not run`)
        return app.link(request)
      },
    }),
    engine: () => engineOf(t, { makers: { clock: () => clock.clock } }),
    async beat(times = 1) {
      for (let i = 0; i < times; i++) {
        clock.advance(1000)
        await moment(15)
      }
    },
  }
}

async function current(world: World, reader: App): Promise<void> {
  for (let i = 0; i < 80 && !reader.at().current; i++) {
    world.clock.advance(1000)
    await moment(i < 8 ? 15 : 100)
  }
  assert.equal(reader.at().current, true, 'a reader is current after its beats')
}

async function writerIn(world: World, bundle: Bundle, engine = world.engine()): Promise<App> {
  const app = await engine.open(bundle.folder, {
    dataFolder: join(world.work, 'writer'),
    mode: 'test',
    address: '*',
    own: address.writer,
    readers,
  })
  world.apps[address.writer] = app
  return app
}

async function readerIn(world: World, kind: 'near' | 'far', engine = world.engine()): Promise<App> {
  const app = await engine.read({
    from: address.writer,
    key: keys[kind],
    dataFolder: join(world.work, kind),
    far: kind === 'far',
    own: address[kind],
    readers,
    reach: world.reach,
    address: '*',
  })
  world.apps[address[kind]] = app
  return app
}

const addTag = (app: App, name: string): Promise<unknown> =>
  app.write([{ add: 'tags', values: { name } }], { as: system })

const tags = async (app: App): Promise<string[]> =>
  Object(await app.read({ from: 'tags', sort: [{ by: 'createdAt' }] }, { as: system })).map((row: { name: string }) =>
    String(row.name),
  )

/** Opens a link by hand, as a reader would, and answers it with every message it was sent and whether it closed. */
function rawLink(
  app: App,
  key: string,
  scheme = 'https',
): { link: Link; got: Record<string, unknown>[]; closed: () => boolean } {
  const link = app.link(new Request(`${scheme}://writer.test/_t/copy`, { headers: { authorization: `Bearer ${key}` } }))
  const got: Record<string, unknown>[] = []
  let shut = false
  link.each(
    (frame: Frame) => void (typeof frame === 'string' && got.push(JSON.parse(frame))),
    () => {
      shut = true
    },
  )
  return { link, got, closed: () => shut }
}

const placeOf = (app: App, id: string, more: object = {}): string =>
  JSON.stringify({
    t: 'from',
    id,
    n: app.at().n,
    epoch: app.at().epoch,
    sum: app.at().sum,
    far: false,
    engine: '3',
    layout: 1,
    ...more,
  })

/** Opens a near reader's link and has it go on, so that the writer holds it. */
async function joined(app: App, key: string, id: string): Promise<ReturnType<typeof rawLink>> {
  const raw = rawLink(app, key)
  raw.link.send(placeOf(app, id))
  await until(`${id} joined`, () => raw.got.some((one) => one.t === 'go'))
  return raw
}

test('[29-11.1@4] each address of the link asked with no key, with a key that holds neither right, and over a connection that is not secure is not found, and nothing of the data is sent', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, {}, world.work))
  await addTag(app, 'a secret of the writer')
  const asked = (path: string, key?: string, scheme = 'https'): Promise<Response> =>
    app.request(
      new Request(`${scheme}://writer.test${path}`, key ? { headers: { authorization: `Bearer ${key}` } } : {}),
    )
  const addresses = [
    '/_t/copy',
    '/_t/copy/versions',
    '/_t/copy/data',
    `/_t/copy/blob/${'0'.repeat(64)}`,
    `/_t/copy/file/${'0'.repeat(64)}`,
    '/_t/copy/took',
    '/_t/copy/do',
  ]
  for (const path of addresses) {
    for (const [what, how] of [
      ['no key', undefined],
      ['a key that holds neither right', keys.none],
      ['a key in a secure header but over http', keys.near],
    ] as const) {
      const scheme = what.includes('http') ? 'http' : 'https'
      const answer = await asked(path, how, scheme)
      assert.equal(answer.status, 404, `${path}: ${what}`)
      const text = await answer.text()
      assert.equal(text.includes('a secret of the writer'), false, `${path}: ${what} sent data`)
    }
  }
  // A link opened with no key, with a key of neither right, and over http is refused: the opening throws T0001.
  for (const [what, key, scheme] of [
    ['no key of a reader', keys.none, 'https'],
    ['over http', keys.near, 'http'],
  ] as const)
    assert.equal(await codeOf((async () => rawLink(app, key, scheme))()), 'T0001', what)
})

test('[29-11.3] a reader that sends a wrote, and one that sends a change through /_t/copy, closes the link, and nothing is written', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, {}, world.work))
  const before = await tags(app)
  for (const frame of [
    JSON.stringify({
      t: 'wrote',
      change: { n: 999, epoch: '1.attacker', at: 0, sum: 'x', rows: [], record: '' },
      settled: 999,
    }),
    JSON.stringify({ t: 'settled', n: 999 }),
    JSON.stringify({ t: 'versions', list: [] }),
    JSON.stringify({ t: 'go', epoch: '1.attacker', n: 999, settled: 999, mode: 'test', beat: 1000, behind: 5000 }),
    JSON.stringify({ t: 'machines', list: [] }),
    JSON.stringify({ t: 'values', id: '1', settings: { shopName: 'owned' } }),
  ]) {
    const raw = await joined(app, keys.near, `sender-${Math.random()}`)
    raw.link.send(frame)
    await until('the link was closed', () => raw.closed())
    assert.equal(raw.closed(), true, frame)
  }
  // A binary frame (a record of a commit) from a reader closes the link too.
  const bytes = await joined(app, keys.near, 'sender-bytes')
  bytes.link.send(new Uint8Array([1, 2, 3]))
  await until('the binary frame closed the link', () => bytes.closed())
  // A frame that is no JSON, and a message of a `t` that the writer sends and the reader may not.
  for (const frame of [
    'not json at all',
    JSON.stringify({ t: 'ahead', epoch: '1.x', n: 5 }),
    JSON.stringify({ t: 'reload' }),
  ]) {
    const raw = await joined(app, keys.near, `sender-${frame.slice(0, 8)}`)
    raw.link.send(frame)
    await until('the link was closed', () => raw.closed())
  }
  assert.deepEqual(await tags(app), before)
  assert.equal((await app.read({ from: 'tags', count: true }, { as: system })) as number, before.length)
})

test('[29-11.11@4] /_t/copy/file/ and /_t/copy/blob/ asked with a true key, for a fingerprint that no row and no version names, and for a path, is not found', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, {}, world.work))
  const asked = (path: string): Promise<number> =>
    app
      .request(new Request(`https://writer.test${path}`, { headers: { authorization: `Bearer ${keys.near}` } }))
      .then((answer) => answer.status)
  // A true fingerprint of nothing, and names that are no fingerprint at all.
  for (const name of [
    '0'.repeat(64),
    'f'.repeat(64),
    '..%2Fdescription.json',
    '..%2F..%2Fengine.json',
    '..%5C..%5Cengine.json',
    'description.json',
    'a/b',
    '%2e%2e%2f%2e%2e%2fengine.json',
    'abc',
    'ABC',
    '',
  ]) {
    assert.equal(await asked(`/_t/copy/blob/${name}`), 404, `blob ${name}`)
    assert.equal(await asked(`/_t/copy/file/${name}`), 404, `file ${name}`)
  }
  // The blob of a loadable version is answered, so the address itself works.
  const versions = JSON.parse(
    await (
      await app.request(
        new Request('https://writer.test/_t/copy/versions', { headers: { authorization: `Bearer ${keys.near}` } }),
      )
    ).text(),
  )
  const some = Object(Object(versions.list)[0])
  const fingerprint = Object.values(Object(some.files))[0]
  if (typeof fingerprint === 'string') assert.equal(await asked(`/_t/copy/blob/${fingerprint}`), 200)
})

test('[29-11.13] /_t/copy/do asked in the mode live, with a true key, is not found', async (t) => {
  const world = worldOf(t)
  const bundle = await bundled(t, {}, world.work)
  const engine = world.engine()
  const live = await engine.open(bundle.folder, {
    dataFolder: join(world.work, 'live'),
    mode: 'live',
    address: '*',
    own: address.writer,
    readers,
  })
  const body = JSON.stringify({
    member: 'write',
    args: [[{ add: 'tags', values: { name: 'through do' } }]],
    as: 'system',
  })
  for (const key of [keys.near, keys.far, keys.none, undefined]) {
    const answer = await send(live, 'https://writer.test/_t/copy/do', {
      body,
      ...(key ? { headers: { authorization: `Bearer ${key}` } } : {}),
    })
    assert.deepEqual([answer.status, answer.error.code], [404, 'T0001'], String(key))
  }
  assert.equal((await live.read({ from: 'tags', count: true }, { as: 'system' })) as number, 0)
})

test('[29-11.10] a request to a reader that carries Tent-Reader, Tent-For and Tent-Epoch of the sender own making: the reader takes them out, and hands on its own', async (t) => {
  const world = worldOf(t)
  const writer = await writerIn(world, await bundled(t, {}, world.work))
  const near = await readerIn(world, 'near')
  await current(world, near)
  // The sender's own headers name a reader that is no key, a false address and a false epoch. The reader takes
  // them out before it hands the request to the writer, and sets its own key, address and epoch.
  const forged = {
    'tent-reader': 'not-a-real-key-of-any-reader',
    'tent-for': '9.9.9.9; https; evil.test',
    'tent-epoch': '99.attacker',
    'tent-ref': 'deadbeef',
  }
  const answer = await send(near, 'https://near.test/_t/call/addWord', {
    input: { text: 'through the reader' },
    from: '203.0.113.7',
    headers: forged,
  })
  assert.equal(answer.status, 200)
  await world.beat(2)
  const readWords = async (): Promise<string[]> =>
    Object(await writer.read({ from: 'words', sort: [{ by: 'createdAt' }] }, { as: system })).map(
      (row: { text: string }) => String(row.text),
    )
  assert.ok((await readWords()).includes('through the reader'), 'the reader handed its own write on to the writer')
  // The writer logged the request under the reader's real key and the real address, never the forged ones.
  const lines = logRows(join(world.work, 'writer'), 'lines').filter(
    (row) => row.message === 'A reader handed a request on.',
  )
  const handed = lines.map((row) => Object(JSON.parse(String(row.data ?? '{}'))))
  assert.ok(handed.length >= 1, 'the writer logged the handed request')
  assert.ok(
    handed.every((one) => one.from === '203.0.113.7' && !String(JSON.stringify(one)).includes('evil.test')),
    'the writer believed the reader, not the forged address',
  )
  assert.equal(writer.at().current, true)
})

test('[29-11.5] an old writer that is stopped by the machine that took over, and is then sent writes, answers T0030 for each, and its readers take nothing from it', async (t) => {
  const world = worldOf(t)
  const writer = await writerIn(world, await bundled(t, {}, world.work))
  await addTag(writer, 'before the take-over')
  // Another machine took over: it tells this writer so, with a key of the right `copy` and a newer epoch. The
  // writer gives way and is stopped for good, as a machine that took over does to the one it followed.
  const newer = `${Number(writer.at().epoch.split('.')[0]) + 1}.the-machine-that-took-over`
  const answer = await send(writer, 'https://writer.test/_t/copy/took', {
    body: JSON.stringify({ epoch: newer, own: address.near }),
    headers: { authorization: `Bearer ${keys.near}` },
  })
  assert.equal(answer.status, 200)
  // From then on the old writer refuses what writes with T0030, and answers T0029 to everything else.
  for (let i = 0; i < 3; i++) {
    const write = await send(writer, 'https://writer.test/_t/call/addWord', {
      input: { text: `from the old writer ${i}` },
    })
    assert.deepEqual([write.status, write.error.code], [409, 'T0030'], `write ${i}`)
  }
  for (const name of ['wordList', 'publicTags']) {
    const read = await send(writer, `https://writer.test/_t/call/${name}`, {})
    assert.equal(read.error.code, 'T0029', name)
  }
  // Its data, which its readers follow, holds nothing of the writes that were refused: a reader takes nothing.
  // A stopped writer answers no read of its own (app.read is T0029), so its file is read on the disk beside it.
  const db = new DatabaseSync(join(world.work, 'writer', 'data.db'), { readOnly: true })
  try {
    assert.equal(Number(db.prepare('SELECT count(*) AS n FROM "words"').get()?.n), 0)
  } finally {
    db.close()
  }
})

test('[29-11.2@4] a request to the writer with Tent-Reader made up, and with Tent-For or Tent-Epoch and no Tent-Reader, is T0001, and the made-up address is not believed', async (t) => {
  const world = worldOf(t)
  const writer = await writerIn(world, await bundled(t, {}, world.work))
  const forgedAddress = '1.2.3.4; https; evil.test'
  for (const [what, headers] of [
    ['a Tent-Reader that names no key', { 'tent-reader': 'not-a-real-key', 'tent-for': forgedAddress }],
    ['Tent-For and no Tent-Reader', { 'tent-for': forgedAddress }],
    ['Tent-Epoch and no Tent-Reader', { 'tent-epoch': '99.attacker' }],
    ['Tent-Reader of the right form that is no reader', { 'tent-reader': 'z'.repeat(40), 'tent-for': forgedAddress }],
  ] as const) {
    const answer = await send(writer, 'https://writer.test/_t/call/whoAmI', {
      method: 'POST',
      from: '10.9.9.9',
      headers,
    })
    assert.deepEqual([answer.status, answer.error.code], [404, 'T0001'], what)
    // The forged address is in no answer: the request was never believed to come from it.
    assert.equal(JSON.stringify(answer.body).includes('evil.test'), false, what)
  }
  // A request with none of those headers is answered as the sender's own, as nobody.
  const own = await send(writer, 'https://writer.test/_t/call/whoAmI', { from: '10.9.9.9' })
  assert.deepEqual(own.body, { ok: true, value: 'no user' })
})

test('[29-11.7] a cookie tent_wrote with a number far ahead, one of another epoch, and one of 100 kB, and the same in Tent-After, cost one wait of catchUp and one crossing, and no more', async (t) => {
  const world = worldOf(t)
  const writer = await writerIn(world, await bundled(t, {}, world.work))
  const far = await readerIn(world, 'far')
  await current(world, far)
  await addTag(writer, 'one')
  await world.beat(2)
  await until('the far reader holds the write', () => far.at().n >= 1)
  // Each mark names a write the far reader does not hold, in a cookie and in Tent-After. The read waits catchUp
  // at most, then is handed to the writer and answered: it is never an error, and never a loop.
  const ahead = `${1 + far.at().n}`
  const marks: [string, Record<string, string>][] = [
    ['a number far ahead, in the cookie', { cookie: 'tent_wrote.desk=1.999999' }],
    ['a number far ahead, in Tent-After', { 'tent-after': '1.999999' }],
    ['another epoch, in Tent-After', { 'tent-after': '999.1' }],
    ['one of 100 kB, in Tent-After', { 'tent-after': `1.${'9'.repeat(100_000)}` }],
    ['one of 100 kB, in the cookie', { cookie: `tent_wrote.desk=1.${'9'.repeat(100_000)}` }],
    ['the next write, in Tent-After', { 'tent-after': `1.${ahead}` }],
  ]
  for (const [what, headers] of marks) {
    // Each crossing is one call that the writer carried out, and so one row of its log.
    const crossed = (): number =>
      logRows(join(world.work, 'writer'), 'calls').filter((row) => row.name === 'publicTags').length
    const before = crossed()
    const pending = send(far, 'https://far.test/_t/call/publicTags', { headers })
    // The read waits: while the clock of the app stands still it has not crossed to the writer.
    await moment(30)
    assert.equal(crossed() - before, 0, `${what}: the read crossed with no wait`)
    // The wait of catchUp stands on the app's clock: move it past catchUp so the read is handed to the writer.
    for (let i = 0; i < 20; i++) {
      world.clock.advance(100)
      await moment(1)
    }
    const answer = await pending
    assert.equal(answer.status, 200, `${what}: ${JSON.stringify(answer.error)}`)
    // One wait of catchUp and one crossing: not none, and not two.
    assert.equal(crossed() - before, 1, `${what}: the read crossed ${crossed() - before} times`)
  }
})

test('[29-11.9] the key of a far reader, used to join as near, to take over, and to hand requests on: it is far, no machine dials it, its took is not believed, the writer goes on, and its requests stop at handedPerMinute', async (t) => {
  const world = worldOf(t)
  const writer = await writerIn(world, await bundled(t, {}, world.work), world.engine())
  // It opens with the far key but says it is near: the writer makes it far whatever it says.
  const raw = rawLink(writer, keys.far)
  raw.link.send(placeOf(writer, 'the-far-machine', { far: false, own: 'https://far-attacker.test' }))
  await until('the far key joined', () => raw.got.some((one) => one.t === 'go'))
  const me = writer.machines().find((one) => one.id === 'the-far-machine')
  assert.ok(me, 'the far machine joined')
  assert.equal(me.far, true, 'the writer made it far whatever it said')
  assert.equal(me.take, false, 'a far key may not take over')
  // The writer names it with no `take`, so no machine dials its address when the writer goes.
  assert.equal(
    writer.machines().some((one) => one.take && one.id === 'the-far-machine'),
    false,
  )
  // Its `took` is not believed: the writer answers the newer epoch it knows, and goes on as the writer.
  const newer = `${Number(writer.at().epoch.split('.')[0]) + 1}.the-far-machine`
  const tookAnswer = await send(writer, 'https://writer.test/_t/copy/took', {
    body: JSON.stringify({ epoch: newer, own: 'https://far-attacker.test' }),
    headers: { authorization: `Bearer ${keys.far}` },
  })
  assert.equal(tookAnswer.status, 200)
  assert.ok(Object(tookAnswer.body.value).other, 'the writer answered the far took with its own epoch')
  // The writer still writes: it did not give way, and did not stand back.
  assert.equal(
    (await send(writer, 'https://writer.test/_t/call/addWord', { input: { text: 'the writer goes on' } })).status,
    200,
  )
  // A request handed on with the far key is counted for the key: past handedPerMinute it is T0005.
  const limitedWork = join(world.work, 'limited')
  const limited = await writerIn(
    { ...world, work: limitedWork },
    await bundled(t, { change: (d) => Object.assign(d.project, { limits: { handedPerMinute: 20 } }) }, limitedWork),
    world.engine(),
  )
  const handed = (i: number) =>
    send(limited, 'https://writer.test/_t/call/whoAmI', {
      from: '10.0.0.9',
      headers: {
        'tent-reader': keys.far,
        'tent-for': '203.0.113.7; https; writer.test',
        'tent-epoch': limited.at().epoch,
        'tent-ref': `ref${String(i).padStart(5, '0')}`,
      },
    })
  for (let i = 0; i < 20; i++) assert.equal((await handed(i)).status, 200, `handed ${i}`)
  assert.deepEqual([(await handed(99)).status, (await handed(98)).error.code], [429, 'T0005'])
})
