import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { browserFound } from '../shot/browserFound.ts'
import { firefoxFound, webkitFound } from '../shot/enginesFound.ts'

/** The version that the list of the fetched parts pins a part at. */
function pinned(name: string): string {
  const list: unknown = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fetched.json'), 'utf8'))
  const line = (Array.isArray(list) ? list : []).find((one) => Reflect.get(Object(one), 'name') === name)
  assert.ok(line, `fetched.json pins ${name}`)
  return String(Reflect.get(Object(line), 'version'))
}

/** Sets a variable of the environment for one test, as it was again when the test ends. */
function named(t: TestContext, name: string, value: string): void {
  const was = process.env[name]
  process.env[name] = value
  t.after(() => {
    if (was === undefined) delete process.env[name]
    else process.env[name] = was
  })
}

/** Whether a program is the build of the tool of tests at that version, or the part fetched at it. */
const ofBuild = (program: string, folder: string, part: string, version: string): boolean =>
  program.includes(`${folder}-${version}`) || program.includes(`${part}@${version}`)

test('[48-1] in the mode test the Chromium that is driven is the build of the pinned version that the tool of tests installs, whatever TENT_BROWSER names', async (t) => {
  // A program that is there and is no browser: were it taken, the test would see it.
  named(t, 'TENT_BROWSER', process.execPath)
  const program = await browserFound({ test: true })
  assert.notEqual(program, process.execPath)
  assert.ok(ofBuild(program, 'chromium_headless_shell', 'browser', pinned('browser')), program)
  // Outside the mode test, as `tent shot` drives it, the program it names still stands first.
  assert.equal(await browserFound(), process.execPath)
})

test('[48-1] in the mode test the Firefox that is driven is the build of the pinned version that the tool of tests installs, whatever TENT_FIREFOX names', async (t) => {
  named(t, 'TENT_FIREFOX', process.execPath)
  const program = await firefoxFound({ test: true })
  assert.notEqual(program, process.execPath)
  assert.ok(ofBuild(program, 'firefox', 'firefox', pinned('firefox')), program)
  assert.equal(await firefoxFound(), process.execPath)
})

test('[48-1] in the mode test no WebKit of the computer is driven: with no pinned WebKit that speaks WebDriver BiDi, none is found and a test in it is not run, whatever TENT_WEBKIT names', async (t) => {
  named(t, 'TENT_WEBKIT', process.execPath)
  assert.equal(await webkitFound({ test: true }), undefined)
  // Outside the mode test the program it names still stands first.
  assert.equal(await webkitFound(), process.execPath)
})
