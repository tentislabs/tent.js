import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { testApp } from '../index.ts'
import { command } from './desks.ts'
import type { MachineAnswer } from './many.ts'
import { beat, current, folderOf, level, machinesOf, moment, readersHeld, send, titles, until } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'

/** The highest number that the `Tent-Wrote` of an answer names. */
function wroteIn(sent: MachineAnswer): number {
  const mark = sent.headers.get('tent-wrote') ?? ''
  const numbers = [...mark.slice(mark.indexOf('.') + 1).matchAll(/(?:^|:)(\d+)/g)].map((found) => Number(found[1]))
  assert.ok(numbers.length > 0, `the answer names what it wrote: ${mark}`)
  return Math.max(...numbers)
}

test(
  '[29-5] a far reader holds the answer of a request that it handed on until it has applied what the answer wrote, and for catchUp at the most',
  readersHeld,
  async (t) => {
    // A reader waits half a minute for a write here, so that the test tells that wait from a moment of the computer.
    tempOf(t)
    const project = copyOf(t, 'many')
    const tent = join(project, 'tent.ts')
    writeFileSync(
      tent,
      readFileSync(tent, 'utf8').replace(
        "{ title: 'Many machines' }",
        "{ title: 'Many machines', limits: { catchUp: '30 seconds' } }",
      ),
    )
    const app = await testApp({ folder: project })
    closing(t, () => app.close())
    const near = await app.reader()
    const far = await app.reader({ far: true })
    await current(app, near, far)
    await send(app, 'addOrder', { title: 'one' })
    await level(app, near, far)

    /** Sends a write through the far reader while nothing of the link reaches it, and answers once the writer holds it. */
    const through = async (title: string): Promise<{ asking: Promise<MachineAnswer>; answered: () => boolean }> => {
      far.hold()
      let ended = false
      const asking = send(far, 'addOrder', { title }).finally(() => {
        ended = true
      })
      await until('the writer carried the write out', async () => (await titles(app)).includes(title))
      // The writer has answered: a moment later the far reader has the answer, and still holds it.
      await moment(300)
      return { asking, answered: () => ended }
    }

    // The far reader was handed nothing of the write: the answer waits there until the write arrives.
    const first = await through('through the far reader')
    assert.equal(first.answered(), false)
    assert.equal(far.at().n < app.at().n, true)
    far.release()
    const sent = await first.asking
    assert.equal(sent.status, 200)
    assert.equal(far.at().n >= wroteIn(sent), true, 'the far reader applied the write before the answer left')
    assert.equal((await titles(far)).includes('through the far reader'), true)

    // It waits for catchUp at the most: the answer leaves then, though the write has not arrived.
    const second = await through('held for a moment')
    assert.equal(second.answered(), false)
    app.clock.advance('31 seconds')
    const late = await second.asking
    assert.equal(late.status, 200)
    assert.equal(far.at().n < wroteIn(late), true)
    far.release()
  },
)

test(
  '[29-7] tent take-over says since when a reader was not current: nothing while it is, then a moment after the time of its last answered beat ran out, and the same moment whenever it is asked',
  readersHeld,
  async (t) => {
    const { app, near } = await machinesOf(t)
    const folder = folderOf(t, 'reader-2')
    const looked = async (): Promise<Record<string, unknown>> =>
      Object(await command(near, folder, 'take-over', { look: true }))
    await send(app, 'addOrder', { title: 'one' })
    await level(app, near)
    await beat(app, 2)
    await current(app, near)
    const while1 = await looked()
    assert.equal(while1.current, true)
    assert.equal('notCurrentSince' in while1, false)
    assert.equal(typeof while1.lastBeat, 'number')
    // The link is cut: the reader is current for as long as its last answered beat lets it, and no longer.
    near.cut()
    await until(
      'the reader is current no more',
      async () => {
        await beat(app)
        return !near.at().current
      },
      40,
    )
    const after = await looked()
    assert.equal(after.current, false)
    const [lastBeat, since] = [Number(after.lastBeat), Number(after.notCurrentSince)]
    // `behind` is five seconds: the reader was current until that long after it sent the last beat that made it
    // current, which is the last one that was answered or the one before it.
    assert.equal(since > lastBeat + 5000 - 2000, true, `${since} against the last beat at ${lastBeat}`)
    assert.equal(since >= Number(while1.lastBeat), true)
    // The writer answers a write without this reader no earlier than that: it waited that long for it.
    assert.equal((await send(app, 'addOrder', { title: 'answered without the reader' })).status, 200)
    // Asked later, it says the same moment.
    await beat(app, 4)
    const later = await looked()
    assert.deepEqual([later.current, later.notCurrentSince, later.lastBeat], [false, since, lastBeat])
  },
)
