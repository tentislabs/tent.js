import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { addUser, codeOf, logRows, nobody, refusal, running, send, system } from './apps.ts'

const titles = (rows: unknown): string[] => (Array.isArray(rows) ? rows.map((row) => String(Object(row).title)) : [])

/** Counts how often the main thread came round while a piece of work was awaited: none where the work held it. */
async function turnsDuring(work: () => Promise<unknown>): Promise<{ turns: number; answer: unknown }> {
  let turns = 0
  const timer = setInterval(() => turns++, 5)
  try {
    return { answer: await work(), turns }
  } finally {
    clearInterval(timer)
  }
}

test('[20-8] a heavy read that passes its time is stopped, an ordinary one is logged and fails at its next read, and a heavy query whose run was read needs no module', async (t) => {
  const walking = [
    { for: 'i', of: { fn: 'range', args: [0, 150_000] }, do: [{ do: { name: ['i'] } }] },
    { return: { plan: { db: 'tags' }, then: [{ count: [] }] } },
  ]
  const { app, dataFolder, origin } = await running(t, {
    bodies: { heavyWalk: { run: walking } },
    change: (description) => Object.assign(description.project, { limits: { functionDepth: 6, queryTime: 1500 } }),
  })
  await app.call('addTag', { name: 'one' }, { as: system })

  // A heavy query is carried out on a query thread where it is asked through the door, and from an action.
  assert.equal(await app.call('onThread', {}, { as: nobody }), true)
  assert.equal(await app.call('actsHeavy', {}, { as: nobody }), true)
  assert.deepEqual((await send(app, `${origin}/_t/call/onThread`)).body, { ok: true, value: true })
  // Called by a query, it runs where its caller runs.
  assert.equal(await app.call('callsHeavy', {}, { as: nobody }), false)
  // What its code writes into the log is in the log of the app, with the row of its call.
  const lines = logRows(dataFolder, 'lines').filter((row) => row.message === 'asked where it runs')
  assert.deepEqual(
    lines.map((row) => row.name),
    ['onThread', 'onThread', 'onThread', 'onThread'],
  )
  const calls = logRows(dataFolder, 'calls').filter((row) => row.name === 'onThread')
  assert.deepEqual(
    calls.map((row) => [row.kind, row.callerKind, row.ok]),
    Array(4).fill(['query', 'nobody', 1]),
  )

  // A heavy read that passes its time is stopped: its thread is ended, the call fails with T0008, and meanwhile
  // the engine answered others.
  const began = performance.now()
  const spinning = refusal(Promise.resolve(app.call('heavySpin', {}, { as: nobody })))
  let ended = false
  void spinning.then(() => {
    ended = true
  })
  const others: unknown[] = []
  while (others.length < 5) others.push(await app.call('publicTags', {}, { as: nobody }))
  // What is held is the order: the others were answered before the heavy read was stopped.
  assert.equal(ended, false, 'the engine answered while the heavy read ran')
  const stopped = await spinning
  assert.equal(stopped.code, 'T0008')
  assert.ok(performance.now() - began >= 1400)
  assert.deepEqual(
    logRows(dataFolder, 'calls')
      .filter((row) => row.name === 'heavySpin')
      .map((row) => [row.kind, row.ok, row.code]),
    [['query', 0, 'T0008']],
  )
  // The threads of the app work on: a thread that was ended is made anew.
  assert.equal(await app.call('onThread', {}, { as: nobody }), true)
  assert.equal(await app.call('onThread', {}, { as: nobody }), true)

  // An ordinary query cannot be stopped in the middle: past its time its next read fails, and it is logged.
  assert.equal(await codeOf(app.call('slowRead', {}, { as: nobody })), 'T0008')
  const slow = logRows(dataFolder, 'slow').filter((row) => row.name === 'slowRead')
  assert.ok(slow.some((row) => Number(row.ms) >= 1400))

  // A heavy query whose `run` was read is carried out on a thread, which leaves the main thread free meanwhile.
  const walked = await turnsDuring(() => app.call('heavyWalk', {}, { as: nobody }))
  assert.equal(walked.answer, 1)
  assert.ok(walked.turns >= 3, `the main thread came round ${walked.turns} times`)
})

test('[20-8] a heavy query whose run was read is carried out on a query thread with no module loaded', async (t) => {
  const counting = [{ return: { plan: { db: 'tags' }, then: [{ count: [] }] } }]
  const { app, dataFolder, bundle } = await running(t, { bodies: { heavyWalk: { run: counting } } })
  await app.call('addTag', { name: 'one' }, { as: system })
  await app.call('addTag', { name: 'two' }, { as: system })
  // The engine runs the copy of the bundle that it made: its modules are taken away once the app is open.
  rmSync(join(dataFolder, 'versions', bundle.versionId, 'server'), { recursive: true })
  assert.equal(await app.call('heavyWalk', {}, { as: nobody }), 2)
  assert.equal(await app.call('heavyWalk', {}, { as: nobody }), 2)
  // A heavy query that is code needs its module on the thread, which is not there to load.
  assert.equal(await codeOf(app.call('onThread', {}, { as: nobody })), 'T0011')
  // The main thread loaded every module when the app opened, and answers the same query where a query calls it.
  assert.equal(await app.call('callsHeavy', {}, { as: nobody }), false)
  assert.equal(await app.call('heavyWalk', {}, { as: nobody }), 2)
})

test('[21-21b] a heavy query written with run and no output answers rows as db handed them, filtered on its thread', async (t) => {
  const { app, origin } = await running(t)
  const ada = await addUser(app, 'Ada', [], 5000)
  await addUser(app, 'Bob', [], 4000)
  await app.call('addNote', { title: 'first' }, { as: ada })
  await app.call('addNote', { title: 'second' }, { as: ada })

  // Rows as `db` handed them pass, under the rules of the caller, and a moment crosses as a moment.
  const notes = await app.call('heavyNotes', {}, { as: ada })
  assert.deepEqual(titles(notes), ['first', 'second'])
  assert.ok(Array.isArray(notes) && notes[0].createdAt instanceof Date)
  assert.equal(await codeOf(app.call('heavyNotes', {}, { as: nobody })), 'T0006')
  // A copy of a row is refused, as on the main thread, and the log holds the error under the ref of its call.
  const copied = await refusal(app.call('heavyCopies', {}, { as: ada }))
  assert.equal(copied.code, 'T0009')
  assert.match(copied.message, /output/)
  // A `private` column does not cross: through `app.call`, and through the web.
  const users = await app.call('heavyUsers', {}, { as: nobody })
  assert.ok(Array.isArray(users) && users.length === 2)
  for (const row of users) assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'id', 'name', 'roles', 'updatedAt'])
  const sent = await send(app, `${origin}/_t/call/heavyUsers`)
  assert.equal(sent.status, 200)
  assert.equal(JSON.stringify(sent.body).includes('5000'), false)
  assert.deepEqual(
    Object(sent.body.value).map((row: Record<string, unknown>) => row.name),
    ['Ada', 'Bob'],
  )
  const failed = await send(app, `${origin}/_t/call/heavySpin`, { input: { more: 1 } })
  assert.deepEqual([failed.status, failed.error.code, failed.error.fields], [400, 'T0002', { more: 'unknown' }])
})
