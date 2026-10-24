import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { Room, RoomInput } from '../../engine/index.ts'
import { apartRoom, createEngine } from '../../engine/index.ts'
import { sharedPython } from './pythonApps.ts'

const shared = sharedPython('room')

test('[52-2] in the test room a python is started through the room, which counts it among the programs it started, and its call answers as in the program', async (t) => {
  const programs: string[] = []
  // The test room, as a program makes it, counting each program it starts.
  const counting = (input: RoomInput): Room => {
    const room = apartRoom(input)
    const { program } = room
    return Object.assign(room, {
      program: (start: Parameters<Room['program']>[0]) => {
        programs.push(start.for)
        return program(start)
      },
    })
  }
  const dataFolder = mkdtempSync(join(shared.home, '..', 'data-'))
  const engine = createEngine({ port: 0, makers: { room: counting } })
  t.after(() => engine.close())
  const app = await engine.open(shared.bundle, { dataFolder, mode: 'development' })
  const row: unknown = await app.write([{ add: 'users', values: { name: 'Ada', roles: [] } }], { as: 'system' })
  const id = String(Reflect.get(Object(Array.isArray(row) ? row[0] : row), 'id'))
  const ada: Caller = { kind: 'user', user: { id, roles: [] } }
  assert.equal(await app.call('prints', {}, { as: ada }), 7)
  assert.ok(programs.includes('python'), `the room started the python: ${programs.join(', ')}`)
})
