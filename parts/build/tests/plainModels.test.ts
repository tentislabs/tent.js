import assert from 'node:assert/strict'
import test from 'node:test'
import { buildProject } from '../index.ts'
import { copyOf } from './projects.ts'

test('[26-7] a model over a service call, with a job, is read, and runs nothing of the project', async () => {
  const made = await buildProject(copyOf('reader/models', 'models'), { for: 'release' })
  assert.deepEqual(made.findings, [])
  assert.equal(made.description.server, undefined, 'a project of plain definitions has no module')
  const { painter } = made.description.models
  assert.deepEqual(painter.call, { service: 'decisions', call: 'paint' })
  assert.deepEqual(Reflect.get(Object(painter.job), 'check'), { service: 'decisions', call: 'status' })
})
