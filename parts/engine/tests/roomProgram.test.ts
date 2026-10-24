import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Called, Room, RoomInput } from '../index.ts'
import { inProgramRoom } from '../index.ts'
import { nobody, running } from './apps.ts'

/** What a call through the room was handed, the number it was given, and what it answered. */
interface Asked {
  handed: unknown[]
  call: number
  answer: unknown
}

/** A room of the program that tells the test every entry it was asked and every call made through one. */
function watchedRoom(asked: Asked[], made: Room[]): (input: RoomInput) => Room {
  return (input) => {
    const room = inProgramRoom(input)
    made.push(room)
    return {
      get crosses() {
        return room.crosses
      },
      load: (version) => room.load(version),
      entry: (version, entry) => {
        const called = room.entry(version, entry)
        const watched: Called = (handed, o) => {
          const answer = called(handed, o)
          asked.push({ handed, call: o.call, answer })
          return answer
        }
        return watched
      },
      draw: (version) => room.draw(version),
      back: (call, fn, args, o) => room.back(call, fn, args, o),
      program: (o) => room.program(o),
      unload: (version) => room.unload(version),
      close: () => room.close(),
    }
  }
}

test('[52-3] in the room of the program nothing is copied: a change is handed the very record its `run` sees, a query answers the very record the engine filters, the room does not cross, and no call is numbered', async (t) => {
  const asked: Asked[] = []
  const made: Room[] = []
  const { app } = await running(t, { project: 'seam', engine: { makers: { room: watchedRoom(asked, made) } } })
  assert.equal(made.length, 1, 'the app has one room on the main thread')
  assert.equal(made[0]?.crosses, false)
  assert.equal(await app.call('keep', { what: 'one' }, { as: nobody }), 'one')
  const change = asked.find((one) => one.answer === 'one')
  assert.ok(change, 'the change was called through the room')
  assert.equal(change.handed[0], Reflect.get(globalThis, 'seamHanded'), 'the run of the change sees the very record')
  await app.call('keptRecord', {}, { as: nobody })
  const query = asked.find((one) => one.answer === Reflect.get(globalThis, 'seamAnswer'))
  assert.ok(query, 'the engine is handed the very record that the query answered')
  assert.deepEqual(
    asked.map((one) => one.call),
    asked.map(() => 0),
    'no call through the room of the program is numbered',
  )
})
