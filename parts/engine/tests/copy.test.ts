import assert from 'node:assert/strict'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { sqliteStore } from '../../data/index.ts'
import type { App, Lease, Reach } from '../index.ts'
import type { Answered, Bundle } from './apps.ts'
import { bundled, codeOf, engineOf, logRows, portOf, send, system, workFolder } from './apps.ts'
import {
  addNote,
  current,
  keys,
  machineAddress as address,
  moment,
  pastKeeping,
  placeTold as placeOf,
  rawLink,
  readerIn,
  readers,
  tags,
  until,
  worldOf,
  writerIn,
} from './machines.ts'

test('[29-2] a key that readers does not name is not found, a second link with one key closes the first, and a second reader under the machine id of the first makes itself a new id', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, {}, world.work))
  // An address of the link is not found with no key, with a key that is none, and over a connection that is not secure.
  const asked = async (path: string, key?: string, scheme = 'https'): Promise<number> =>
    (
      await app.request(
        new Request(`${scheme}://writer.test${path}`, key ? { headers: { authorization: `Bearer ${key}` } } : {}),
      )
    ).status
  for (const path of ['/_t/copy', '/_t/copy/versions', '/_t/copy/data', '/_t/copy/blob/abc']) {
    assert.equal(await asked(path), 404, path)
    assert.equal(await asked(path, keys.none), 404, path)
    assert.equal(await asked(path, keys.near, 'http'), 404, path)
  }
  assert.equal(await asked('/_t/copy/versions', keys.near), 200)
  assert.equal(await asked('/_t/copy/blob/..%2Fdescription.json', keys.near), 404)
  assert.equal(await asked(`/_t/copy/blob/${'0'.repeat(64)}`, keys.near), 404)
  assert.equal(await codeOf((async () => rawLink(app, keys.none))()), 'T0001')
  assert.equal(await codeOf((async () => rawLink(app, keys.near, 'http'))()), 'T0001')
  // A reader whose place fits is told to go on, and a second link with its key closes the first.
  const first = rawLink(app, keys.near)
  first.link.send(placeOf(app, 'machine-one'))
  await until('the first link was taken', () => first.got.some((one) => one.t === 'machines'))
  assert.deepEqual(first.got.map((one) => one.t).slice(0, 3), ['go', 'versions', 'machines'])
  // Another reader under the machine id of the first is told to make itself a new id.
  const copied = rawLink(app, keys.other)
  copied.link.send(placeOf(app, 'machine-one'))
  await until('the copied folder was told', () => copied.got.length > 0)
  assert.deepEqual(copied.got, [{ t: 'other-id' }])
  copied.link.send(placeOf(app, 'machine-two'))
  await until('the second machine was taken', () => copied.got.some((one) => one.t === 'go'))
  const second = rawLink(app, keys.near)
  second.link.send(placeOf(app, 'machine-one'))
  await until('the first link was closed', () => first.closed())
  assert.equal(second.closed(), false)
  // A reader that sends what only a writer sends, and a frame that is no message, has its link closed.
  second.link.send(JSON.stringify({ t: 'wrote', change: {}, settled: 0 }))
  await until('the link of a reader that sent a write was closed', () => second.closed())
  assert.deepEqual(await tags(app), [])
  // A reader of another shape number is answered T0034, and both logs say to run one engine.
  const newer = rawLink(app, keys.near)
  newer.link.send(placeOf(app, 'machine-one', { layout: 99 }))
  await until('the reader of another shape number was refused', () => newer.closed())
  assert.deepEqual(newer.got.at(-1), { t: 'no', code: 'T0034' })
  assert.equal(world.heard.filter((one) => one === 'reader.joined writer').length, 3)
})

