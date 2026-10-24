import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Clock, Description } from '../../core/internal.ts'
import { bundled, engineOf, workFolder } from './apps.ts'
import { untilWithin } from './flowing.ts'

// What an app that may sleep answers of its description after a switch: that of the running version, awake and
// asleep, as `21`, section 2, point 15, keeps it.

/** A clock that stands still until the test moves it. */
function stillClock(start: number = Date.UTC(2031, 0, 1)) {
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

test('[21-24] the description of an app that may sleep is that of its running version after a switch, awake, asleep and woken again', async (t) => {
  const work = workFolder(t)
  const first = await bundled(t, { project: 'sleepy' }, work)
  const newer = await bundled(
    t,
    {
      project: 'sleepy',
      change: (d: Description) => {
        d.tables.labels = { columns: { name: { kind: 'text' } }, access: { read: { rule: 'anyone', why: 'open' } } }
      },
    },
    work,
  )
  const { clock, advance } = stillClock()
  const engine = engineOf(t, { makers: { clock: () => clock } })
  const heard: string[] = []
  engine.on('app.asleep', () => void heard.push('asleep'))
  engine.on('app.woke', () => void heard.push('woke'))
  const app = await engine.open(first.folder, { dataFolder: join(work, 'data'), mode: 'test', sleepAfter: '1 minute' })
  const version = await app.add(newer.folder)
  await app.switch(version)
  const tables = (): string[] => Object.keys(app.description.tables).sort()
  assert.deepEqual(tables(), ['labels', 'marks'], 'awake, after the switch')
  advance(2 * 60_000)
  await untilWithin(() => heard.length === 1, 'the app fell asleep')
  assert.deepEqual(tables(), ['labels', 'marks'], 'asleep, as it stood')
  await app.ready()
  assert.deepEqual(heard, ['asleep', 'woke'])
  assert.equal(app.versions().find((one) => one.running)?.id, version)
  assert.deepEqual(tables(), ['labels', 'marks'], 'woken again')
})
