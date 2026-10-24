import assert from 'node:assert/strict'
import { test } from 'node:test'
import { logRows } from './apps.ts'
import { workMoment } from './workUse.ts'
import { joiningKeys, readyWorker, writerOf } from './workLink.ts'

test("[51-2] a line that a worker tells under no task, as a version it could not take away, is written to the writer's log as the worker's own", async (t) => {
  const { app, dataFolder } = await writerOf(t)
  const worker = await readyWorker(app, joiningKeys.free)
  const message = 'A version that the writer lists no more was not taken away: EBUSY'
  worker.send({ t: 'log', lines: [{ at: 1, level: 'warn', message }] })
  await workMoment(100)
  assert.equal(
    worker.heard.some((one) => one.t === 'refused' && one.what === 'log'),
    false,
    'the line is not refused',
  )
  const lines = logRows(dataFolder, 'lines').filter((one) => one.message === message)
  assert.equal(lines.length, 1)
  assert.equal(lines[0]?.level, 'warn')
  assert.ok(typeof Object(JSON.parse(String(lines[0]?.data))).worker === 'string', String(lines[0]?.data))
  worker.close()
})
