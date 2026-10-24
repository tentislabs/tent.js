import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import type { Description } from '../../core/internal.ts'
import { checkDescription, descriptionShape, fingerprintOf, toJsonSchema } from '../../core/internal.ts'
import { buildProject } from '../index.ts'
import { pageCode } from '../pageCode.ts'
import { copyOf, errorsOf, filesOf, lying } from './projects.ts'
import { misfits } from './schema.ts'

const textOf = (file: string): string => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

/** A text with the fingerprint of each file of the page code taken out of its name: the page code is one for every project. */
const steady = (text: string): string =>
  text.replace(/((?:browser|server)\/page\.[a-z.-]*?)[0-9a-f]{12}\.js/g, '$1<fp>.js')

/** Whether a file of a bundle is a file of the page code. */
const ofPage = (path: string): boolean => /^(browser|server)\/page\./.test(path)

const orders = [
  {
    id: 'a',
    name: 'Ann',
    total: 1999,
    rush: true,
    status: 'open',
    note: 'Ring twice',
    customer: { id: 'c1', name: 'Acme' },
  },
  { id: 'b', name: 'Bo', total: 5, rush: false, status: 'paid' },
]

/** What draws the screens of a bundle: the server file of its page code, told the folder of its modules. */
async function drawerOf(bundleFolder: string, description: Description) {
  const server = Object(description.server)
  const page = await import(pathToFileURL(join(bundleFolder, server.screens)).href)
  page.findPageCode(join(bundleFolder, 'server'))
  const views: Record<string, object> = {}
  for (const [name, file] of Object.entries(Object(server.views)))
    views[name] = (await import(pathToFileURL(join(bundleFolder, String(file))).href)).default
  return (screen: string, more: object = {}): Promise<{ html?: string; answers: object[] }> =>
    page.draw({
      description,
      page: {
        version: 'v1',
        mode: 'test',
        status: 200,
        screen,
        origin: 'http://localhost:3000',
        path: Object(description.screens[screen]).path,
        params: {},
        state: {},
        language: 'en',
        languages: ['en'],
        currency: 'USD',
        user: null,
        settings: {},
        zone: 'UTC',
        framedBy: null,
        load: {
          screen: Object(description.browser).screens[screen][0],
          parts: [],
          styles: Object(description.browser).screens[screen].slice(1),
          error: '',
        },
        answers: [],
        ...more,
      },
      read: (what: string, input: unknown, o: object) => ({ what, input, ...o, value: orders }),
      views,
      picture: () => undefined,
    })
}

/** The drawing of a document, with each name that React makes for an element written as one. */
function drawingOf(html: string | undefined): string {
  const found = /<div id="tent">([\s\S]*)<\/div>\n<script type="application\/json" id="tent-page">/.exec(html ?? '')
  assert.ok(found, 'the document holds a drawing')
  return found[1].replace(/_R_[a-zA-Z0-9]+_/g, 'ID')
}

test('[31-14] two builds by one release hold the same files of the page code, and a development build and a release build hold its two forms', async () => {
  const { page } = await pageCode()
  assert.equal(page.format, 'tent.page/1')
  assert.match(page.fingerprint, /^[0-9a-f]{64}$/)
  const pageFiles = (bundleFolder: string) =>
    Object.fromEntries(Object.entries(filesOf(bundleFolder)).filter(([path]) => ofPage(path)))
  const first = await buildProject(copyOf('screens', 'page-first'), { for: 'release' })
  const second = await buildProject(copyOf('elements', 'page-second'), { for: 'release' })
  const dev = await buildProject(copyOf('screens', 'page-dev'), { for: 'dev' })
  assert.deepEqual(pageFiles(second.bundleFolder), pageFiles(first.bundleFolder))
  // The description names them as `page.json` does: the small form in a release, and the development form with `for: 'dev'`.
  const named = (description: Description) => Object(Object(description.browser).page)
  assert.deepEqual(named(first.description), {
    main: `browser/${page.browser.main}`,
    names: Object.fromEntries(Object.entries(page.browser.names).map(([name, file]) => [name, `browser/${file}`])),
    // The parts of the page code, which a page loads where a screen needs one, are named the same way.
    parts: Object.fromEntries(Object.entries(page.browser.parts).map(([name, file]) => [name, `browser/${file}`])),
  })
  assert.equal(named(dev.description).main, `browser/${page.browserDev.main}`)
  assert.notEqual(page.browserDev.main, page.browser.main)
  assert.deepEqual(Object.keys(page.browserDev.names), Object.keys(page.browser.names))
  // Both forms give the same names with the same meaning. A release draws on the server with the small file, and
  // development with the file of React of development, which tells the tags that drew a view that failed.
  assert.equal(Object(first.description.server).screens, `server/${page.server.replace('page.server.', 'page.')}`)
  assert.equal(
    Object(dev.description.server).screens,
    `server/${page.serverDev.replace('page.server.dev.', 'page.dev.')}`,
  )
  const small = readFileSync(join(first.bundleFolder, named(first.description).main), 'utf8')
  const whole = readFileSync(join(dev.bundleFolder, named(dev.description).main), 'utf8')
  assert.ok(small.length * 2 < whole.length, 'the small form is made small')
  // The main file of each form is a module that the runtime reads whole, and gives the six names for the small files.
  for (const file of [
    join(first.bundleFolder, named(first.description).main),
    join(dev.bundleFolder, named(dev.description).main),
  ]) {
    const main = await import(pathToFileURL(file).href)
    assert.deepEqual(Object.keys(main.names).sort(), Object.keys(page.browser.names).sort())
    assert.equal(typeof main.names['tentjs/ui'].Link, 'function')
  }
  const exportsOf = (text: string) => [...text.matchAll(/export const (\w+)/g)].map((found) => found[1])
  for (const name of Object.keys(page.browser.names)) {
    const one = readFileSync(join(first.bundleFolder, named(first.description).names[name]), 'utf8')
    const other = readFileSync(join(dev.bundleFolder, named(dev.description).names[name]), 'utf8')
    assert.ok(one.startsWith(`import { names } from "./${page.browser.main}"`), name)
    assert.ok(other.startsWith(`import { names } from "./${page.browserDev.main}"`), name)
    assert.deepEqual(exportsOf(one), exportsOf(other), name)
  }
  assert.ok(
    exportsOf(readFileSync(join(first.bundleFolder, named(first.description).names['tentjs/ui']), 'utf8')).includes(
      'Link',
    ),
  )
  assert.ok(
    exportsOf(readFileSync(join(first.bundleFolder, named(first.description).names.react), 'utf8')).includes(
      'useState',
    ),
  )
})

