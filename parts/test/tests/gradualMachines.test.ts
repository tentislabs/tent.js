import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Caller } from '../../core/index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'
import { untilWithin } from './remotes.ts'

/** A caller of the test by its number: a signed-in user whose id the release reads. */
const user = (n: number): Caller => ({ kind: 'user', user: { id: `u${String(n).padStart(4, '0')}`, roles: [] } })

test('[44-3] a person stays on one version through a release on two machines: the writer decides, and its reader follows its word', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'gradual') })
  closing(t, () => app.close())
  const reader = await app.reader()
  // The second version answers otherwise, and is made loadable beside the first.
  const next = copyOf(t, 'gradual')
  const file = join(next, 'functions.ts')
  writeFileSync(file, readFileSync(file, 'utf8').replace("run: () => 'one'", "run: () => 'two'"))
  const made = await buildProject(next, { for: 'dev', out: join(next, 'bundle') })
  const version = await app.add(made.bundleFolder)
  await app.switch(version, { gradual: {} })
  await untilWithin('the reader holds the new version and its share', () =>
    reader.versions().some((one) => one.id === version && Reflect.get(one, 'share') === 0.5),
  )
  const answers: unknown[] = []
  for (let n = 0; n < 60; n++) {
    const here = await app.call('which', {}, { as: user(n) })
    assert.equal(await reader.call('which', {}, { as: user(n) }), here, `the caller u${n}`)
    answers.push(here)
  }
  assert.ok(answers.includes('one') && answers.includes('two'), 'the release gives each version a share')
})
