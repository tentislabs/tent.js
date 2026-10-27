import assert from 'node:assert/strict'
import test from 'node:test'
import type { MachineAnswer } from './many.ts'
import {
  beat,
  callsOf,
  current,
  level,
  machinesOf,
  moment,
  readersHeld,
  send,
  titles,
  until,
  writerOf,
} from './many.ts'

/** Answers what says whether a promise has ended. */
function watched(work: Promise<unknown>): () => boolean {
  let ended = false
  const end = (): void => {
    ended = true
  }
  work.then(end, end)
  return () => ended
}

const cookieOf = (sent: MachineAnswer): string => (sent.headers.get('set-cookie') ?? '').split(';')[0]

test('[29-4] a write is answered only once the near reader holds it, and while it waits no read that saw its row is answered on any machine', async (t) => {
  const { app, near, far } = await machinesOf(t)
  // The answer of a write leaves once the near reader holds it: a read there right after it answers the new row.
  await send(app, 'addOrder', { title: 'one' })
  assert.equal(near.at().n, app.at().n)
  const before = callsOf(t, 'data', 'listOrders')
  assert.equal(Object((await send(near, 'listOrders')).value).length, 1)
  assert.equal(callsOf(t, 'data', 'listOrders'), before)

  // While a write waits for the near reader, a read that saw its row is answered nowhere.
  near.hold()
  const held = app.at().n
  const write = send(app, 'addOrder', { title: 'two' })
  // The reads begin once the write is committed and the far reader holds it: each of them sees its row.
  // What the writer counts may be written beside it, and waits as it does.
  await until('the far reader holds the write that waits', () => app.at().n > held && far.at().n === app.at().n)
  const [onWriter, onFar] = [send(app, 'listOrders'), send(far, 'listOrders')]
  const ended = [write, onWriter, onFar].map(watched)
  await moment(600)
  assert.deepEqual(
    ended.map((one) => one()),
    [false, false, false],
  )
  assert.equal(app.at().settled, held)
  near.release()
  assert.equal((await write).status, 200)
  assert.equal(near.at().n, app.at().n)
  for (const read of [await onWriter, await onFar]) assert.equal(Object(read.value).length, 2)
})

test(
  '[29-4] with the link of the near reader held back or closed, a write is answered after behind and one beat, and the near reader answers nothing itself by then',
  readersHeld,
  async (t) => {
    const { app, near } = await machinesOf(t)
    for (const how of ['held', 'cut'] as const) {
      if (how === 'held') near.hold()
      else near.cut()
      const write = send(app, 'addOrder', { title: how })
      const ended = watched(write)
      // Five seconds on, the write still waits: the reader may be current for that long.
      await beat(app, 4)
      assert.equal(ended(), false, how)
      await beat(app, 3)
      assert.equal((await write).status, 200, how)
      assert.equal(near.at().current, false, how)
      // The near reader answers nothing itself by then: a query is handed to the writer.
      const before = callsOf(t, 'data', 'listOrders')
      const read = await send(near, 'listOrders')
      assert.equal(callsOf(t, 'data', 'listOrders'), before + 1, how)
      assert.equal(Object(read.value).length, how === 'held' ? 1 : 2, how)
      // A write that follows waits for it no longer.
      assert.equal((await send(app, 'addCustomer', { name: how })).status, 200)
      if (how === 'held') near.release()
      else near.join()
      await current(app, near)
      assert.equal(near.at().n, app.at().n)
    }
  },
)

test(
  '[29-4] a near reader that joins with ten thousand writes to catch up holds no write back while it does',
  readersHeld,
  async (t) => {
    const { app, near } = await machinesOf(t)
    near.cut()
    await beat(app, 7)
    const writes = 10_000
    for (let i = 0; i < writes; i++)
      await app.write([{ add: 'customers', values: { name: `c${i}` } }], { as: 'system' })
    near.join()
    app.clock.advance('1 second')
    const joined = (): boolean => app.machines().some((one) => one.role === 'reader' && !one.far)
    await until('the near reader has begun to catch up', joined, 2000)
    // While it catches up, a write is answered at once, and the reader is not waited for.
    const behind = app.at().n - near.at().n
    const answered = await send(app, 'addOrder', { title: 'not held back' })
    assert.equal(answered.status, 200)
    assert.ok(behind > 0 && near.at().n < app.at().n, `the reader was ${behind} writes behind`)
    await until('the near reader holds every write', () => near.at().n === app.at().n, 6000)
    await current(app, near)
    assert.equal((await near.rows('customers')).length, writes)
  },
)

