import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { sqliteStore } from '../../data/index.ts'
import type { App, Lease, Reach, Store } from '../index.ts'
import type { Bundle } from './apps.ts'
import { bundled, codeOf, send } from './apps.ts'
import type { World } from './machines.ts'
import {
  addNote,
  current,
  keys,
  machineAddress as address,
  moment,
  pastKeeping,
  placeTold,
  rawLink,
  readerIn,
  readers,
  tags,
  until,
  worldOf,
  writerIn,
} from './machines.ts'

// A project that keeps few changes: some forty writes of the tests pass what it keeps.
const keepsLittle = {
  change: (description: Bundle['description']) => {
    description.project.limits = { ...Object(description.project.limits), sinkSize: 2000 }
  },
}

/** Writes so much that the changes together pass what the project keeps. */
async function pastWhatIsKept(app: App, what: string): Promise<void> {
  for (let i = 0; i < 40; i++) await addNote(app, `${what} ${i} ${'x'.repeat(200)}`)
}

const lostIn = (folder: string): string[] => readdirSync(folder).filter((name) => name.startsWith('lost.'))

test('[29-2] a reader whose fetch takes longer than the writer needs to write sinkSize joins all the same, with one fetch, and what was kept for it is kept no longer once its time has passed', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, keepsLittle, world.work))
  await addNote(app, 'before the fetch')
  const place = { n: app.at().n, sum: app.at().sum }
  // The data is sent, and does not arrive at the reader for now.
  let sent = false
  let arrive = (): void => undefined
  const held = new Promise<void>((done) => {
    arrive = done
  })
  const slow: Reach = (to) => {
    const inner = world.reach(to)
    if (!inner) return undefined
    return {
      link: (request) => inner.link(request),
      async request(request, o) {
        const answer = await inner.request(request, o)
        if (new URL(request.url).pathname !== '/_t/copy/data') return answer
        sent = true
        await held
        return answer
      },
    }
  }
  const joining = readerIn(world, 'near', world.engine(), slow)
  await until('the data was sent to the reader', () => sent)
  await pastWhatIsKept(app, 'while the data was on its way')
  // The writer keeps every change after the number of the data it sent, past what it keeps otherwise.
  const probe = rawLink(app, keys.other)
  probe.link.send(placeTold(app, 'machine-probe', place))
  await until('the place of the data that was sent was answered', () => probe.got.length > 0)
  assert.equal(probe.got[0].t, 'go')
  probe.link.close()
  arrive()
  const near = await joining
  await until('the reader holds every write', () => near.at().n === app.at().n)
  assert.equal(world.asked['/_t/copy/data'], 1)
  await current(world, near)
  assert.deepEqual(await tags(near), await tags(app))
  assert.equal((await tags(near)).length, 41)
  assert.deepEqual(lostIn(join(world.work, 'near')), [])
  // Once that time has passed, the writer keeps what it keeps for anyone: the place of the data fits no more.
  await near.close()
  await pastKeeping(world)
  await addNote(app, 'after the time of the fetch')
  const late = rawLink(app, keys.other)
  late.link.send(placeTold(app, 'machine-probe', place))
  await until('the place was answered once more', () => late.got.length > 0)
  assert.deepEqual(late.got[0], { t: 'again', epoch: app.at().epoch })
})