test('[29-2] engine.open on the data folder of a reader is T0030, engine.read with a store that has no copy is T0013, and a fetch that does not end leaves no half file', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, {}, world.work))
  await addNote(app, 'one')
  const folder = join(world.work, 'near')
  // The data does not arrive whole: the reader does not open, and no half file is in place.
  const broken: Reach = (to) => ({
    link: () => assert.fail('no link is opened before the data is there'),
    request: async (request, o) => {
      const answer: Response = await Object(world.reach(to)).request(request, o)
      if (!request.url.endsWith('/_t/copy/data')) return answer
      return new Response(new Uint8Array(100), { headers: { 'content-length': '5000' } })
    },
  })
  const failing = world.engine().read({ from: address.writer, key: keys.near, dataFolder: folder, reach: broken })
  assert.equal(await codeOf(failing), 'T0029')
  assert.deepEqual(
    readdirSync(folder).filter((name) => name.startsWith('data.db')),
    [],
  )
  // A half file that a killed reader left is removed when the machine starts.
  writeFileSync(join(folder, 'data.db.fetch'), 'half')
  const engine = world.engine()
  const near = await readerIn(world, 'near', engine)
  assert.equal(existsSync(join(folder, 'data.db.fetch')), false)
  assert.deepEqual([near.role, near.at().n], ['reader', app.at().n])
  // With no writer reached, an empty folder does not open.
  const nowhere: Reach = () => ({
    request: () => Promise.reject(new Error('gone')),
    link: () => assert.fail('no link'),
  })
  const lost = world
    .engine()
    .read({ from: address.writer, key: keys.far, dataFolder: join(world.work, 'far'), reach: nowhere })
  assert.equal(await codeOf(lost), 'T0029')
  // The folder of a reader is not opened as a writer.
  await near.close()
  const again = world.engine().open((await bundled(t, {}, world.work)).folder, { dataFolder: folder, mode: 'test' })
  assert.equal(await codeOf(again), 'T0030')
  // A store that cannot be copied runs on one machine alone.
  const plain = (): ReturnType<typeof sqliteStore> => Object.assign(sqliteStore(), { copy: undefined })
  const withPlain = engineOf(t, { makers: { store: plain } })
  const noCopy = withPlain.read({ from: address.writer, key: keys.near, dataFolder: folder, reach: world.reach })
  assert.equal(await codeOf(noCopy), 'T0013')
  const bundle = await bundled(t, {}, world.work)
  const noReaders = withPlain.open(bundle.folder, { dataFolder: join(world.work, 'plain'), mode: 'test', readers })
  assert.equal(await codeOf(noReaders), 'T0013')
})

test('[29-2] a writer that is opened again serves a reader that is ten writes behind from what it kept, and a table change that it applied when it opened reaches that reader as a change', async (t) => {
  const world = worldOf(t)
  const first = world.engine()
  let app = await writerIn(world, await bundled(t, {}, world.work), first)
  let near = await readerIn(world, 'near')
  await current(world, near)
  await addNote(app, 'before')
  await until('the reader holds the first write', () => near.at().n === app.at().n)
  const fetched = world.asked['/_t/copy/data']
  assert.equal(fetched, 1)
  // The reader is stopped, the writer writes ten times, is closed, and opens again with a wider bundle.
  await near.close()
  // The writer waits for the reader that left for as long as it may be current, and then no more.
  await world.beat(7)
  for (let i = 0; i < 10; i++) await addNote(app, `while away ${i}`)
  await first.close()
  const wider = await bundled(
    t,
    {
      change: (description) => {
        Object.assign(Object(description.tables.tags.columns), { colour: { kind: 'text', optional: true } })
      },
    },
    world.work,
  )
  app = await writerIn(world, wider)
  near = await readerIn(world, 'near')
  await until(
    'the reader holds every write and the table change',
    () => near.at().n === app.at().n && near.at().sum === app.at().sum,
  )
  // It was served from what the writer kept: the data was not fetched again.
  assert.equal(world.asked['/_t/copy/data'], fetched)
  assert.equal((await tags(app)).length, 11)
  await current(world, near)
  assert.deepEqual(await tags(near), await tags(app))
  // The reader runs the version that the writer runs, with its tables.
  await until('the reader runs the new version', () => 'colour' in Object(near.description.tables.tags.columns))
  await app.write([{ add: 'tags', values: { name: 'red one', colour: 'red' } }], { as: system })
  await until('the reader holds the row of the new column', () => near.at().n === app.at().n)
  const rows = Object(await near.read({ from: 'tags', where: { col: 'colour', is: 'red' } }, { as: system }))
  assert.deepEqual(
    rows.map((row: { name: string }) => row.name),
    ['red one'],
  )
})

