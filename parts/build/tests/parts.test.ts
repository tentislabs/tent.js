import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../index.ts'
import { pageCode } from '../pageCode.ts'
import { copyOf } from './projects.ts'

const textOf = (file: string): string => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

// The parts of the page code, by the one list of them: the form of one file also holds `chat`.
const partNames = [
  'above',
  'agent',
  'exported',
  'form',
  'image',
  'inspect',
  'mic',
  'overlay',
  'posted',
  'scripts',
  'served',
  'tested',
  'values',
  'vitals',
]

test('[30-1] the page code ships its parts that only some screens draw as parts with names, in both of its forms, and the main file holds none of them', async () => {
  const { folder, page } = await pageCode()
  // The part of Fast Refresh lies in the form of development alone, and runs before the main file, which names it not.
  const named = (parts: Record<string, string>): string[] => Object.keys(parts).filter((one) => one !== 'refresh')
  assert.equal(Object.hasOwn(page.browser.parts, 'refresh'), false)
  assert.equal(typeof page.browserDev.parts.refresh, 'string')
  for (const form of [page.browser, page.browserDev]) {
    assert.deepEqual(named(form.parts).sort(), partNames, 'the parts of the page code')
    const main = textOf(join(folder, form.main))
    for (const [name, file] of Object.entries(form.parts)) {
      if (name === 'refresh') continue
      assert.ok(existsSync(join(folder, file)), file)
      assert.match(file, new RegExp(`^page\\.(dev\\.)?${name}\\.[0-9a-f]{12}\\.js$`))
      const text = textOf(join(folder, file))
      // A part reads what it shares with the main file from the main file, and the main file loads it by its name.
      assert.ok(text.includes(`./${form.main}`), `${name} names the main file`)
      assert.ok(main.includes(`./${file}`), `the main file names ${name}`)
    }
    // What a form says of a control it takes no field of is in the part of forms, and in no file that every page loads.
    assert.ok(textOf(join(folder, form.parts.form)).includes('takes no field'))
    assert.ok(!main.includes('takes no field'), 'the main file holds nothing of a form')
  }
  // The two forms are other files, with the same parts.
  assert.deepEqual(named(page.browser.parts).sort(), named(page.browserDev.parts).sort())
  assert.notEqual(page.browser.parts.form, page.browserDev.parts.form)
  // A server holds every part in its one file.
  assert.ok(textOf(join(folder, page.server)).includes('takes no field'))
})

test('[30-1] a bundle holds the parts of the page code, its description names them, and each view stores the parts it needs by the tags its file imports', async () => {
  const made = await buildProject(copyOf('parted', 'parted'), { for: 'release' })
  assert.deepEqual(made.findings, [])
  const browser: Record<string, unknown> = Object(made.description.browser)
  const parts: Record<string, string> = Object(Object(browser.page).parts)
  const { page } = await pageCode()
  assert.deepEqual(
    parts,
    Object.fromEntries(Object.entries(page.browser.parts).map(([name, file]) => [name, `browser/${file}`])),
  )
  for (const file of Object.values(parts)) assert.ok(existsSync(join(made.bundleFolder, file)), file)
  const needs = (name: string): unknown => Object(made.description.screens[name]).needs
  assert.deepEqual(needs('boardScreen'), ['image'])
  assert.equal(needs('wordsScreen'), undefined)
  // A form that another function of the file draws is read from the import of `Form`.
  assert.deepEqual(needs('sketchScreen'), ['form'])
  assert.deepEqual(Object(made.description.components.Mark).needs, ['image'])
})
