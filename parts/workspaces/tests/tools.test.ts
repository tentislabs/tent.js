import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { refusal, tooled } from './tooled.ts'

/** The text of a file of the project of a workspace. */
const fileOf = (folder: string, path: string): string => readFileSync(join(folder, 'project', path), 'utf8')

test('[40-17] map, read, search and docs answer what their rows say, and write nothing', async (t) => {
  const { tool, made } = await tooled(t)
  const before = fileOf(made.folder, 'tables/users.ts')
  const map = Object(await tool('map', {}))
  assert.match(map.outline, /notes/)
  assert.match(map.outline, /addNote/)
  const read = Object(await tool('read', { path: 'tables/users.ts' }))
  assert.equal(read.text, before)
  const lines = Object(await tool('read', { path: 'tables/users.ts', from: 1, to: 1 }))
  assert.equal(lines.text, "import { anyone, list, table, text } from 'tentjs'")
  const found = Object(await tool('search', { text: 'notes' }))
  assert.ok(found.found.some((one: { path: string }) => one.path === 'tables/users.ts'))
  assert.ok(found.found.every((one: { text: string }) => one.text.includes('notes')))
  const limited = Object(await tool('search', { text: 'notes', limit: 1 }))
  assert.equal(limited.found.length, 1)
  const docs = Object(await tool('docs', { topic: 'word.table' }))
  assert.equal(docs.name, 'word.table')
  assert.match(docs.text, /^# `table`/)
  // A topic that reaches out of the pages finds none.
  assert.equal((await refusal(tool('docs', { topic: '../../x' })))?.code, 'T0001')
  assert.equal(fileOf(made.folder, 'tables/users.ts'), before)
})

test('[40-17] search with in naming a file searches that one file, and with in naming a folder the files under it', async (t) => {
  const { tool } = await tooled(t)
  const paths = async (input: object): Promise<string[]> => [
    ...new Set<string>(Object(await tool('search', input)).found.map((one: { path: string }) => one.path)),
  ]
  assert.deepEqual(await paths({ text: 'notes', in: 'tables/users.ts' }), ['tables/users.ts'])
  const everywhere = await paths({ text: 'notes' })
  assert.ok(everywhere.length > 1, everywhere.join(', '))
  const tables = await paths({ text: 'notes', in: 'tables' })
  assert.deepEqual(
    tables,
    everywhere.filter((path) => path.startsWith('tables/')),
  )
})

test('[40-17] [16-2@10a] edit puts a text in the place of one that stands once, and is T9106 with how often it stands', async (t) => {
  const { tool, made } = await tooled(t)
  await tool('edit', { path: 'screens/home.tsx', find: 'No notes', with: 'Nothing yet' })
  assert.match(fileOf(made.folder, 'screens/home.tsx'), /Nothing yet/)
  const twice = await refusal(tool('edit', { path: 'tables/users.ts', find: 'anyone(', with: 'role(' }))
  assert.equal(twice?.code, 'T9106')
  assert.equal(twice?.fields?.count, '2')
  assert.match(String(twice?.message), /2 times/)
  const none = await refusal(tool('edit', { path: 'tables/users.ts', find: 'no such text', with: 'x' }))
  assert.equal(none?.code, 'T9106')
  assert.equal(none?.fields?.count, '0')
})

test('[40-17] write writes a whole file, rename adds was and changes every plain place that names it, and remove takes a definition and a file away', async (t) => {
  const { tool, made } = await tooled(t)
  await tool('write', {
    path: 'functions/more.ts',
    text: "import { anyone, query } from 'tentjs'\nimport { notes } from '../tables/users'\n\nexport const someNotes = query('someNotes', {\n  about: 'Some notes',\n  access: anyone('the notes of a test app'),\n  rows: notes.limit(3),\n})\n",
  })
  assert.ok(existsSync(join(made.folder, 'project', 'functions', 'more.ts')))
  // A screen whose view names the query: a view is code, as the body of an action is.
  await tool('write', {
    path: 'screens/count.tsx',
    text: "import { anyone, screen } from 'tentjs/ui'\nimport { allNotes } from '../functions/users'\n\nexport const countScreen = screen('countScreen', {\n  path: '/count',\n  access: anyone('the notes of a test app'),\n  view: () => <p>{typeof allNotes}</p>,\n})\n",
  })
  const renamed = Object(await tool('rename', { name: 'allNotes', to: 'everyNote' }))
  const functions = fileOf(made.folder, 'functions/users.ts')
  assert.match(functions, /export const everyNote = query\('everyNote', \{/)
  assert.match(functions, /was: \['allNotes'\]/)
  // The screen that reads it names it anew, in its import and in its read, which are plain places.
  const screen = fileOf(made.folder, 'screens/home.tsx')
  assert.match(screen, /import \{ everyNote \} from '..\/functions\/users'/)
  assert.match(screen, /read\(everyNote\)/)
  assert.doesNotMatch(screen, /allNotes/)
  // A place in code is listed in the answer, and left as it stands: code is never rewritten by a tool.
  const count = fileOf(made.folder, 'screens/count.tsx')
  assert.match(count, /import \{ everyNote \} from '..\/functions\/users'/)
  assert.match(count, /view: \(\) => <p>\{typeof allNotes\}<\/p>/)
  assert.deepEqual(renamed.code, [{ path: 'screens/count.tsx', line: 7 }])
  assert.deepEqual(renamed.files.sort(), ['functions/users.ts', 'screens/count.tsx', 'screens/home.tsx'])
  await tool('remove', { path: 'screens/count.tsx' })
  await tool('remove', { name: 'someNotes' })
  assert.doesNotMatch(fileOf(made.folder, 'functions/more.ts'), /someNotes/)
  await tool('remove', { path: 'functions/more.ts' })
  assert.ok(!existsSync(join(made.folder, 'project', 'functions', 'more.ts')))
  const { findings } = Object(await tool('check', {}))
  assert.deepEqual(
    findings.filter((one: { level: string }) => one.level === 'error'),
    [],
  )
  // A column is renamed in its place, with was, and so is the write of a plain change that names it.
  await tool('rename', { name: 'notes.body', to: 'text' })
  assert.match(fileOf(made.folder, 'tables/users.ts'), /text: text\(\{ max: 200, was: 'body' \}\)/)
  assert.match(fileOf(made.folder, 'functions/users.ts'), /notes\.add\(\{ text: input\('body'\) \}\)/)
})

test('[40-17] run calls a function of the workspace on the test data as a user of it or as nobody, rows reads its rows without the private columns, and logs reads its log', async (t) => {
  const { tool, workspaces, made } = await tooled(t)
  const added = Object(await tool('run', { name: 'addNote', input: { body: 'by the tool' } }))
  assert.equal(Object(added.answer).body, 'by the tool')
  const rows = Object(await tool('rows', { table: 'notes' }))
  assert.deepEqual(
    rows.rows.map((one: { body: string }) => one.body),
    ['by the tool'],
  )
  const app = await workspaces.run(made.id)
  await app.write([{ add: 'letters', values: { to: 'a@example.com', code: 'hidden' } }], { as: 'system' })
  const letters = Object(await tool('rows', { table: 'letters' }))
  assert.equal(letters.rows.length, 1)
  assert.ok(!('code' in letters.rows[0]), 'a private column is left out')
  const [user] = Object(
    await app.write([{ add: 'users', values: { email: 'bo@example.com', roles: [] } }], { as: 'system' }),
  )
  const me = Object(await tool('run', { name: 'whoAmI', input: {}, as: Object(user).id }))
  assert.equal(Object(me.answer).email, 'bo@example.com')
  // As nobody where `as` is left out, and the system only where the policy says so.
  assert.equal((await refusal(tool('run', { name: 'whoAmI', input: {} })))?.code, 'T0006')
  assert.equal((await refusal(tool('run', { name: 'whoAmI', input: {}, as: 'system' })))?.code, 'T0002')
  const logs = Object(await tool('logs', {}))
  assert.ok(logs.calls.some((one: { name: string }) => one.name === 'addNote'))
  const failures = Object(await tool('logs', { errors: true }))
  assert.ok(Array.isArray(failures.errors))
})

test('[40-17] history, compare and changedBy answer the points of the workspace and what each changed, and who changed a definition last', async (t) => {
  const { tool, made, workspaces, owner } = await tooled(t)
  // The person's own point, from which the AI's change is compared.
  const first = (await workspaces.rebuild(made.id, { kind: 'person', id: owner })).point
  assert.equal(Object(await tool('history', {})).points[0].id, first.id)
  await tool('edit', { path: 'tables/users.ts', find: 'max: 200', with: 'max: 300' })
  const points = Object(await tool('history', {})).points
  assert.equal(points[0].kind, 'command')
  assert.equal(points[0].by.kind, 'tool', 'a tool of the product code writes as the tool')
  const changes = Object(await tool('compare', { from: first.id })).changes
  assert.ok(
    changes.some(
      (one: { what: string; name: string; path?: string[] }) => one.what === 'column' && one.name === 'notes.body',
    ),
    JSON.stringify(changes),
  )
  const one = Object(await tool('compare', { from: first.id, name: 'notes' })).changes
  assert.ok(one.every((change: { name: string }) => change.name.startsWith('notes')))
  const last = Object(await tool('changedBy', { name: 'notes.body' }))
  assert.equal(last.point, points[0].id)
  assert.equal(last.kind, 'command')
  assert.equal(last.by.kind, 'tool')
})

test('[40-17] a path that leaves the folder of the workspace is T9105, and so is a file the framework writes itself', async (t) => {
  const { tool, made } = await tooled(t)
  for (const path of [
    '../x.ts',
    '../../workspaces/x/project/tent.ts',
    'functions/../../x.ts',
    '/etc/passwd',
    'C:/x.ts',
  ])
    assert.equal((await refusal(tool('read', { path })))?.code, 'T9105', path)
  for (const path of ['.tent/x.ts', 'tent.clash.ts', 'tent.d.ts', 'mcp.lock.json', 'TENT.CLASH.TS', '.Tent/x.ts'])
    assert.equal((await refusal(tool('write', { path, text: 'x' })))?.code, 'T9105', path)
  // `engine.ts` is written only where the policy names `engine` in `also`.
  assert.equal((await refusal(tool('write', { path: 'engine.ts', text: 'export default {}\n' })))?.code, 'T9105')
  assert.ok(!existsSync(join(made.folder, 'project', 'engine.ts')))
  await tool('write', { path: 'engine.ts', text: 'export default {}\n' }, 'coder')
  assert.ok(existsSync(join(made.folder, 'project', 'engine.ts')))
})

test('[40-17] a write that the policy refuses leaves the file as it was, an edit that takes a whole definition away under remove: [] is T9105, and tool from the product code renames under the policy and is T9105 where it refuses', async (t) => {
  const { tool, made } = await tooled(t)
  const before = fileOf(made.folder, 'functions/users.ts')
  // `narrow` may change screens and tables, and create screens alone.
  const query = `${before}\nexport const moreNotes = query('moreNotes', {\n  access: anyone('the notes of a test app'),\n  rows: notes.limit(2),\n})\n`
  const created = await refusal(tool('write', { path: 'functions/users.ts', text: query }, 'narrow'))
  assert.equal(created?.code, 'T9105')
  assert.match(String(created?.fields?.rule), /create/)
  assert.equal(fileOf(made.folder, 'functions/users.ts'), before)
  const start = before.indexOf('export const whoAmI')
  const end = before.indexOf('})\n', start) + 3
  const gone = await refusal(
    tool('edit', { path: 'functions/users.ts', find: before.slice(start, end), with: '' }, 'narrow'),
  )
  assert.equal(gone?.code, 'T9105')
  assert.match(String(gone?.fields?.rule), /remove/)
  assert.equal(fileOf(made.folder, 'functions/users.ts'), before)
  // From the product's own code, under the policy of the agent it names.
  await tool('rename', { name: 'homeScreen', to: 'startScreen' }, 'builder')
  assert.match(fileOf(made.folder, 'screens/home.tsx'), /screen\('startScreen'/)
  assert.equal((await refusal(tool('remove', { name: 'addNote' }, 'narrow')))?.code, 'T9105')
  // A policy that names no tool offers none.
  assert.equal((await refusal(tool('write', { path: 'screens/x.tsx', text: '' }, 'reader')))?.code, 'T0001')
})