test('[29-2] after a restore on the writer its readers fetch the data anew under a newer epoch and keep no lost file, and a reader that fell behind what is kept fetches anew and joins', async (t) => {
  const world = worldOf(t)
  const bundle = await bundled(
    t,
    {
      change: (description) => {
        description.project.limits = { ...Object(description.project.limits), sinkSize: 2000 }
      },
    },
    world.work,
  )
  const app = await writerIn(world, bundle)
  let near = await readerIn(world, 'near')
  const far = await readerIn(world, 'far')
  await world.beat(3)
  await addNote(app, 'kept by the mark')
  const mark = join(world.work, 'mark.db')
  await app.snapshot(mark)
  await addNote(app, 'given up')
  await until('both readers hold both writes', () => near.at().n === app.at().n && far.at().n === app.at().n)
  assert.equal(world.asked['/_t/copy/data'], 2)
  // A restore puts another file in place: the writer goes on under a newer epoch, and each reader fetches anew.
  const before = app.at()
  await app.restore(mark)
  assert.equal(app.role, 'writer')
  assert.equal(app.at().epoch.split('.')[0], '2')
  assert.equal(app.at().epoch.split('.')[1], before.epoch.split('.')[1])
  await world.beat(2)
  await until(
    'both readers fetched the data anew',
    () => near.at().epoch === app.at().epoch && far.at().epoch === app.at().epoch,
  )
  assert.equal(world.asked['/_t/copy/data'], 4)
  assert.deepEqual([near.at().n, far.at().n], [app.at().n, app.at().n])
  for (const kind of ['near', 'far'])
    assert.deepEqual(
      readdirSync(join(world.work, kind)).filter((name) => name.startsWith('lost.')),
      [],
    )
  await world.beat(3)
  assert.deepEqual(await tags(near), ['kept by the mark'])
  // A reader that holds the number at which its writer began to keep is told to go on.
  assert.equal(await codeOf(near.restore(mark)), 'T0030')
  // A reader that fell behind past what the writer keeps is told to fetch anew, with one fetch, and joins.
  await near.close()
  await world.beat(7)
  // The writer keeps every change after the data that a reader fetched, for as long as that reader may need to
  // join: that time has passed here.
  await pastKeeping(world)
  for (let i = 0; i < 40; i++) await addNote(app, `past what is kept ${i} ${'x'.repeat(200)}`)
  near = await readerIn(world, 'near')
  await world.beat(2)
  await until('the reader that fell behind joined again', () => near.at().n === app.at().n)
  assert.equal(world.asked['/_t/copy/data'], 5)
  assert.equal((await tags(near)).length, 41)
})

