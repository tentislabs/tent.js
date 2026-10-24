import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { readPng } from '../../../rig/png.ts'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { copied, typed } from './typed.ts'

/** A screen that anyone may see, whose style file changes the background of the page for a dark device. */
const home = `import { screen } from 'tentjs/ui'
import './home.css'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  view: () => <div className="home" />,
})
`

/** The style of the page: white, and near black where the device asks for dark. */
const style =
  'body { margin: 0; background: #ffffff }\n.home { height: 400px }\n@media (prefers-color-scheme: dark) { body { background: #0f1115 } }\n'

/** The first pixel of the picture that a shot wrote, as its red, green and blue. */
function firstPixel(answer: Record<string, unknown>): number[] {
  const value = Object(answer.value)
  return [...readPng(new Uint8Array(readFileSync(String(value.file)))).pixels.slice(0, 3)]
}

test('[32-12] tent shot --dark asks the page for the dark set of the device', async (t) => {
  const project = copied(t, 'shot-dark')
  writeFileSync(join(project, 'home.tsx'), home)
  writeFileSync(join(project, 'home.css'), style)
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(built.findings, [])
  const engine = createEngine({ port: 0 })
  try {
    await engine.open(built.bundleFolder, { dataFolder: join(project, '.tent'), mode: 'test' })
    const light = await typed(project, 'shot', '/', '--size', '64x64', '--json')
    assert.equal(light.ended, 0, light.printed)
    assert.deepEqual(firstPixel(light.answer), [255, 255, 255])
    const dark = await typed(project, 'shot', '/', '--size', '64x64', '--dark', '--json')
    assert.equal(dark.ended, 0, dark.printed)
    assert.deepEqual(firstPixel(dark.answer), [15, 17, 21])
  } finally {
    await engine.close()
  }
})

test('[32-12] on live data tent shot takes a picture as nobody, tent shot takes no --as, and app.shot as a user is T0013 there', async (t) => {
  const project = copied(t, 'shot-live')
  writeFileSync(join(project, 'home.tsx'), home)
  writeFileSync(join(project, 'home.css'), style)
  const built = await buildProject(project, { for: 'release' })
  assert.deepEqual(built.findings, [])
  const engine = createEngine({ port: 0 })
  try {
    const app = await engine.open(built.bundleFolder, { dataFolder: join(project, '.tent'), mode: 'live' })
    const made: unknown[] = Object(
      await app.write([{ add: 'users', values: { name: 'Cem', roles: [] } }], { as: 'system' }),
    )
    const id = String(Object(made[0]).id)
    const nobody = await typed(project, 'shot', '/', '--size', '64x64', '--json')
    assert.equal(nobody.ended, 0, nobody.printed)
    const as = await typed(project, 'shot', '/', '--as', id, '--json')
    assert.notEqual(as.ended, 0)
    assert.equal(Object(Object(as.answer).findings?.[0]).message, 'tent shot takes no --as.', as.printed)
    // A program that holds the app on live data takes no picture as a user either.
    await assert.rejects(app.shot('/', { as: id, size: { width: 64, height: 64 } }), { code: 'T0013' })
  } finally {
    await engine.close()
  }
})
