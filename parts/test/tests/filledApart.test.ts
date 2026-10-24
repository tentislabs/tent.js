import assert from 'node:assert/strict'
import test from 'node:test'
import { appIn, listed } from './desks.ts'
import { copyOf } from './projects.ts'

const system = { as: 'system' } as const
const moment = (ms = 20): Promise<void> => new Promise((done) => setTimeout(done, ms))

test('[51-12] in a tenant table, a value of a closed file is made once its fillAt has come', async (t) => {
  const { app, dataFolder } = await appIn(t, copyOf(t, 'fillingApart'))
  const made = await app.write([{ add: 'teams', values: { name: 'North' } }], system)
  const team = String(Reflect.get(Object(Array.isArray(made) ? made[0] : made), 'id'))
  await app.write([{ add: 'tasks', of: team, values: { team, title: 'Plan', note: 'the week' } }], system)
  // A minute and a half later the file was closed, with its value still due.
  for (let i = 0; i < 90; i++) {
    app.clock.advance('1 second')
    await moment(5)
  }
  const closed = (await listed(app, dataFolder)).files.find((one) => one.id === team)
  assert.equal(closed?.open, false, 'the file of the team was closed')
  // Nothing reads the file meanwhile: the pass opens it when its fillAt has come.
  for (let i = 0; i < 60; i++) {
    app.clock.advance('1 second')
    await moment(5)
  }
  await moment(200)
  const [task] = await app.rows('tasks', { of: team })
  assert.equal(task?.summary, 'Plan: the week', 'the value of the closed file was not made at its fillAt')
})
