import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { root, typed } from './typed.ts'

// A project with three packages of its own, laid in its `node_modules/` as an install lays them: one that draws in a
// screen, one that both a screen and a function use, and one that a function reaches the network with.
const files: Record<string, string> = {
  'tent.ts': `import { project } from 'tentjs'

export const mapped = project('mapped', { title: 'Mapped' })
`,
  'functions/sales.ts': `import { action, anyone, change, input, number, query, table, text } from 'tentjs'
import { monthName } from 'month-words'
import { fetchJson } from 'net-reader'

const open = anyone('the sales are shown to every visitor')

export const sales = table('sales', {
  columns: { month: number(), amount: number() },
  access: { read: open, add: open },
})

export const allSales = query('allSales', { access: open, rows: sales.oldest('createdAt').limit(12) })

export const addSale = change('addSale', {
  access: open,
  input: { month: number(), amount: number() },
  set: sales.add({ month: input('month'), amount: input('amount') }),
})

export const saleWords = action('saleWords', {
  access: open,
  input: { month: number() },
  output: text(),
  run: async ({ input }) => \`\${monthName(input.month)} \${JSON.stringify(await fetchJson('http://127.0.0.1:9/'))}\`,
})
`,
  'screens/home.tsx': `import { read, screen, Form } from 'tentjs/ui'
import { BarLine } from 'tiny-bars'
import { monthName } from 'month-words'
import { addSale, allSales } from '../functions/sales'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  data: { sales: read(allSales) },
  view: ({ sales }) => (
    <main>
      {sales.map((one) => (
        <BarLine key={one.id} label={monthName(one.month)} value={one.amount} />
      ))}
      <Form call={addSale} with={{ month: 1, amount: 10 }}><button type="submit">
        Add
      </button></Form>
    </main>
  ),
})
`,
  'node_modules/tiny-bars/package.json': JSON.stringify({
    name: 'tiny-bars',
    version: '1.0.0',
    type: 'module',
    exports: './index.js',
  }),
  'node_modules/tiny-bars/index.js': `import { createElement } from 'react'

// A bar of a chart, long enough that its bytes are told apart from those of the other packages.
export function BarLine({ label, value }) {
  return createElement('div', { className: 'bar' }, label, ' ', createElement('span', { style: { width: value } }))
}
`,
  'node_modules/month-words/package.json': JSON.stringify({
    name: 'month-words',
    version: '1.0.0',
    type: 'module',
    exports: './index.js',
  }),
  'node_modules/month-words/index.js': `const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function monthName(month) {
  return names[(month - 1) % 12] ?? 'none'
}
`,
  'node_modules/net-reader/package.json': JSON.stringify({
    name: 'net-reader',
    version: '1.0.0',
    type: 'module',
    exports: './index.js',
  }),
  'node_modules/net-reader/index.js': `import { request } from 'node:http'

export function fetchJson(address) {
  return new Promise((done) => {
    const asked = request(address, (answer) => done(answer.statusCode))
    asked.on('error', () => done(0))
    asked.end()
  })
}
`,
}

/** Lays the project into an empty folder of the test under `results/`, removed when the test ends. */
function laid(t: TestContext): string {
  const folder = join(root, 'results', 'cli', 'mapped')
  const remove = (): void => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  remove()
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  t.after(remove)
  return folder
}

