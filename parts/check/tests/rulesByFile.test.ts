import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildSaved } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import { list } from '../rules/list.ts'
import { rulesOver } from '../rulesOver.ts'
import { rulesThread } from '../rulesThread.ts'

// A save checks the changed files alone: a rule that reads one file at a time keeps what it found of every other.

const root = join(import.meta.dirname, '..', '..', '..')

/** Writes the project of the measure, 100 backend files and 200 screens, with a few files that our rules find fault with. */
function largeProject(): string {
  const folder = join(root, 'results', 'check', 'rules-by-file')
  rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  const put = (path: string, text: string): void => {
    mkdirSync(join(folder, path, '..'), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  put('tent.ts', "import { project } from 'tentjs'\n\nexport const shelf = project('shelf', { title: 'Shelf' })\n")
  for (let n = 0; n < 100; n++)
    put(
      `functions/f${n}.ts`,
      [
        "import { change, input, query, table, text } from 'tentjs'",
        '',
        `export const items${n} = table('items${n}', { columns: { title: text() }, access: { read: 'anyone', add: 'signedIn' } })`,
        '',
        `export const list${n} = query('list${n}', { access: 'anyone', rows: items${n}.oldest('title').limit(20) })`,
        '',
        `export const label${n} = query('label${n}', { access: 'anyone', output: text(), run: () => 'Label ${n} first' })`,
        '',
        `export const add${n} = change('add${n}', {`,
        "  access: 'signedIn',",
        '  input: { title: text() },',
        `  set: items${n}.add({ title: input('title') }),`,
        '})',
        '',
      ].join('\n'),
    )
  for (let k = 0; k < 4; k++)
    put(
      `components/shared${k}.tsx`,
      `import { component } from 'tentjs/ui'\n\nexport const Shared${k} = component('Shared${k}', { view: () => <span>Shared ${k}</span> })\n`,
    )
  for (let n = 0; n < 200; n++)
    put(
      `screens/s${n}.tsx`,
      [
        "import { screen, read, Link } from 'tentjs/ui'",
        `import { label${n % 100} } from '../functions/f${n % 100}'`,
        `import { Shared${n % 4} } from '../components/shared${n % 4}'`,
        '',
        `export const s${n} = screen('s${n}', {`,
        `  path: '/s${n}',`,
        "  access: 'anyone',",
        `  data: { label: read(label${n % 100}) },`,
        '  view: ({ label }) => (',
        '    <div>',
        // Every tenth screen writes a link that could lead out of the app.
        n % 10 === 3 ? `      <Link to="//away.example">Screen ${n}</Link>` : `      <h1>Screen ${n}</h1>`,
        '      <span>{label}</span>',
        `      <Shared${n % 4} />`,
        '    </div>',
        '  ),',
        '})',
        '',
      ].join('\n'),
    )
  // A file of each kind of fault of the rules that read one file: a word that asks the engine at the top, a step
  // whose promise nothing waits for, a secret opened, and a connection of the code's own.
  put(
    'functions/started.ts',
    "import { now, query, text } from 'tentjs'\n\nconst started = now()\n\nexport const since = query('since', { access: 'anyone', output: text(), run: () => String(started) })\n",
  )
  put(
    'flows/hasty.ts',
    `import { change, flow, input, table, text } from 'tentjs'

export const orders = table('orders', { columns: { title: text() }, access: { read: 'signedIn' } })

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})

export const hasty = flow('hasty', {
  input: { title: text() },
  run: async ({ input, step }) => {
    step('add', () => addOrder({ title: input.title }))
    step.wait('1 day')
    return 'done'
  },
})
`,
  )
  put(
    'functions/outside.ts',
    "import { action, text } from 'tentjs'\n\nexport const outside = action('outside', { access: 'signedIn', output: text(), run: async () => String((await fetch('http://127.0.0.1:9/')).status) + ({ reveal: () => '' }).reveal() })\n",
  )
  return folder
}

/** Every rule of our own that needs nothing of a running app, each carried out over the whole source, in their order. */
async function wholeCheck(o: Parameters<typeof rulesOver>[0]): Promise<Finding[]> {
  const rules = await Promise.all(list.map((one) => one.load()))
  return rules.filter(({ rule }) => !rule.needs.includes('facts')).flatMap(({ rule }) => rule.run(o))
}

/** What a finding says, where it says it. */
const told = (findings: Finding[]): string[] =>
  findings.map((one) => `${one.code} ${one.where?.file}:${one.where?.line} ${one.message}`)

/** Saves a file of the project with one text in the place of another. */
function save(folder: string, file: string, from: string, to: string): void {
  const held = readFileSync(join(folder, file), 'utf8')
  assert.ok(held.includes(from), `${file} holds ${from}`)
  writeFileSync(join(folder, file), held.replace(from, to))
}

test('[31-21] on the large project, what our rules find at each save, with the rules that read one file kept for every file the save did not change, is what the whole check finds, finding for finding', async (t) => {
  const folder = largeProject()
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const first = await buildSaved(folder)
  const found = await rulesOver(first)
  const codes = new Set(found.map((one) => one.code))
  for (const code of ['T6013', 'T1014', 'T5002', 'T7014', 'T7015'])
    assert.ok(codes.has(code), `${code} is found:\n${told(found).join('\n')}`)
  assert.deepEqual(told(found), told(await wholeCheck(first)))

  // A save of one screen: its findings are made anew, and every other file's are those found before.
  save(folder, 'screens/s5.tsx', '<h1>Screen 5</h1>', '<Link to="//away.example">Screen 5</Link>')
  const next = await buildSaved(folder)
  const again = await rulesOver(next)
  assert.deepEqual(told(again), told(await wholeCheck(next)))
  assert.ok(
    told(again).some((line) => line.startsWith('T6013 screens/s5.tsx:')),
    'the saved file is checked anew',
  )
  const kept = (findings: Finding[], file: string, code: string): Finding | undefined =>
    findings.find((one) => one.code === code && one.where?.file === file)
  assert.equal(kept(again, 'functions/outside.ts', 'T7015'), kept(found, 'functions/outside.ts', 'T7015'))
  assert.equal(kept(again, 'screens/s3.tsx', 'T6013'), kept(found, 'screens/s3.tsx', 'T6013'))
})

test('[31-21] our rules on a thread of their own find, at a first build and after a save, what they find on the thread of the program, finding for finding', async (t) => {
  const folder = largeProject()
  const thread = rulesThread()
  t.after(async () => {
    await thread.close()
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  const first = await buildSaved(folder)
  assert.deepEqual(await thread.over(first), await rulesOver(first))
  save(folder, 'screens/s5.tsx', '<h1>Screen 5</h1>', '<Link to="//away.example">Screen 5</Link>')
  const next = await buildSaved(folder)
  const again = await thread.over(next)
  assert.deepEqual(again, await rulesOver(next))
  assert.ok(
    told(again).some((line) => line.startsWith('T6013 screens/s5.tsx:')),
    'the saved file is checked anew',
  )
})

test('[31-21] a build of a session hands our rules its source and its description as the check reads them before it writes the bundle, and they find there what they find in the whole build, at a first build and after a save', async (t) => {
  const folder = largeProject()
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const bundle = join(folder, '.tent', 'build')
  for (const round of ['first', 'saved']) {
    if (round === 'saved')
      save(folder, 'screens/s5.tsx', '<h1>Screen 5</h1>', '<Link to="//away.example">Screen 5</Link>')
    let handed: Parameters<typeof rulesOver>[0] | undefined
    let written: string[] = []
    const built = await buildSaved(folder, {
      checkable: (whole) => {
        handed = whole
        written = existsSync(bundle) ? readdirSync(bundle) : []
      },
    })
    assert.ok(handed, `the ${round} build hands its source and its description`)
    assert.ok(!written.includes(`${built.versionId}.json`), `the ${round} build hands them before its list is written`)
    assert.deepEqual(Object.keys(handed.source), Object.keys(built.source))
    assert.deepEqual(told(await rulesOver(handed)), told(await rulesOver(built)), `what the rules find, ${round}`)
  }
})