test(
  '[29-4] a writer that is opened again takes no write and answers no read before the near reader has joined and confirmed, and with no near reader it waits for nothing',
  readersHeld,
  async (t) => {
    const { app, near, far } = await machinesOf(t)
    await send(app, 'addOrder', { title: 'before' })
    // The near reader is kept from joining, and the writer is killed and opened again.
    near.cut()
    await app.kill()
    await app.restart()
    const [write, read] = [send(app, 'addOrder', { title: 'after' }), send(app, 'listOrders')]
    const ended = [write, read].map(watched)
    await moment(300)
    assert.deepEqual(
      ended.map((one) => one()),
      [false, false],
    )
    assert.deepEqual(await titles(far), ['before'])
    // Once the near reader has joined and confirmed the newest write, both are answered.
    near.join()
    await beat(app)
    assert.equal((await write).status, 200)
    assert.equal(Object((await read).value).length >= 1, true)
    await level(app, near)

    // An app with no near reader waits for nothing when it opens.
    const alone = await writerOf(t)
    const distant = await alone.reader({ far: true })
    await current(alone, distant)
    await send(alone, 'addOrder', { title: 'one' })
    await alone.kill()
    await alone.restart()
    assert.equal((await send(alone, 'addOrder', { title: 'at once' })).status, 200)
  },
)

test('[29-5] a caller who writes and then reads from a far reader that was told nothing of the write is handed to the writer after catchUp, and is never answered the old rows', async (t) => {
  const { app, far } = await machinesOf(t)
  await send(app, 'addOrder', { title: 'old' })
  await level(app, far)
  far.hold()
  const wrote = await send(app, 'addOrder', { title: 'new' })
  // The answer says where it stands and what it wrote, and sets the cookie while a far reader is joined.
  const n = app.at().n
  assert.equal(wrote.headers.get('tent-at'), `1.${n}`)
  assert.equal(wrote.headers.get('tent-wrote'), `1.orders:${n}`)
  assert.equal(cookieOf(wrote), `tent_wrote.many=1.orders:${n}`)
  assert.match(wrote.headers.get('set-cookie') ?? '', /Max-Age=5; HttpOnly/)
  // The cookie, and `Tent-After` with the `Tent-Wrote` of the answer, hold the read alike.
  const marks: Record<string, string>[] = [
    { cookie: cookieOf(wrote) },
    { 'tent-after': String(wrote.headers.get('tent-wrote')) },
  ]
  for (const headers of marks) {
    const [onWriter, onFar] = [callsOf(t, 'data', 'listOrders'), callsOf(t, 'reader-3', 'listOrders')]
    const began = performance.now()
    const read = await send(far, 'listOrders', {}, { headers })
    assert.ok(performance.now() - began >= 150, 'the read waited a moment for the write')
    assert.equal(Object(read.value).length, 2)
    assert.equal(callsOf(t, 'data', 'listOrders'), onWriter + 1)
    assert.equal(callsOf(t, 'reader-3', 'listOrders'), onFar)
  }
  // With no mark the far reader answers what it holds, a moment behind: that is what the mark is for.
  assert.equal(Object((await send(far, 'listOrders')).value).length, 1)
  far.release()
})

test('[29-5] a mark holds a read by the tables it names, and a mark that is made up costs one wait and one crossing', async (t) => {
  const { app, far } = await machinesOf(t)
  // The far reader is told nothing of one more write, and a mark names that write as one of `teams`.
  await level(app, far)
  far.hold()
  await send(app, 'addOrder', { title: 'the far reader lacks it' })
  assert.equal(far.at().n, app.at().n - 1)
  const cookie = `tent_wrote.many=1.teams:${app.at().n}`
  /** How many requests for a name the writer and the far reader each answered, before and after one request to the far reader. */
  const crossed = async (name: string, headers: Record<string, string>): Promise<[number, number]> => {
    const [onWriter, onFar] = [callsOf(t, 'data', name), callsOf(t, 'reader-3', name)]
    assert.equal((await send(far, name, {}, { headers })).status, 200, name)
    return [callsOf(t, 'data', name) - onWriter, callsOf(t, 'reader-3', name) - onFar]
  }
  // A query written with `rows` that reads another table alone does not wait: the far reader answers it.
  assert.deepEqual(await crossed('listCustomers', { cookie }), [0, 1])
  // A query in code, and one whose table's rule reaches the table of the mark through a second table, do.
  assert.deepEqual(await crossed('countOrders', { cookie }), [1, 0])
  assert.deepEqual(await crossed('listNotes', { cookie }), [1, 0])
  // A number far ahead, a newer epoch and a mark of 100 kB each cost one wait and one crossing.
  for (const after of ['1.999999', '9.1', `1.${'9'.repeat(100_000)}`]) {
    const began = performance.now()
    assert.deepEqual(await crossed('listCustomers', { 'tent-after': after }), [1, 0], after.slice(0, 12))
    assert.ok(performance.now() - began < 2000)
  }
  // A mark of an older epoch costs none.
  assert.deepEqual(await crossed('listCustomers', { 'tent-after': '0.999999' }), [0, 1])
  far.release()
})

