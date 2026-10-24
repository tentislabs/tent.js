import assert from 'node:assert/strict'
import fs, { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { gated, got, noted } from './gates.ts'
import { copyOf } from './projects.ts'
import { wholeOf } from './sieges.ts'

/** The files of a bundle that a browser is served, and those it is never served, as the description names them. */
function filesOf(description: object): { served: string[]; closed: string[] } {
  const browser = Object(Reflect.get(description, 'browser'))
  const server = Object(Reflect.get(description, 'server'))
  const assets = Object.values(Object(Reflect.get(description, 'assets'))).map((one) => String(Object(one).file))
  return {
    served: [String(browser.page.main), String(browser.screens.shownScreen[0]), ...assets],
    closed: [String(server.screens), ...Object.values(Object(server.views)).map(String)],
  }
}

test('[05-4.6] /_t/b/../description.json, the same with percent signs and with backslashes, and a file of server/ are not found, as a file that is not there', async (t) => {
  // On live data an answer says its code and its general sentence, so two answers that are one are one byte for byte.
  const gate = await gated(t, { open: { mode: 'live' } })
  const { served, closed } = filesOf(gate.app.description)
  for (const file of served) assert.equal((await got(gate, `/_t/b/${file}`)).status, 200, file)
  const missing = wholeOf(await got(gate, '/_t/b/browser/screens.nothing.0123456789ab.js'))
  assert.equal(missing.status, 404)
  // A browser that opens it on live data is shown the page of the engine that says so (43, section 5).
  assert.match(missing.text, /<h1>404<\/h1>/)

  const drive = resolve(gate.bundle)
  const real = served[0]
  const tries = [
    // The description, by every way a path climbs to it.
    '../description.json',
    '..%2Fdescription.json',
    '..%2fdescription.json',
    '%2e%2e/description.json',
    '%2E%2E%2Fdescription.json',
    '%252e%252e%252fdescription.json',
    '..\\description.json',
    '..%5Cdescription.json',
    '..%5cdescription.json',
    'browser/../description.json',
    'browser/..%2Fdescription.json',
    'browser\\..\\description.json',
    'browser%5C..%5Cdescription.json',
    'browser/%2e%2e/description.json',
    'browser/.%2e/description.json',
    'browser/..;/description.json',
    'browser/../../bundle/description.json',
    'assets/../description.json',
    'assets/..%2f..%2fbundle%2fdescription.json',
    `${real}/../../description.json`,
    `${real}%2F..%2F..%2Fdescription.json`,
    'browser//../description.json',
    'browser/./../description.json',
    'browser/..%00/description.json',
    'browser/..%0a/description.json',
    // The description, named as it is, and beside a name that is served.
    'description.json',
    '/description.json',
    './description.json',
    'DESCRIPTION.JSON',
    'description.json%00.js',
    'description.json%00browser/x.js',
    `description.json?${real}`,
    `description.json%3F${encodeURIComponent(real)}`,
    'description.json#browser/x.js',
    'description.json%23.js',
    'description.json.',
    'description.json%20',
    'description.json::$DATA',
    'description.schema.json',
    // The description by its whole path: with the drive, with the other slash, as an address of a file, of a server.
    drive.replaceAll('\\', '/') + '/description.json',
    `${drive}\\description.json`,
    encodeURIComponent(`${drive}\\description.json`),
    `/${drive.replaceAll('\\', '/')}/description.json`,
    `file:///${drive.replaceAll('\\', '/')}/description.json`,
    `\\\\?\\${drive}\\description.json`,
    `//localhost/${drive.replaceAll('\\', '/').replace(':', '$')}/description.json`,
    // A file of `server/`, and the data folder beside the bundle.
    ...closed,
    ...closed.map((file) => `browser/../${file}`),
    ...closed.map((file) => file.replace('server/', 'browser/..%2Fserver%2F')),
    ...closed.map((file) => file.replace('server/', 'browser\\..\\server\\')),
    ...closed.map((file) => file.replace('server/', 'SERVER/')),
    // A module of development has one name on both sides: under that name a browser is served its own module.
    ...closed
      .map((file) => file.replace('server/', 'browser/'))
      .filter((file) => !JSON.stringify(gate.app.description.browser).includes(`"${file}"`)),
    'server/',
    'server',
    '../data/engine.json',
    '..%2Fdata%2Fengine.json',
    '../data/data.db',
    '..\\data\\engine.json',
    // A name that is served, written another way: the file is found by its name, and never walked to.
    `${real}/`,
    `${real}%00`,
    `${real}.`,
    `${real}%20`,
    `${real}::$DATA`,
    real.toUpperCase(),
    real.replace('browser/', 'browser//'),
    real.replace('browser/', 'browser%5C'),
    real.replace('browser/', 'browser%2F%2E%2F'),
    real.replace('browser/', 'assets%2F..%2Fbrowser%2F'),
    'browser/',
    'browser',
    'assets/',
    '',
    '.',
    '..',
    '%2e',
    '%',
    '%zz',
    '%c0%ae%c0%ae/description.json',
    '%ff',
  ]
  for (const path of tries) {
    const answer = await got(gate, `/_t/b/${path}`)
    assert.deepEqual(wholeOf(answer), missing, path)
  }
  // And none of them was handed the description by another door: no answer held a text of it.
  assert.ok(!missing.text.includes('"functions"'))
  // Every other method is not found too, for a file that is served.
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const answer = await gate.app.request(new Request(`${gate.origin}/_t/b/${real}`, { method }))
    assert.equal(answer.status, 404, method)
  }
})

