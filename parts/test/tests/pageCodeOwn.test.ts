import assert from 'node:assert/strict'
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { served } from './served.ts'

// The server file of the page code is the framework's own: an engine loads it once for every version that holds it,
// from a folder of its own, so a version that goes, or whose file cannot be read, takes it from no other version.

test("[21-17] a version whose page code cannot be loaded leaves every other version drawing its pages: the server file of the page code is loaded once, from the engine's own folder, and a load that failed is not kept", async (t) => {
  const { app, bundleFolder, dataFolder } = await served('laidOut')
  // The same project with another word on its home screen: another version, with the same page code.
  const project = dirname(dirname(dirname(bundleFolder)))
  const other = `${project}-other`
  cpSync(project, other, { recursive: true, filter: (from) => !from.startsWith(join(project, '.tent')) })
  t.after(() => rmSync(other, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const screens = join(other, 'screens.tsx')
  writeFileSync(screens, readFileSync(screens, 'utf8').replace('<h1>Home</h1>', '<h1>Home again</h1>'))
  const made = await buildProject(other, { for: 'release' })
  assert.deepEqual(made.findings, [])
  const version = await app.add(made.bundleFolder)
  // The copy of the second version loses its page code before it draws its first page, as a version that is dropped
  // while that page is drawn.
  const server = join(dataFolder, 'versions', version, 'server')
  const pageCode = readdirSync(server).filter((one) => /^page\.[0-9a-f]+\.js$/.test(one))
  assert.equal(pageCode.length, 1, 'the second version holds the server file of the page code')
  for (const one of pageCode) rmSync(join(server, one))
  await assert.rejects(app.export(join(other, 'site'), { version }))
  // The version that runs draws its pages, with the page code it holds.
  const page = await app.page('/')
  assert.equal(page.status, 200, page.html.slice(0, 400))
  assert.match(page.html, /<h1>Home<\/h1>/)
})