test('[31-14] a page with a package that imports react and react-dom, and one that asks for react by require, holds React once, on the server and in the browser', async () => {
  const folder = copyOf('react-once', 'react-once')
  const pack = (name: string, main: string, text: string, type: string) => {
    mkdirSync(join(folder, 'node_modules', name), { recursive: true })
    writeFileSync(join(folder, 'node_modules', name, 'package.json'), JSON.stringify({ name, type, main }))
    writeFileSync(join(folder, 'node_modules', name, main), text)
  }
  pack(
    'has-react',
    'index.js',
    [
      "import { createElement, useState } from 'react'",
      "import * as dom from 'react-dom'",
      'export const hookOf = () => useState',
      "export function Counted() { const [count] = useState(3); return createElement('i', null, 'counted ' + count + ' ' + typeof dom.createPortal) }",
      '',
    ].join('\n'),
    'module',
  )
  pack(
    'asks-react',
    'index.cjs',
    "const React = require('react')\nexports.required = () => React.useState\n",
    'commonjs',
  )
  const made = await buildProject(folder, { for: 'release' })
  assert.deepEqual(errorsOf(made.findings), [])
  // On the server the view, both packages and the page code hold one React: a hook of the package works in the draw.
  const draw = await drawerOf(made.bundleFolder, made.description)
  const drawing = drawingOf((await draw('onceScreen')).html)
  assert.equal(drawing, '<div><span>true</span><span>true</span><i>counted 3 function</i></div>')
  // In the browser every module of the screen asks the small files of the page code for React, and holds none of its own.
  const browser = Object(made.description.browser)
  const files = [...browser.screens.onceScreen, ...(browser.shared ?? [])].filter((file: string) =>
    file.endsWith('.js'),
  )
  const code = files.map((file: string) => readFileSync(join(made.bundleFolder, file), 'utf8')).join('\n')
  for (const name of ['react', 'react-dom', 'tentjs/ui', 'react/jsx-runtime'])
    assert.ok(
      code.includes(`"./${browser.page.names[name].slice('browser/'.length)}"`),
      `the screen imports ${name} from its small file`,
    )
  assert.ok(!/\brequire\(/.test(code), 'no module keeps a call of `require`, which a browser cannot answer')
  assert.ok(code.length < 4000, `the modules of the screen hold no React of their own: ${code.length} characters`)
  assert.ok(
    !/from\s*"(react|react-dom|tentjs\/ui)[/"]/.test(code),
    'no name of the page code is left as it was written',
  )
})