test('[29-2] a reader whose fetch takes longer than twice changesKept is not sent round again: the writer keeps every change after the number of the data while the data is being fetched, and for changesKept after it was sent', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, keepsLittle, world.work))
  await addNote(app, 'before the fetch')
  const place = { n: app.at().n, sum: app.at().sum }
  let sent = false
  let arrive = (): void => undefined
  const held = new Promise<void>((done) => {
    arrive = done
  })
  const slow: Reach = (to) => {
    const inner = world.reach(to)
    if (!inner) return undefined
    return {
      link: (request) => inner.link(request),
      async request(request, o) {
        const answer = await inner.request(request, o)
        if (new URL(request.url).pathname !== '/_t/copy/data') return answer
        sent = true
        await held
        return answer
      },
    }
  }
  const joining = readerIn(world, 'near', world.engine(), slow)
  await until('the data was asked of the writer', () => sent)
  // The fetch takes twenty-five minutes, more than twice the ten of changesKept, on a writer that writes past
  // what it keeps otherwise.
  for (let minute = 0; minute < 25; minute++) {
    world.clock.advance(60_000)
    await moment(1)
  }
  await pastWhatIsKept(app, 'while the data was on its way')
  const probe = rawLink(app, keys.other)
  probe.link.send(placeTold(app, 'machine-probe', place))
  await until('the place of the data that is being fetched was answered', () => probe.got.length > 0)
  assert.equal(probe.got[0].t, 'go')
  probe.link.close()
  arrive()
  const near = await joining
  await until('the reader holds every write', () => near.at().n === app.at().n)
  assert.equal(world.asked['/_t/copy/data'], 1)
  // Nine minutes after the data was sent the changes are still kept, and after eleven they are kept no more.
  await near.close()
  const asked = async (): Promise<unknown> => {
    await addNote(app, 'after the fetch')
    const again = rawLink(app, keys.other)
    again.link.send(placeTold(app, 'machine-probe', place))
    await until('the place was answered once more', () => again.got.length > 0)
    again.link.close()
    return again.got[0].t
  }
  for (let minute = 0; minute < 9; minute++) {
    world.clock.advance(60_000)
    await moment(1)
  }
  assert.equal(await asked(), 'go')
  for (let minute = 0; minute < 2; minute++) {
    world.clock.advance(60_000)
    await moment(1)
  }
  assert.equal(await asked(), 'again')
})

test('[29-2] a reader that holds the number and the sum at which its writer began to keep is told to go on while the writer keeps the change after them, and fetches the data anew, once, when it does not', async (t) => {
  const world = worldOf(t)
  const bundle = await bundled(t, keepsLittle, world.work)
  // The app ran alone first, and kept no change: it begins to keep when it is opened for its readers.
  const alone = await world.engine().open(bundle.folder, { dataFolder: join(world.work, 'writer'), mode: 'test' })
  await addNote(alone, 'before any reader')
  await addNote(alone, 'before any reader too')
  await alone.close()
  const app = await writerIn(world, bundle)
  const began = app.at()
  // Both readers fetch the data as it stood then, and are stopped before a change reaches them.
  let near = await readerIn(world, 'near')
  let far = await readerIn(world, 'far')
  assert.deepEqual([near.at().n, far.at().n], [began.n, began.n])
  assert.equal(world.asked['/_t/copy/data'], 2)
  await near.close()
  await far.close()
  // The writer keeps the change after that number: a reader at the number is told to go on, and fetches nothing.
  await addNote(app, 'the change after')
  far = await readerIn(world, 'far')
  await until('the reader that was told to go on holds the write', () => far.at().n === app.at().n)
  assert.equal(world.asked['/_t/copy/data'], 2)
  await current(world, far)
  assert.deepEqual(await tags(far), ['before any reader', 'before any reader too', 'the change after'])
  // The writer keeps that change no more: the reader at the number fetches the data anew, once, and keeps nothing.
  await pastKeeping(world)
  await pastWhatIsKept(app, 'past what is kept')
  near = await readerIn(world, 'near')
  await until('the reader that fell out of what is kept joined again', () => near.at().n === app.at().n)
  assert.equal(world.asked['/_t/copy/data'], 3)
  assert.deepEqual(lostIn(join(world.work, 'near')), [])
  await current(world, near)
  assert.equal((await tags(near)).length, 43)
})