test('[29-7] with a lease a near reader takes over by itself, and a writer that is answered no stops writing and answers no beat with ok', async (t) => {
  const world = worldOf(t)
  let holder = 'writer'
  const asked: string[] = []
  const ids: Record<string, string> = {}
  const lease: Lease = {
    hold: ({ machine, forMs }) => {
      asked.push(`${ids[machine] ?? machine} ${forMs}`)
      return ids[machine] === holder
    },
  }
  const app = await writerIn(world, await bundled(t, {}, world.work), world.engine({ lease }))
  ids[app.machines()[0].id] = 'writer'
  await world.beat()
  const near = await readerIn(world, 'near', world.engine({ lease }))
  await current(world, near)
  ids[app.machines()[1].id] = 'near'
  await addNote(app, 'under the lease')
  await until('the reader holds the write', () => near.at().n === app.at().n)
  assert.ok(asked.includes('writer 5000'))
  // The lease says no to the writer: it stops writing, answers T0029 to a read, and no beat with ok.
  holder = 'near'
  await world.beat(2)
  assert.equal(await codeOf(addNote(app, 'refused')), 'T0030')
  const read = await app.request(
    new Request('https://writer.test/_t/call/countNotes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"input":{}}',
    }),
  )
  assert.equal(read.status, 503)
  // The near reader is current no more once `behind` has passed, asks the lease, and takes over with its first yes.
  await world.beat(14)
  await until('the near reader took over by itself', () => near.role === 'writer')
  assert.equal(near.at().epoch.split('.')[0], '2')
  await addNote(near, 'by the new writer')
  assert.deepEqual(await tags(near), ['under the lease', 'by the new writer'])
  assert.ok(world.heard.includes('writer.changed writer'))
  // The old writer is told that the reader took over, and is stopped for good.
  await world.beat(2)
  assert.equal(await codeOf(addNote(app, 'refused for good')), 'T0030')
})

test('[29-2] a writer and a reader in two engines are joined over the network, by the link and the addresses of the link', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  const [one, two] = [engineOf(t), engineOf(t)]
  const dataFolder = join(work, 'writer')
  const opened = await one.open(bundle.folder, { dataFolder, mode: 'test', readers, insecure: true })
  const from = `http://127.0.0.1:${portOf(dataFolder)}`
  await addNote(opened, 'before the reader')
  // Over a connection that is not secure a machine reaches its writer only where it was told `insecure`.
  const refused = two.read({ from, key: keys.near, dataFolder: join(work, 'refused') })
  assert.equal(await codeOf(refused), 'T0013')
  const near = await two.read({ from, key: keys.near, dataFolder: join(work, 'near'), insecure: true })
  assert.deepEqual([near.role, near.at().n], ['reader', opened.at().n])
  // The link carries the writes and the beats: the reader is current after two beats of the real clock.
  await until('the reader is current', () => near.at().current, 600)
  await addNote(opened, 'over the network')
  assert.equal(near.at().n, opened.at().n)
  assert.deepEqual(await tags(near), ['before the reader', 'over the network'])
  // A write that code asks the reader for crosses to the writer and back, and a request is handed on the same way.
  await near.write([{ add: 'tags', values: { name: 'written through the reader' } }], { as: system })
  assert.equal((await tags(opened)).includes('written through the reader'), true)
  const handed = await near.request(
    new Request(`http://127.0.0.1:${portOf(join(work, 'near'))}/_t/call/addWord`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { text: 'handed on' } }),
    }),
  )
  assert.equal(handed.status, 200)
  assert.equal(logRows(dataFolder, 'calls').filter((row) => row.name === 'addWord').length, 1)
  assert.equal(logRows(join(work, 'near'), 'calls').filter((row) => row.kind === 'handed').length, 1)
})

test('[29-2] a writer writes the writer of its first epoch down before it hands a file out: a reader that starts empty on a writer which has written nothing holds the epoch of its writer at once', async (t) => {
  const world = worldOf(t)
  const bundle = await bundled(t, {}, world.work)
  // The app ran alone first: its tables are made, and it kept no change, so nothing has named a writer yet.
  const alone = await world.engine().open(bundle.folder, { dataFolder: join(world.work, 'writer'), mode: 'test' })
  await addNote(alone, 'before any reader')
  await alone.close()
  const app = await writerIn(world, bundle)
  const [writer] = app.machines()
  assert.equal(app.at().epoch, `1.${writer.id}`)
  // The file that the reader fetched names the writer of its epoch, before the link has carried anything.
  const near = await readerIn(world, 'near')
  assert.equal(near.at().epoch, app.at().epoch)
  const file = new DatabaseSync(join(world.work, 'near', 'data.db'), { readOnly: true })
  try {
    const named = file.prepare(`SELECT value FROM "_t_meta" WHERE key = 'writer'`).get()
    assert.equal(String(named?.value).includes(writer.id), true, 'the fetched file names its writer')
  } finally {
    file.close()
  }
  // An epoch that is told with no writer is the epoch of no machine: a request handed on under it is refused.
  const headers = { 'tent-reader': keys.near, 'tent-for': '10.1.2.3; https; writer.test' }
  const under = (epoch: string): Promise<Answered> =>
    send(app, 'https://writer.test/_t/call/publicTags', { headers: { ...headers, 'tent-epoch': epoch } })
  assert.equal((await under(app.at().epoch)).status, 200)
  assert.equal((await under('1.')).error.code, 'T0030')
})