test('[13-1@5] the description of a project with screens passes the shape of the format and the schema that the build writes from it', async () => {
  for (const [name, kind] of [
    ['screens', 'release'],
    ['screens', 'dev'],
    ['elements', 'release'],
    ['stubs', 'dev'],
  ] as const) {
    const folder = copyOf(name, `shape-${name}-${kind}`)
    if (name === 'stubs') {
      mkdirSync(join(folder, 'node_modules', 'relay-package'), { recursive: true })
      writeFileSync(
        join(folder, 'node_modules', 'relay-package', 'package.json'),
        '{ "name": "relay-package", "type": "module", "main": "index.js" }\n',
      )
      writeFileSync(
        join(folder, 'node_modules', 'relay-package', 'index.js'),
        "export { openOrders, markPaid } from '../../functions/orders.ts'\n",
      )
    }
    const made = await buildProject(folder, { for: kind })
    assert.deepEqual(errorsOf(made.findings), [], name)
    const description: unknown = JSON.parse(readFileSync(join(made.bundleFolder, 'description.json'), 'utf8'))
    const schema: unknown = JSON.parse(readFileSync(join(made.bundleFolder, 'description.schema.json'), 'utf8'))
    assert.deepEqual(schema, JSON.parse(JSON.stringify(toJsonSchema(descriptionShape))))
    assert.deepEqual(checkDescription(description), [], `${name} passes the shape`)
    assert.deepEqual(misfits(schema, description), [], `${name} passes the schema`)
    // Both refuse one field more on a screen and in what was built for a browser.
    const screens = Object(description).screens
    const [first] = Object.keys(screens)
    for (const more of [
      { ...Object(description), screens: { ...screens, [first]: { ...screens[first], colour: 'red' } } },
      { ...Object(description), browser: { ...Object(description).browser, colour: 'red' } },
    ]) {
      assert.equal(checkDescription(more).length, 1, `${name}, with a field more, fails the shape`)
      assert.equal(misfits(schema, more).length, 1, `${name}, with a field more, fails the schema`)
    }
  }
})

test('[13-2@5] the project of the screen example gives exactly the stored description, byte for byte', async () => {
  const stored = join(lying('expected'), 'screens.description.json')
  const made = await buildProject(copyOf('screens', 'screens-bytes'), { for: 'release' })
  const bytes = readFileSync(join(made.bundleFolder, 'description.json'))
  // The names of the files of the page code hold fingerprints of the framework's own code, and are held steady.
  assert.equal(steady(bytes.toString('utf8')), readFileSync(stored, 'utf8').replace(/\r\n/g, '\n'))
  assert.ok(!bytes.includes('\r'), 'the description is written with line feeds')
  assert.equal(bytes.at(-1), 10)
  assert.notEqual(bytes.at(-2), 10, 'the text ends with one line feed')
})

test('[13-4@5] two builds of one project with screens give the same bytes on every system', async () => {
  // The bytes of every file that the build made of the project are held against a stored fingerprint, so Windows
  // and Linux must agree: the modules that the builder made, and the style file.
  // A module of a view names the small files of the page code, whose names change with every change of it, and so
  // its own name does: each fingerprint in a name is held steady, in the paths and in the texts, and no other byte.
  const masked = (text: string): string => text.replace(/\.[0-9a-f]{12}\.(js|css)/g, '.<fp>.$1')
  for (const name of ['screens', 'elements'] as const) {
    const made = await buildProject(copyOf(name, `bytes-${name}`), { for: 'release' })
    assert.deepEqual(errorsOf(made.findings), [], name)
    const prints: Record<string, string> = {}
    for (const [path, hex] of Object.entries(filesOf(made.bundleFolder))) {
      if (ofPage(path)) continue
      const text = masked(Buffer.from(hex, 'hex').toString('utf8'))
      prints[masked(path)] = fingerprintOf(new TextEncoder().encode(text)).slice(0, 12)
    }
    assert.deepEqual(prints, JSON.parse(textOf(join(lying('expected'), `${name}.files.json`))), name)
  }
})

test('[31-4] the two built-in screens, tent.notFound and tent.error, are views of the page code: page.json names none of them, and the server file draws their words', async () => {
  const { folder, page } = await pageCode()
  assert.equal(Object.hasOwn(page, 'screens'), false)
  const { draw } = await import(pathToFileURL(join(folder, page.server)).href)
  const { description } = await buildProject(copyOf('screens', 'page-built-in'), { for: 'dev' })
  const drawn = await draw({
    description,
    page: {
      version: 'v',
      mode: 'test',
      status: 404,
      screen: 'tent.notFound',
      origin: 'http://localhost',
      path: '/x',
      params: {},
      state: {},
      language: 'en',
      languages: ['en'],
      user: null,
      settings: {},
      zone: 'UTC',
      framedBy: null,
      load: { screen: '', parts: [], styles: [], error: '' },
      answers: [],
    },
    read: (what: string, input: unknown) => ({ what, input }),
    views: {},
    picture: () => undefined,
  })
  assert.match(String(drawn.html), /<h1[^>]*>404<\/h1><h2[^>]*>This page could not be found\.<\/h2>/)
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(join(folder, 'page.json'), 'utf8')), 'screens'), false)
})
