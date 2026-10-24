import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { copied, typed } from './typed.ts'

/** A screen that anyone may see, written into the copy of the project, with a line that only its source holds. */
const home = `import { screen } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  title: 'Home',
  // A view: its module is built from the screen file, and a development build keeps the source of it.
  view: () => {
    const word = ['sh', 'op'].join('')
    return <h1>{'The home of the ' + word}</h1>
  },
})

// a line that only the source of the screen file holds
`

/** The text of every file of a folder, joined. */
const textsIn = (folder: string): string =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((one) => one.isFile())
    .map((one) => readFileSync(join(one.parentPath, one.name), 'latin1'))
    .join('\n')

test('[32-13] tent export, made from tent dev, builds a release, has the engine that runs write it out, holds no source of a screen file and the page code in its small form, and drops the version again', async (t) => {
  const project = copied(t, 'export-running')
  writeFileSync(join(project, 'home.tsx'), home)
  const dev = await buildProject(project, { for: 'dev' })
  assert.deepEqual(dev.findings, [])
  // A development build keeps the source of what a browser loads, and so the line.
  assert.match(textsIn(join(dev.bundleFolder, 'browser')), /a line that only the source of the screen file holds/)
  const release = await buildProject(project, { for: 'release' })
  const main = (description: object): string => String(Object(Object(Reflect.get(description, 'browser')).page).main)
  const engine = createEngine({ port: 0 })
  try {
    const app = await engine.open(dev.bundleFolder, { dataFolder: join(project, '.tent'), mode: 'development' })
    const printed = await typed(project, 'export', '--out', 'site', '--origin', 'https://shop.example.com', '--json')
    assert.equal(printed.ended, 0, printed.printed)
    const value = Object(printed.answer.value)
    assert.ok(Array.isArray(value.pages) && value.pages.includes('/'), printed.printed)
    const site = join(project, 'site')
    assert.match(readFileSync(join(site, 'index.html'), 'utf8'), /The home of the shop/)
    assert.ok(existsSync(join(site, '_t', 'b', main(release.description))), 'the page code in its small form')
    assert.ok(!existsSync(join(site, '_t', 'b', main(dev.description))), 'and not the one of development')
    assert.doesNotMatch(textsIn(site), /a line that only the source of the screen file holds/)
    // The version that the export added is dropped again: the one of development alone runs.
    assert.deepEqual(
      app.versions().map((one) => one.running),
      [true],
    )
  } finally {
    await engine.close()
  }
})