test('[43-4] the map lists each package the project imports, with where it is used, whether it reaches the browser, its bytes in the page and its ways out; and each screen with its address, its access, its queries, its calls and its components with their packages', async (t) => {
  const folder = laid(t)
  const map = await typed(folder, 'map')
  assert.equal(map.ended, 0, map.printed)
  const text = map.printed
  const block = (title: string): string[] => {
    const lines = text.split('\n')
    const from = lines.indexOf(title)
    assert.ok(from >= 0, `the map has ${title}:\n${text}`)
    const rest = lines.slice(from + 1)
    const to = rest.findIndex((line) => !line.startsWith('  '))
    return to < 0 ? rest : rest.slice(0, to)
  }
  const packages = block('packages')
  const line = (name: string): string => {
    const found = packages.find((one) => one.startsWith(`  ${name}:`))
    assert.ok(found, `the map lists ${name}:\n${packages.join('\n')}`)
    return found
  }
  // Where each is used, whether it reaches the browser with its bytes in the page, and its ways out.
  assert.match(line('tiny-bars'), /screens homeScreen/)
  assert.match(line('tiny-bars'), /browser \d+ bytes/)
  assert.doesNotMatch(line('tiny-bars'), /reaches/)
  assert.match(line('month-words'), /screens homeScreen/)
  assert.match(line('month-words'), /backend functions\/sales\.ts/)
  assert.match(line('month-words'), /browser \d+ bytes/)
  assert.match(line('net-reader'), /backend functions\/sales\.ts/)
  assert.doesNotMatch(line('net-reader'), /browser/)
  assert.match(line('net-reader'), /reaches net/)
  const bytes = (name: string): number => Number(/browser (\d+) bytes/.exec(line(name))?.[1])
  assert.ok(bytes('tiny-bars') > 0 && bytes('month-words') > 0)
  assert.notEqual(bytes('tiny-bars'), bytes('month-words'))

  // Each screen: its address and access, the queries of its data, the functions it calls, its components with their packages.
  const screens = block('screens').join('\n')
  assert.match(screens, /homeScreen: \/, anyone/)
  assert.match(screens, /data: sales from allSales/)
  assert.match(screens, /calls: addSale/)
  assert.match(screens, /components: BarLine of tiny-bars$/m)

  // The same with --json, as the description holds it.
  const json = await typed(folder, 'map', '--json')
  assert.equal(json.ended, 0, json.printed)
  assert.equal(Object(json.answer).value, text.endsWith('\n') ? text : `${text}\n`)
})

test('[43-4] the map gives the bytes in the page of each screen module and each style file, and tent build tells the bytes in the page of each package of the project', async (t) => {
  const folder = laid(t)
  const built = await typed(folder, 'build', '--json')
  assert.equal(built.ended, 0, built.printed)
  const value: unknown = Object(built.answer).value
  const bundle = String(Object(value).bundle)
  const description: unknown = JSON.parse(readFileSync(join(bundle, 'description.json'), 'utf8'))
  const browser = Object(Object(description).browser)
  const sized = (file: string): string => `${file} ${statSync(join(bundle, file)).size} bytes`

  // The map of the same files: the page of each screen, its module and its style files, and the style files of the project.
  const map = await typed(folder, 'map')
  assert.equal(map.ended, 0, map.printed)
  const lines = map.printed.split('\n')
  assert.ok(lines.includes('page'), map.printed)
  const page = lines.slice(lines.indexOf('page') + 1)
  const homeFiles: string[] = Object(browser.screens).homeScreen
  assert.ok(homeFiles.length > 0)
  assert.ok(page.includes(`  screen homeScreen: ${homeFiles.map(sized).join(', ')}`), map.printed)
  // No style file is shared by several screens: the map names none.
  assert.equal(browser.styles, undefined)
  assert.ok(!page.some((line) => line.startsWith('  styles:')), map.printed)

  // The build tells what each package of the project weighs in the page, and nothing of one that reaches no browser.
  const packages = Object(Object(description).packages)
  assert.deepEqual(Object(value).packages, {
    'month-words': packages['month-words'].bytes,
    'tiny-bars': packages['tiny-bars'].bytes,
  })
  const told = await typed(folder, 'build')
  assert.equal(told.ended, 0, told.printed)
  assert.match(told.printed, new RegExp(`tiny-bars: ${packages['tiny-bars'].bytes} bytes in the page`))
  assert.match(told.printed, new RegExp(`month-words: ${packages['month-words'].bytes} bytes in the page`))
  assert.doesNotMatch(told.printed, /net-reader/)
})