test('[29-3] a reader whose request was refused by its writer under another epoch answers its caller T0029, asks the writer once, and goes on following it', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, {}, world.work))
  // What the reader hands on reaches its writer under an epoch that is not the writer's, while the test says so.
  let other = false
  let handed = 0
  const reach: Reach = (to) => {
    const inner = world.reach(to)
    if (!inner) return undefined
    return {
      link: (request) => inner.link(request),
      request(request, o) {
        if (!other || !request.headers.has('tent-epoch')) return inner.request(request, o)
        handed++
        const headers = new Headers(request.headers)
        headers.set('tent-epoch', '0.none')
        return inner.request(new Request(request, { headers }), o)
      },
    }
  }
  const near = await readerIn(world, 'near', world.engine(), reach)
  await current(world, near)
  const sendWord = (text: string): ReturnType<typeof send> =>
    send(near, 'https://near.test/_t/call/addWord', { input: { text } })
  const readWords = async (): Promise<unknown[]> =>
    Object(await app.read({ from: 'words', sort: [{ by: 'createdAt' }] }, { as: { kind: 'system' } })).map(
      (row: { text: string }) => row.text,
    )
  assert.equal((await sendWord('handed on')).status, 200)
  other = true
  const refused = await sendWord('refused')
  // The writer said that it is not the writer under that epoch: the caller is told that the writer was not reached.
  assert.deepEqual([refused.status, refused.error.code], [503, 'T0029'])
  assert.equal(refused.error.fields, undefined, 'nothing says that the request may have been carried out')
  assert.equal(handed, 1, 'the request went to the writer once, and not round')
  assert.deepEqual(await readWords(), ['handed on'])
  // The link of the reader is open under the epoch of its writer: it looks for no other writer, and hands on again.
  assert.deepEqual([near.role, near.at().epoch], ['reader', app.at().epoch])
  other = false
  assert.equal((await sendWord('handed on again')).status, 200)
  assert.deepEqual(await readWords(), ['handed on', 'handed on again'])
  assert.equal(world.heard.includes('writer.other writer'), false)
})

for (const startedAgain of [false, true])
  test(`[29-7] with a lease a near reader that is 1,000 writes behind and was never current${startedAgain ? ', and that was started again while its writer was gone,' : ''} does not take over while another reader that holds everything answers, and does once that one is gone`, async (t) => {
    const world = worldOf(t)
    const names: Record<string, string> = {}
    let yes = ['writer']
    let asked: string[] = []
    const lease: Lease = {
      hold: ({ machine }) => {
        const name = names[machine] ?? machine
        asked.push(name)
        return yes.includes(name)
      },
    }
    const app = await writerIn(world, await bundled(t, {}, world.work), world.engine({ lease }))
    names[app.machines()[0].id] = 'writer'
    await world.beat()
    const near = await readerIn(world, 'near', world.engine({ lease }))
    await current(world, near)
    names[app.machines()[1].id] = 'near'
    // A second near reader joins, is told the machines, and is handed nothing after that: it applies no write, and
    // no beat of it is answered.
    let passing = true
    const gated: Reach = (to) => {
      const inner = world.reach(to)
      if (!inner) return undefined
      return {
        request: (request, o) => inner.request(request, o),
        link(request) {
          const link = inner.link(request)
          return {
            send: (frame) => link.send(frame),
            close: () => link.close(),
            each(fn, closed) {
              link.each((frame) => {
                if (passing) fn(frame)
                if (typeof frame === 'string' && Object(JSON.parse(frame)).t === 'machines') passing = false
              }, closed)
            },
          }
        },
      }
    }
    const lateOwn = 'https://late.test'
    const lateOptions = {
      from: address.writer,
      key: keys.other,
      dataFolder: join(world.work, 'late'),
      own: lateOwn,
      readers,
      reach: gated,
      address: '*',
    }
    let lateEngine = world.engine({ lease })
    let late = await lateEngine.read(lateOptions)
    world.apps[lateOwn] = late
    await until('the late reader was told the machines', () => late.machines().length === 3)
    names[late.machines().find((one) => one.own === lateOwn)?.id ?? ''] = 'late'
    const before = late.at().n
    for (let i = 0; i < 1000; i++) await addNote(app, `write ${i}`)
    await until('the near reader holds every write', () => near.at().n === app.at().n)
    assert.equal(late.at().n, before)
    assert.equal(near.at().n, before + 1000)
    // The writer is gone, and the lease would say yes to the late reader alone.
    world.apps[address.writer] = undefined
    await app.close()
    if (startedAgain) {
      // Started again, it is told the machines by nobody: it holds the addresses that its writer last named in its data.
      world.apps[lateOwn] = undefined
      await lateEngine.close()
      lateEngine = world.engine({ lease })
      late = await lateEngine.read(lateOptions)
      world.apps[lateOwn] = late
      assert.equal(late.at().n, before)
    }
    yes = ['late']
    asked = []
    await world.beat(12)
    assert.ok(asked.includes('near'), 'the reader that was current asks the lease')
    assert.equal(asked.includes('late'), false, 'the reader that was far behind does not ask while the other answers')
    assert.deepEqual([near.role, late.role], ['reader', 'reader'])
    // The reader that holds everything is gone too: nothing answers with a higher number, and the late one asks.
    world.apps[address.near] = undefined
    await near.close()
    await world.beat(3)
    await until('the late reader took over by itself', () => late.role === 'writer')
    assert.ok(asked.includes('late'))
    assert.equal(late.at().epoch.split('.')[0], '2')
  })