/** Sends a call to a writer as a reader hands it on, with the key of that reader. */
const handedOn = (app: App, name: string, key = keys.near): Promise<Answered> =>
  send(app, `https://writer.test/_t/call/${name}`, {
    headers: { 'tent-reader': key, 'tent-epoch': app.at().epoch, 'tent-for': '10.1.2.3; https; writer.test' },
  })

test('[29-3] a request that was handed on and names no caller of its own is nobody, and a key hands on no more than handedPerMinute', async (t) => {
  const world = worldOf(t)
  const limited = {
    change: (d: Bundle['description']) => Object.assign(d.project, { limits: { handedPerMinute: 30 } }),
  }
  const bundle = await bundled(t, limited, world.work)
  const app = await writerIn(world, bundle)
  // `closed` lets nobody in but the system: a request handed on that names no caller is told to sign in.
  assert.equal((await handedOn(app, 'closed')).error.code, 'T0006')
  // Each key hands on its own count of requests in a minute: one more is refused, and another key goes on.
  for (let i = 0; i < 30; i++) assert.equal((await handedOn(app, 'publicTags', keys.other)).status, 200)
  assert.equal((await handedOn(app, 'publicTags', keys.other)).error.code, 'T0005')
  assert.equal((await handedOn(app, 'publicTags', keys.far)).status, 200)
})

test('[21-20@4] the events of an app on many machines are each heard: a reader that joins and leaves, one that stops and starts being current, a writer that changes, and another writer that is heard of', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, {}, world.work))
  const near = await readerIn(world, 'near')
  // The beats pass until the reader is current: on a slow computer a beat and its answer take more than a moment.
  for (let i = 0; i < 80 && !world.heard.includes('machine.current reader'); i++) {
    world.clock.advance(1000)
    await moment(i < 8 ? 15 : 100)
  }
  assert.deepEqual(world.heard, ['reader.joined writer', 'machine.current reader'])
  // A reader that names a newer epoch stops no writer: the writer says that it heard of another, and goes on.
  const other = rawLink(app, keys.other)
  other.link.send(placeOf(app, 'machine-x', { epoch: '9.zzzz' }))
  await until('the writer heard of another', () => world.heard.includes('writer.other writer'))
  // What the writer answered arrives a turn after the event was heard: the test waits for the frame it reads.
  await until('the link was answered', () => other.got.length > 0)
  assert.deepEqual(other.got.at(-1), { t: 'no', code: 'T0030' })
  assert.equal(app.role, 'writer')
  // A reader that names a higher number than a writer that has written is told to keep its file, and is told of.
  await addNote(app, 'written')
  const ahead = rawLink(app, keys.other)
  ahead.link.send(placeOf(app, 'machine-y', { n: app.at().n + 50 }))
  await until('the writer heard of a reader that is ahead', () => world.heard.includes('machine.ahead writer'))
  await until('the link was answered', () => ahead.got.length > 0)
  assert.deepEqual(ahead.got.at(-1), { t: 'again', epoch: app.at().epoch, keep: true })
  // A reader that closes its link has left.
  const leaving = rawLink(app, keys.far)
  leaving.link.send(placeOf(app, 'machine-z'))
  await until('the reader that will leave was taken', () => leaving.got.some((one) => one.t === 'go'))
  leaving.link.close()
  await until('the writer heard that it left', () => world.heard.includes('reader.left writer'))
  // The reader is cut off for longer than it may be behind, and takes over: both say so.
  world.apps[address.writer] = undefined
  await app.close()
  await world.beat(7)
  assert.ok(world.heard.includes('machine.behind reader'))
  const took = await near.takeOver()
  assert.equal(world.heard.at(-1), 'writer.changed writer')
  assert.equal(took.epoch.split('.')[0], '2')
  const left = world.heard.filter((one) => one === 'reader.left writer').length
  assert.equal(left, 1, 'a writer that closes tells of no reader that left')
})

