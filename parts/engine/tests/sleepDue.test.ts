import assert from 'node:assert/strict'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { Clock } from '../../core/internal.ts'
import { sqliteStore } from '../../data/index.ts'
import { bundled, engineOf, nobody, system, workFolder } from './apps.ts'
import { untilWithin } from './flowing.ts'
import { notDropped } from './started.ts'

const start = Date.UTC(2031, 0, 1)
const minutes = (n: number): number => n * 60_000
const hours = (n: number): number => n * minutes(60)

/** A clock that stands still until the test moves it. */
function handClock() {
  let moment = start
  let timers: { at: number; run: () => void }[] = []
  const clock: Clock = {
    now: () => moment,
    setTimer(at, run) {
      const timer = { at, run }
      timers.push(timer)
      return () => {
        timers = timers.filter((one) => one !== timer)
      }
    },
  }
  const advance = (ms: number): void => {
    const to = moment + ms
    for (;;) {
      const due = timers.filter((one) => one.at <= to).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      timers = timers.filter((one) => one !== due)
      moment = Math.max(moment, due.at)
      due.run()
    }
    moment = to
  }
  return { clock, advance }
}

/** An app of the project that sleeps, on a hand clock, with what the engine heard of it and the stores it made. */
async function sleepy(t: TestContext, o: { backupsEvery?: number; failing?: () => boolean } = {}) {
  const bundle = await bundled(t, {
    project: 'sleepy',
    ...(o.backupsEvery === undefined
      ? {}
      : {
          change: (description) => {
            description.project.backups = { every: o.backupsEvery }
          },
        }),
  })
  const hand = handClock()
  let made = 0
  const store = () => {
    made += 1
    if (o.failing?.()) throw new Error('the store of this test cannot be opened now')
    return sqliteStore()
  }
  const engine = engineOf(t, { makers: { clock: () => hand.clock, store } })
  const heard: string[] = []
  engine.on('app.asleep', ({ dueAt }) => void heard.push(dueAt === undefined ? 'asleep' : `asleep until ${dueAt}`))
  engine.on('app.woke', () => void heard.push('woke'))
  const app = await engine.open(bundle.folder, {
    dataFolder: join(workFolder(t), 'data'),
    mode: 'test',
    sleepAfter: '10 minutes',
  })
  return { app, ...hand, heard, made: () => made }
}

test('[21-24] an app that was used is woken for its daily upkeep at its time, and then sleeps with nothing due', async (t) => {
  const { app, advance, heard } = await sleepy(t, { backupsEvery: hours(48) })
  await app.call('allMarks', {}, { as: nobody })
  advance(minutes(11))
  await untilWithin(() => heard.length === 1, 'the app fell asleep')
  assert.deepEqual(heard, [`asleep until ${start + hours(24)}`])
  advance(hours(24))
  await untilWithin(() => heard.length === 2, 'the daily upkeep woke the app')
  advance(minutes(11))
  await untilWithin(() => heard.length === 3, 'the daily upkeep woke the app, and it fell asleep again')
  assert.deepEqual(
    heard.slice(1),
    ['woke', 'asleep'],
    'the daily upkeep is no use from outside: nothing is due after it',
  )
})

test('[21-24] a backup on its schedule wakes an app that was written since its last one, and no other', async (t) => {
  const quiet = await sleepy(t, { backupsEvery: hours(1) })
  quiet.advance(minutes(11))
  await untilWithin(() => quiet.heard.length === 1, 'the app fell asleep')
  assert.deepEqual(quiet.heard, ['asleep'], 'an app that was not written since it opened is woken for no backup')
  const written = await sleepy(t, { backupsEvery: hours(1) })
  await written.app.call('addMark', { what: 'one' }, { as: nobody })
  written.advance(minutes(11))
  await untilWithin(() => written.heard.length === 1, 'the app fell asleep')
  // It was used too, so its daily upkeep is due: the backup, an hour after the opening, comes first.
  assert.deepEqual(written.heard, [`asleep until ${start + hours(1)}`])
})

test('[21-24] a member that is no use wakes an app that sleeps for the length of its call, and the app falls asleep again at its end', async (t) => {
  const { app, advance, heard } = await sleepy(t)
  advance(minutes(11))
  await untilWithin(() => heard.length === 1, 'the app fell asleep')
  const facts = await app.facts()
  assert.ok(facts)
  await untilWithin(() => heard.length === 3, 'the app fell asleep again at the end of the member')
  assert.deepEqual(heard, ['asleep', 'woke', 'asleep'])
})

test('[21-24] live and link of an app that sleeps answer at once, and what is sent through them waits for the waking', async (t) => {
  const { app, advance, heard } = await sleepy(t)
  advance(minutes(11))
  await untilWithin(() => heard.length === 1, 'the app fell asleep')
  const end = app.live(new Request('http://localhost/_t/live'))
  assert.equal(typeof end.send, 'function', 'live answered an end at once')
  const link = app.link(new Request('http://localhost/_t/copy'))
  assert.equal(typeof link.send, 'function', 'link answered an end at once')
  await untilWithin(() => heard.includes('woke'), 'the live connection woke the app')
  end.close()
  link.close()
})

test('[21-24] a waking for a due moment that fails is tried again after the waits of the tries of a step, 5 seconds, 30 seconds and 3 minutes, and then every 3 minutes', async (t) => {
  let failing = false
  const { app, advance, heard, made } = await sleepy(t, { failing: () => failing })
  const { run } = notDropped(await app.start('napping', undefined, { as: system }))
  await untilWithin(() => app.runs.read(run)?.state === 'waiting', 'the run waits')
  advance(minutes(11))
  await untilWithin(() => heard.length === 1, 'the app fell asleep')
  failing = true
  const before = made()
  advance(minutes(49))
  await untilWithin(() => made() === before + 1, 'the due moment tried a waking')
  for (const [wait, tries] of [
    [5_000, 2],
    [30_000, 3],
    [180_000, 4],
    [180_000, 5],
  ]) {
    advance(wait - 1)
    await new Promise((done) => setTimeout(done, 20))
    assert.equal(made(), before + tries - 1, `no waking before the wait of ${wait} ms`)
    advance(1)
    await untilWithin(() => made() === before + tries, `a waking after the wait of ${wait} ms`)
  }
  failing = false
  advance(180_000)
  await untilWithin(() => heard.includes('woke'), 'the waking worked')
})