test('[29-7] a change that was under way when the lease of its writer ran out is undone with T0030, and the writer writes again with its next yes', async (t) => {
  const world = worldOf(t)
  let yes = true
  const lease: Lease = { hold: () => yes }
  // A store of the test: after a tag was added inside a write, it does what the test asks for, once.
  let inside = (): void => undefined
  const store = (): Store => {
    const inner = sqliteStore()
    const plain = inner.write
    const write: Store['write'] = (fn, o) =>
      plain(
        (tx) =>
          fn({
            ...tx,
            add(table, values, caller) {
              const row = tx.add(table, values, caller)
              if (table === 'tags') inside()
              return row
            },
          }),
        o,
      )
    return Object.assign(inner, { write })
  }
  const app = await writerIn(world, await bundled(t, {}, world.work), world.engine({ lease, store }))
  await world.beat()
  await addNote(app, 'under the lease')
  // The write has begun under a yes. Inside it the lease says no, and the time of the last yes passes.
  let ranOut = 0
  inside = () => {
    inside = () => undefined
    ranOut++
    yes = false
    world.clock.advance(6000)
  }
  assert.equal(await codeOf(addNote(app, 'under way when the lease ran out')), 'T0030')
  assert.equal(ranOut, 1)
  // With its next yes the writer goes on, and holds nothing of the write that was undone.
  yes = true
  await world.beat(2)
  await addNote(app, 'with the next yes')
  assert.deepEqual(await tags(app), ['under the lease', 'with the next yes'])
})

/**
 * A writer that put a file back and was started again, and a near reader that was away over both: it holds three
 * writes that the restore gave up, under the epoch before.
 */
async function restoredAndStarted(t: TestContext): Promise<{ world: World; app: App; held: number }> {
  const world = worldOf(t)
  const bundle = await bundled(t, {}, world.work)
  const first = world.engine()
  let app = await writerIn(world, bundle, first)
  const near = await readerIn(world, 'near')
  await current(world, near)
  await addNote(app, 'kept by the mark')
  const mark = join(world.work, 'mark.db')
  await app.snapshot(mark)
  for (const title of ['given up 1', 'given up 2', 'given up 3']) await addNote(app, title)
  await until('the reader holds every write', () => near.at().n === app.at().n)
  const held = near.at().n
  await near.close()
  await world.beat(7)
  await app.restore(mark)
  assert.equal(app.at().epoch.split('.')[0], '2')
  assert.ok(app.at().n < held, 'the writer holds a lower number than the reader that was away')
  // The writer is started again: what it knew of the restore in memory is gone.
  world.apps[address.writer] = undefined
  await first.close()
  app = await writerIn(world, bundle)
  return { world, app, held }
}

test('[29-2] a reader that was away while its writer put a file back and was started again fetches the data anew, once, and follows the writer under its newer epoch', async (t) => {
  const { world, app } = await restoredAndStarted(t)
  const fetched = world.asked['/_t/copy/data']
  const near = await readerIn(world, 'near')
  await until(
    'the reader fetched the data anew',
    () => near.at().epoch === app.at().epoch && near.at().n === app.at().n,
  )
  assert.equal(world.asked['/_t/copy/data'], fetched + 1)
  await current(world, near)
  assert.deepEqual(await tags(near), ['kept by the mark'])
  await addNote(app, 'after the restore')
  await until('the reader holds the next write', () => near.at().n === app.at().n)
  assert.deepEqual(await tags(near), ['kept by the mark', 'after the restore'])
})

test('[29-2] a reader that was away while its writer put a file back and was started again keeps no lost file: what it held was given up on purpose', async (t) => {
  const { world, app } = await restoredAndStarted(t)
  const near = await readerIn(world, 'near')
  await until(
    'the reader fetched the data anew',
    () => near.at().epoch === app.at().epoch && near.at().n === app.at().n,
  )
  assert.deepEqual(lostIn(join(world.work, 'near')), [])
})