test('[29-5] a change that states everywhere, a write to a table that a rule reaches, a write of roles and a raw SQL write with no touches are answered after the far reader confirmed too', async (t) => {
  const { app, far } = await machinesOf(t)
  const ada = await app.user({ name: 'Ada', roles: [] })
  await level(app, far)
  const writes: [string, object][] = [
    ['shout', { title: 'to every machine' }],
    ['openTeam', { name: 'blue' }],
    ['giveRole', { user: ada.user?.id }],
    ['rawWrite', {}],
  ]
  for (const [name, input] of writes) {
    far.hold()
    const write = send(app, name, input)
    const ended = watched(write)
    await moment(150)
    assert.equal(ended(), false, `${name} waits for the far reader`)
    far.release()
    assert.equal((await write).status, 200, name)
    assert.equal(far.at().n, app.at().n, name)
  }
  // An ordinary write waits for no far reader.
  far.hold()
  assert.equal((await send(app, 'addOrder', { title: 'ordinary' })).status, 200)
  assert.ok(far.at().n < app.at().n)
  far.release()
  // With the far reader cut off, such a write is answered after behind and one beat.
  far.cut()
  const late = send(app, 'shout', { title: 'the far reader is cut off' })
  const ended = watched(late)
  await beat(app, 4)
  assert.equal(ended(), false)
  await beat(app, 3)
  assert.equal((await late).status, 200)
})

test('[29-6] a reader whose link is cut answers nothing itself after behind: it hands on, and with the writer gone it answers T0029, on /_t/health too', async (t) => {
  const { app, near } = await machinesOf(t)
  await send(app, 'addOrder', { title: 'one' })
  await level(app, near)
  near.cut()
  // Within `behind` of its last beat it still answers by itself.
  const [onWriter, onNear] = [callsOf(t, 'data', 'listOrders'), callsOf(t, 'reader-2', 'listOrders')]
  assert.equal(Object((await send(near, 'listOrders')).value).length, 1)
  assert.deepEqual([callsOf(t, 'data', 'listOrders'), callsOf(t, 'reader-2', 'listOrders')], [onWriter, onNear + 1])
  // After `behind` it answers nothing itself: it hands on.
  await beat(app, 6)
  assert.equal(near.at().current, false)
  assert.equal(Object((await send(near, 'listOrders')).value).length, 1)
  assert.deepEqual([callsOf(t, 'data', 'listOrders'), callsOf(t, 'reader-2', 'listOrders')], [onWriter + 1, onNear + 1])
  // With the writer gone it answers T0029, on `/_t/health` too.
  await app.kill()
  const refused = await send(near, 'listOrders')
  assert.deepEqual([refused.status, refused.code], [503, 'T0029'])
  const unwell = await send(near, '', {}, { path: '/_t/health', method: 'GET' })
  assert.deepEqual([unwell.status, unwell.code], [503, 'T0029'])
})

test(
  '[29-6] a beat that is held back, and one that is answered without ok, make no reader current, and a reader that joined again is current once it applied the number of an ok beat',
  readersHeld,
  async (t) => {
    const { app, near, far } = await machinesOf(t)
    // The beats of the near reader are held back for longer than `behind`: answered late, they make it current no more.
    near.hold()
    await beat(app, 7)
    assert.equal(near.at().current, false)
    near.release()
    await moment(30)
    assert.equal(near.at().current, false, 'a beat that was held back on its way makes no reader current')
    // A beat and its answer cross in a moment, and in a longer one on a computer that is loaded: the beats pass
    // until the reader is current.
    await current(app, near)

    // A reader that joins again: its first beat is answered without ok, and makes it current no more than none.
    far.cut()
    await beat(app, 7)
    assert.equal(far.at().current, false)
    far.join()
    // A far reader dials again after a wait that it draws, and that doubles with each try that failed, up to `dial`:
    // the beats pass until it has joined, and the first beat of its link is the only one it was answered by then.
    // The clock is moved only where the reader was just seen not to have joined, with nothing between the look and
    // the move: a second that passed after the join, and before the test saw it, would carry a second beat.
    const joined = (): boolean => app.machines().some((one) => one.far)
    for (let second = 0; second < 80 && !joined(); second++) {
      app.clock.advance('1 second')
      for (let look = 0; look < 40 && !joined(); look++) await moment(10)
    }
    assert.equal(joined(), true, 'the far reader joined again')
    assert.equal(far.at().current, false, 'the first beat of a link is answered without ok')
    await current(app, far)
    assert.equal(far.at().n, app.at().n)
  },
)

test(
  '[29-6] a near reader whose writer comes back after ten minutes has joined it within two beats',
  readersHeld,
  async (t) => {
    const { app, near } = await machinesOf(t)
    await app.kill()
    app.clock.advance('10 minutes')
    await moment(30)
    assert.equal(near.at().current, false)
    await app.restart()
    await beat(app, 2)
    // Two beats of the clock and no more: the link of the join crosses in real time, which a room may take longer for.
    await until('the near reader has joined the writer that came back', () =>
      app.machines().some((one) => one.role === 'reader' && !one.far),
    )
    await current(app, near)
    assert.equal((await send(app, 'addOrder', { title: 'after ten minutes' })).status, 200)
    assert.equal(near.at().n, app.at().n)
  },
)