test('[05-4.6] the build of a project whose assets/ holds a link to a file outside the project, to a folder or to nothing ends with T9002, as a finding, and writes no bundle', async (t) => {
  // Each link, as the three systems make one. A link to a file needs a right that this user may lack on Windows:
  // where it cannot be made, the link to a folder and the link to nothing are what is held there.
  const links: Record<string, (project: string, outside: string) => void> = {
    'a link to a file outside the project': (project, outside) =>
      symlinkSync(join(outside, 'secret.txt'), join(project, 'assets', 'linked.txt'), 'file'),
    'a link to a folder': (project, outside) => symlinkSync(outside, join(project, 'assets', 'folder'), 'junction'),
    'a link to nothing': (project, outside) =>
      symlinkSync(join(outside, 'nothing-there'), join(project, 'assets', 'gone'), 'junction'),
  }
  const tried: string[] = []
  for (const [linked, link] of Object.entries(links)) {
    const project = copyOf(t, 'gate')
    const outside = join(project, '..', 'outside')
    mkdirSync(outside)
    writeFileSync(join(outside, 'secret.txt'), 'THE-TEXT-OF-A-FILE-OUTSIDE-THE-PROJECT\n')
    try {
      link(project, outside)
    } catch {
      continue
    }
    tried.push(linked)
    // The build answers: a link is a finding of it, and never an error of the runtime that it throws.
    const made = await buildProject(project, { for: 'dev', out: join(project, 'bundle') }).catch((error: unknown) => ({
      bundleFolder: 'thrown',
      findings: [{ level: 'error', code: `thrown: ${String(error).slice(0, 80)}` }],
    }))
    const codes = [...new Set(made.findings.filter((one) => one.level === 'error').map((one) => one.code))]
    assert.deepEqual([made.bundleFolder, codes], ['', ['T9002']], linked)
    // Nothing of what the link leads to was read into a bundle.
    const written = existsSync(join(project, 'bundle', 'assets'))
      ? readdirSync(join(project, 'bundle', 'assets'), { recursive: true }).map(String)
      : []
    for (const name of written.filter((one) => /\.txt$/.test(one)))
      assert.ok(
        !readFileSync(join(project, 'bundle', 'assets', name), 'utf8').includes('THE-TEXT-OF-A-FILE-OUTSIDE'),
        `${linked}: assets/${name} holds the file outside`,
      )
  }
  assert.ok(
    tried.includes('a link to a folder') || tried.includes('a link to a file outside the project'),
    tried.join(),
  )
})

test('[05-4.14] a file under /_t/b/ asked for with a made-up name of the right form, a thousand times, is not found each time, with nothing read from the disk', async (t) => {
  const gate = await gated(t, { open: { mode: 'live' } })
  await noted(gate, { title: 'Ann' })
  const { served } = filesOf(gate.app.description)
  // Every read of a file that the engine could make is counted, where its path lies in the folder of the test:
  // the bundle that was opened, and the data folder, where the engine keeps the versions of the app.
  const bundle = resolve(gate.bundle, '..').toLowerCase()
  let reads: string[] = []
  const counted = (holder: object, name: string): void => {
    const real: unknown = Reflect.get(holder, name)
    if (typeof real !== 'function') return
    const mocked = t.mock.method(Object(holder), name, function (this: unknown, ...given: unknown[]) {
      const path = typeof given[0] === 'string' || given[0] instanceof URL ? String(given[0]) : ''
      if (resolve(path).toLowerCase().startsWith(bundle)) reads.push(`${name} ${path.slice(bundle.length)}`)
      return Reflect.apply(real, this, given)
    })
    t.after(() => mocked.mock.restore())
  }
  for (const name of [
    'readFileSync',
    'readFile',
    'openSync',
    'open',
    'statSync',
    'stat',
    'lstatSync',
    'lstat',
    'existsSync',
    'accessSync',
    'access',
    'createReadStream',
    'readdirSync',
    'readdir',
    'realpathSync',
    'realpath',
    'openAsBlob',
  ])
    counted(fs, name)
  for (const name of ['readFile', 'open', 'stat', 'lstat', 'access', 'readdir', 'realpath']) counted(fs.promises, name)
  syncBuiltinESMExports()
  t.after(() => syncBuiltinESMExports())

  // The count sees a read: a file that is served is read from the disk the first time it is asked for, and once.
  // The main file of the page code is read alone; a module of development reads what it imports too, for its marks.
  assert.equal((await got(gate, `/_t/b/${served[0]}`)).status, 200)
  assert.equal(reads.length, 1, `the first asking reads the file: ${reads.join(', ')}`)
  assert.equal((await got(gate, `/_t/b/${served[0]}`)).status, 200)
  assert.equal(reads.length, 1, 'a second asking reads nothing')

  reads = []
  const missing = wholeOf(await got(gate, '/_t/b/browser/screens.nothing.0123456789ab.js'))
  const hex = (k: number): string => (0x100000000000 + k * 0x9e3779b97).toString(16).slice(-12)
  const stems = [
    'browser/screens.shownScreen',
    'browser/styles',
    'browser/page.dev',
    'browser/shared.vault',
    'assets/own',
  ]
  for (let k = 0; k < 1000; k++) {
    const ending = k % 5 === 1 ? 'css' : k % 5 === 4 ? 'txt' : 'js'
    const answer = await got(gate, `/_t/b/${stems[k % 5]}.${hex(k)}.${ending}`)
    assert.deepEqual(wholeOf(answer), missing, `the try ${k}`)
  }
  assert.deepEqual(reads, [], 'a made-up name reads nothing from the disk')
  // The app answers as before, and a file that is served is still served.
  assert.equal((await got(gate, '/')).status, 200)
  assert.equal((await got(gate, `/_t/b/${served[0]}`)).status, 200)
})
