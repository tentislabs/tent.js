import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { readPng } from '../../../rig/png.ts'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { copied, typed } from './typed.ts'

/** A screen that anyone may see, written into the copy of the project. */
const home = `import { screen } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  view: () => <div style={{ position: 'fixed', inset: 0, background: '#ff0000' }} />,
})
`

test('[32-12] tent shot asks the engine that runs, writes the picture into shots/ and prints where it lies; with none running it starts none', async (t) => {
  const project = copied(t, 'shot-running')
  writeFileSync(join(project, 'home.tsx'), home)
  const none = await typed(project, 'shot', '/', '--json')
  assert.notEqual(none.ended, 0)
  assert.equal(Object(Object(none.answer).findings?.[0]).code, 'T0013', none.printed)

  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(built.findings, [])
  const engine = createEngine({ port: 0 })
  try {
    await engine.open(built.bundleFolder, { dataFolder: join(project, '.tent'), mode: 'test' })
    const printed = await typed(project, 'shot', '/', '--size', '320x200', '--json')
    assert.equal(printed.ended, 0, printed.printed)
    const value = Object(printed.answer.value)
    assert.ok(String(value.file).startsWith(join(project, '.tent', 'shots')), printed.printed)
    assert.deepEqual([value.width, value.height, value.status], [320, 200, 200])
    const { width, height, pixels } = readPng(new Uint8Array(readFileSync(String(value.file))))
    assert.deepEqual([width, height, [...pixels.slice(0, 3)]], [320, 200, [255, 0, 0]])
  } finally {
    await engine.close()
  }
})
