import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildProject } from '../index.ts'
import { copyOf, errorsOf } from './projects.ts'

test('[12-3@10f] a word that is imported under another name is read by that name: a body that waits for an event in a flow that an event starts stays plain', async () => {
  const made = await buildProject(copyOf('renamedWord', 'renamedWord'), { for: 'dev' })
  assert.deepEqual(errorsOf(made.findings), [])
  const watch = made.description.flows.deliveryWatch
  assert.equal(watch.form, 'plain')
  assert.ok(watch.body, 'it is stored with its body')
})
