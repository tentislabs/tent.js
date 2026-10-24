import assert from 'node:assert/strict'
import { symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../index.ts'
import { copyOf, errorsOf, placesOf } from './projects.ts'

test('[05-10.43] a root that holds a link which leads further out is T1014, no bundle is written, and the same root without the link builds', async () => {
  const app = copyOf('outside/app', 'outside')
  const tree = join(app, '..')
  // The root is `../shared`, and what the project names lies behind a link of the root, in a folder that no root is.
  const rooted = await buildProject(join(tree, 'rooted'), { for: 'dev' })
  assert.deepEqual(errorsOf(rooted.findings), [])
  symlinkSync(join(tree, 'elsewhere'), join(tree, 'shared', 'far'), 'junction')
  const out = await buildProject(join(tree, 'rooted-link'), { for: 'dev' })
  assert.deepEqual(placesOf(out.findings, 'T1014'), ['functions/labels.ts:2'])
  assert.equal(out.bundleFolder, '')
})
