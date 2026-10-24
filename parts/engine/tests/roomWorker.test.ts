import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Room, RoomInput } from '../index.ts'
import { apartRoom } from '../index.ts'
import { engineOf, workFolder } from './apps.ts'
import { joiningKeys } from './workLink.ts'
import { untilAsync, writerFor } from './workUse.ts'

test('[52-1] a worker closes the room of each version it holds when it closes, as every made thing is, so nothing of the test room is left standing', async (t) => {
  const writer = await writerFor(t)
  const made: { where: RoomInput['where']; closed: boolean }[] = []
  // The test room, watched: the worker's program makes a room for each version it holds.
  const watched = (o: RoomInput): Room => {
    const room = apartRoom(o)
    const one = { where: o.where, closed: false }
    made.push(one)
    return {
      ...room,
      crosses: room.crosses,
      async close() {
        one.closed = true
        await room.close()
      },
    }
  }
  const engine = engineOf(t, { makers: { clock: () => writer.clock, room: watched } })
  const worker = await engine.work({
    from: 'http://writer.test',
    key: joiningKeys.free,
    kinds: ['gpu'],
    folder: join(workFolder(t), 'worker'),
    insecure: true,
    reach: () => ({
      request: (request, how) => writer.app().request(request, how),
      link: (request) => writer.app().link(request),
    }),
  })
  await untilAsync('the worker is ready', () =>
    writer
      .app()
      .workers()
      .some((listed) => Reflect.get(Object(listed), 'ready').length > 0),
  )
  const ofWorker = made.filter((one) => one.where === 'worker')
  assert.ok(ofWorker.length > 0, 'the worker made a room for the version it holds')
  assert.ok(
    ofWorker.every((one) => !one.closed),
    'the room stands while the worker works',
  )
  await worker.close({ now: true })
  assert.ok(
    ofWorker.every((one) => one.closed),
    'every room the worker made is closed when it closes',
  )
})
