import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { firstPages } from '../../docs/index.ts'
import { testApp } from '../../test/index.ts'
import { root, typed } from './typed.ts'

/** The first page of the docs, as it ships: the pages that walk one app, in their order. */
const page = (): string =>
  firstPages
    .map((name) => readFileSync(join(root, 'parts', 'docs', 'pages', `${name}.md`), 'utf8').replaceAll('\r\n', '\n'))
    .join('\n')

/** The files that the examples of the page write: each block of code whose first line names its file, in order. */
const examples = (): Record<string, string> =>
  Object.fromEntries(
    [...page().matchAll(/```tsx?\n\/\/ ([\w./-]+)\n([\s\S]*?)```/g)].map((found) => [found[1], found[2]] as const),
  )

test('[43-2] tent docs opens on the first page, which says how tent is run and walks one app from nothing', async () => {
  const opened = await typed(root, 'docs')
  assert.equal(opened.ended, 0, opened.printed)
  assert.equal(opened.printed.split('\n')[0], page().split('\n')[0])
  const text = page()
  // How tent is had: the package of npm, or a project made by npm create tent.
  assert.match(text, /npm install -g tentjs/)
  assert.match(text, /npm create tent my-app/)
  for (const word of ['tent new', 'tent dev', 'goTo', 'passwords.check', 'sessions.start', 'seed', 'notFound'])
    assert.ok(text.includes(word), `the first page names ${word}`)
})

test('[43-2] no page of the shipped docs, and not AGENTS.md, runs tent from a copy of the repository or waits for a release', () => {
  const docs = join(root, 'parts', 'docs')
  const files = [join(docs, 'AGENTS.md'), ...readdirSync(join(docs, 'pages')).map((file) => join(docs, 'pages', file))]
  const unreleased = files.filter((file) =>
    /<the copy>|until a release|once a release|copy of (?:its|the|this) repository|parts\/cli\/(?:shell|names)\.ts/i.test(
      readFileSync(file, 'utf8'),
    ),
  )
  assert.deepEqual(unreleased, [])
})

test('[43-2] the AGENTS.md that tent new writes says that tent docs opens on the first page and that tent new makes a bare project', () => {
  const agents = readFileSync(join(root, 'parts', 'docs', 'AGENTS.md'), 'utf8')
  const row = (command: string): string => agents.split('\n').find((line) => line.startsWith(`| \`${command}\``)) ?? ''
  assert.match(row('tent docs'), /opens on the first page/)
  assert.match(row('tent new <name>'), /bare project: one screen and the query it reads/)
})

test('[43-2] a flag of a choice that is missing names the values it takes', async () => {
  const missing = await typed(root, 'access', 'role', '--json')
  assert.equal(missing.ended, 2, missing.printed)
  assert.match(String(missing.answer.findings?.[0]?.message), /^tent access role needs <do>: add, remove\.$/)
  const empty = await typed(root, 'start', '--mode', '--json')
  assert.equal(empty.ended, 2, empty.printed)
  assert.match(String(empty.answer.findings?.[0]?.message), /needs a value: development, test, live\.$/)
})

test('[43-2] the app of the first page runs as it is written: a stranger is sent to its sign-in, a signed-in person with the role sees the orders with a link to each, and one without it is not found', async (t) => {
  const files = examples()
  for (const path of ['tent.ts', 'tables/users.ts', 'tables/orders.ts', 'functions/orders.ts', 'seed.ts'])
    assert.ok(files[path], `the first page writes ${path}`)
  const folder = join(root, 'results', 'cli', 'first-page')
  const remove = (): void => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  remove()
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  t.after(remove)
  const checked = await typed(folder, 'check', '--json')
  assert.equal(checked.ended, 0, checked.printed)
  assert.deepEqual(
    checked.answer.findings?.filter((one) => one.level === 'error'),
    [],
  )

  const app = await testApp({ folder })
  t.after(() => app.close())
  // A stranger is sent to the sign-in screen, with the address to come back to.
  const stranger = app.browser()
  const sent = await stranger.page('/')
  assert.equal(sent.status, 302)
  assert.match(String(sent.headers.location), /^\/sign-in\?back=%2F$/)
  assert.equal((await stranger.page('/sign-in')).status, 200)

  // The person of the seed signs in with the password the seed gave them, and sees the open orders with a link.
  const login = /email: '([^']+)'[\s\S]*?passwords\.hash\('([^']+)'\)/.exec(files['seed.ts'])
  assert.ok(login, 'the seed makes a person with a password')
  const staff = app.browser({ from: '10.30.0.1' })
  const signed = await staff.call('signIn', { email: login[1], password: login[2] })
  assert.equal(signed.ok, true, JSON.stringify(signed))
  const orders = await staff.page('/')
  assert.equal(orders.status, 200)
  const [first] = await app.rows('orders')
  assert.ok(orders.html.includes(String(first.title)), orders.html)
  assert.match(orders.html, /<a [^>]*href="\/orders\/[A-Za-z0-9_-]+"/)
  const order = await staff.page(`/orders/${first.id}`)
  assert.equal(order.status, 200)

  // A signed-in person without the right learns nothing of the screen: it is not found.
  const customer = await app.user({ email: 'someone@example.com', roles: [] })
  const other = await app.as(customer).page('/')
  assert.equal(other.status, 404)
})