/** Tells a machine that another took over, with the key of a reader, and answers what it was answered. */
const tookTold = (app: App, told: object, key = keys.near): Promise<Answered> =>
  send(app, 'https://writer.test/_t/copy/took', {
    headers: { authorization: `Bearer ${key}` },
    body: JSON.stringify(told),
  })

test('[29-7] a reader that is sent took answers T0030, and a writer that was stopped answers each later took with the newest epoch it was told before, and keeps the newer of the two', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, {}, world.work))
  const near = await readerIn(world, 'near')
  await current(world, near)
  // A machine that is no writer and was never one is stopped by nothing.
  assert.equal((await tookTold(near, { epoch: '5.aaaaaaaa' })).error.code, 'T0030')
  assert.equal(near.role, 'reader')
  // The writer believes a took of a newer epoch with the key of a near reader: it stops, and answers nothing.
  const first = await tookTold(app, { epoch: '5.aaaaaaaa', own: 'https://first.test' })
  assert.deepEqual([first.status, first.body.value], [200, null])
  assert.equal(await codeOf(addNote(app, 'refused')), 'T0030')
  // A second took is answered the epoch that stopped it, with the address of that machine: the newer one is kept.
  const second = await tookTold(app, { epoch: '6.bbbbbbbb', own: 'https://second.test' })
  assert.deepEqual(second.body.value, { other: '5.aaaaaaaa', own: 'https://first.test' })
  const third = await tookTold(app, { epoch: '4.cccccccc' })
  assert.deepEqual(third.body.value, { other: '6.bbbbbbbb', own: 'https://second.test' })
  // A took that tells no epoch does not fit, and one with no key of a reader is not found.
  assert.equal((await tookTold(app, { own: 'https://x.test' })).error.code, 'T0002')
  assert.equal((await tookTold(app, { epoch: '9.dddddddd' }, keys.none)).status, 404)
})

test('[29-3] in the mode live a write that code asks a reader for is T0030, a read is answered there, and the address that carries a member to the writer is not found', async (t) => {
  const world = worldOf(t)
  const bundle = await bundled(t, {}, world.work)
  const app = await world.engine().open(bundle.folder, {
    dataFolder: join(world.work, 'writer'),
    address: '*',
    own: address.writer,
    readers,
  })
  world.apps[address.writer] = app
  await addNote(app, 'on the writer')
  const near = await readerIn(world, 'near')
  await current(world, near)
  // The reader runs in the mode of its writer, and answers a read that code asks it for.
  assert.deepEqual(await tags(near), ['on the writer'])
  // A writer takes no caller on a reader's word: what writes and names its caller in code fails on the reader.
  assert.equal(await codeOf(near.write([{ add: 'tags', values: { name: 'refused' } }], { as: system })), 'T0030')
  assert.equal(await codeOf(near.call('addTag', { name: 'refused' }, { as: system })), 'T0030')
  assert.deepEqual(await tags(app), ['on the writer'])
  // The address by which a reader sends a member on is not found on live data, with the key of a reader too.
  const sentOn = await send(app, 'https://writer.test/_t/copy/do', {
    headers: { authorization: `Bearer ${keys.near}` },
    body: JSON.stringify({ member: 'write', args: [[{ add: 'tags', values: { name: 'sent on' } }]], as: 'system' }),
  })
  assert.equal(sentOn.status, 404)
  assert.deepEqual(await tags(app), ['on the writer'])
})
