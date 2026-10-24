import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { checkProject } from '../index.ts'
import { checkRules } from '../ours.ts'

const root = join(import.meta.dirname, '..', '..', '..')

/** Writes a project of the given files into a folder of its own under `results/`, and answers the folder. */
function projectOf(name: string, files: Record<string, string>): string {
  const folder = join(root, 'results', 'check', `review-${name}`)
  rmSync(folder, { recursive: true, force: true })
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  return folder
}

const shop = "import { project } from 'tentjs'\n\nexport const shop = project('shop', { title: 'Shop' })\n"

const users =
  "export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })\n"

test('[15-1] the type checker reads a command file too: a type error in it is T8000', async () => {
  const folder = projectOf('command-types', {
    'tent.ts': shop,
    'commands/greet.ts': [
      "import { command } from 'tentjs/cli'",
      '',
      "export const greet = command('greet', {",
      "  about: 'Greets',",
      '  run: async ({ terminal }) => {',
      "    const wrong: number = 'text'",
      '    terminal.write(String(wrong))',
      '  },',
      '})',
      '',
    ].join('\n'),
  })
  const { findings } = await checkProject(folder)
  assert.deepEqual(
    findings.filter((one) => one.code === 'T8000').map((one) => one.where?.file),
    ['commands/greet.ts'],
  )
})

test('[16-2] T2005: a link of the input of a flow that names a table which the project does not hold', async () => {
  const folder = projectOf('flow-link', {
    'tent.ts': shop,
    'functions/notes.ts': [
      "import { flow, link, list, table, text } from 'tentjs'",
      '',
      users,
      "export const remind = flow('remind', {",
      "  input: { person: link('people') },",
      '  run: async ({ step }) => {',
      "    await step('one', () => 1)",
      '  },',
      '})',
      '',
    ].join('\n'),
  })
  const { findings } = await checkRules(folder)
  assert.ok(
    findings.some((one) => one.code === 'T2005' && /people/.test(one.message)),
    findings.map((one) => `${one.code} ${one.message}`).join('\n'),
  )
})

test('[16-2] T2015: `columns` in the `by` of a column that is no vector with a model is T2015', async () => {
  const folder = projectOf('by-columns', {
    'tent.ts': shop,
    'functions/notes.ts': [
      "import { list, table, text } from 'tentjs'",
      '',
      users,
      "export const notes = table('notes', {",
      "  columns: { body: text(), short: text({ optional: true, by: { columns: ['body'] } }) },",
      "  access: { read: 'signedIn' },",
      '})',
      '',
    ].join('\n'),
  })
  const { findings } = await checkRules(folder)
  assert.deepEqual(
    findings.map((one) => one.code),
    ['T2015'],
    findings.map((one) => `${one.code} ${one.message}`).join('\n'),
  )
})

test("[16-2] T2016: a table whose `shows` is a word other than 'counts' or 'scores' is T2016", async () => {
  const folder = projectOf('shows-other', {
    'tent.ts': shop,
    'functions/notes.ts': [
      "import { list, table, text } from 'tentjs'",
      '',
      users,
      "export const usage = table('usage', { shows: 'calls', access: { read: 'owner' } })",
      '',
    ].join('\n'),
  })
  const { findings } = await checkRules(folder)
  assert.ok(
    findings.some((one) => one.code === 'T2016'),
    findings.map((one) => `${one.code} ${one.message}`).join('\n'),
  )
})

/** Holds that our rules find a code in a project, at a definition where one is named. */
async function finds(folder: string, code: string, definition?: string): Promise<void> {
  const { findings } = await checkRules(folder)
  assert.ok(
    findings.some((one) => one.code === code && (definition === undefined || one.where?.definition === definition)),
    `${code} is found, among:\n${findings.map((one) => `${one.code} ${one.message}`).join('\n')}`,
  )
}

const notes = "export const notes = table('notes', { columns: { body: text() }, access: { read: 'signedIn' } })\n"

test('[15-1@4] T3004: a route that uses full access and states no `system`', async () => {
  const folder = projectOf('route-system', {
    'tent.ts': shop,
    'functions/notes.ts': [
      "import { list, route, table, text } from 'tentjs'",
      '',
      users,
      notes,
      "export const feed = route('feed', {",
      "  method: 'GET',",
      "  path: '/feed',",
      "  access: 'signedIn',",
      '  run: async ({ db }) => {',
      "    db.system.notes.add({ body: 'seen' })",
      "    return new Response('ok')",
      '  },',
      '})',
      '',
    ].join('\n'),
  })
  await finds(folder, 'T3004', 'feed')
})

test('[15-1@7b] T3004: a flow that runs as its starter and uses full access', async () => {
  const folder = projectOf('starter-system', {
    'tent.ts': shop,
    'functions/notes.ts': [
      "import { flow, list, table, text } from 'tentjs'",
      '',
      users,
      notes,
      "export const tidy = flow('tidy', {",
      "  as: 'starter',",
      '  run: async ({ step, db }) => {',
      "    await step('one', () => db.system.notes.add({ body: 'tidied' }))",
      '  },',
      '})',
      '',
    ].join('\n'),
  })
  await finds(folder, 'T3004', 'tidy')
})

test("[15-1@4] T3003: a reason of spaces alone is no reason, so a read of personal data open to anyone(' ') is found", async () => {
  const folder = projectOf('personal-spaces', {
    'tent.ts': shop,
    'functions/notes.ts': [
      "import { anyone, list, table, text } from 'tentjs'",
      '',
      users,
      "export const people = table('people', {",
      '  columns: { email: text({ personal: true }) },',
      "  access: { read: anyone(' ') },",
      '})',
      '',
    ].join('\n'),
  })
  await finds(folder, 'T3003', 'people')
})

test('[15-1@4] T3009: a read through `db` of another table holds no row of the table it writes to its caller', async () => {
  const folder = projectOf('caller-elsewhere', {
    'tent.ts': shop,
    'functions/orders.ts': [
      "import { boolean, change, link, list, table, text } from 'tentjs'",
      '',
      users,
      notes,
      "export const orders = table('orders', {",
      "  columns: { title: text(), placedBy: link('users'), paid: boolean({ default: false }) },",
      "  owner: 'placedBy',",
      "  access: { read: 'owner', add: 'signedIn', change: 'owner' },",
      '})',
      '',
      "export const markPaid = change('markPaid', {",
      "  access: 'signedIn',",
      "  system: 'an order is marked paid when its payment arrives',",
      "  input: { order: link('orders') },",
      '  run: ({ db, input }) => {',
      '    if (db.notes.count() > 100) return',
      '    db.system.orders.change(input.order, { paid: true })',
      '  },',
      '})',
      '',
    ].join('\n'),
  })
  await finds(folder, 'T3009', 'markPaid')
})

test("[12-3b] T4005: an `async` arrow handed to `each` in a screen's `data`, where nothing may be waited for", async () => {
  const folder = projectOf('each-in-data', {
    'tent.ts': shop,
    'functions/notes.ts': [
      "import { input, list, query, table, text } from 'tentjs'",
      '',
      users,
      notes,
      "export const someNotes = query('someNotes', {",
      "  access: 'signedIn',",
      '  input: { bodies: list(text()) },',
      "  rows: notes.where({ body: { in: input('bodies') } }).limit(20),",
      '})',
      '',
    ].join('\n'),
    'screens/notes.tsx': [
      "import { each, read, screen } from 'tentjs/ui'",
      "import { someNotes } from '../functions/notes'",
      '',
      "export const notesScreen = screen('notesScreen', {",
      "  path: '/notes',",
      "  access: 'signedIn',",
      "  data: () => ({ notes: read(someNotes, { bodies: each(['a', 'b'], async (one) => one) }) }),",
      '  view: ({ notes }) => <span>{notes?.length}</span>,',
      '})',
      '',
    ].join('\n'),
  })
  await finds(folder, 'T4005', 'notesScreen')
})

test('[51-2] [15-1@7b] T5007: `machineSeconds` in `limits.perDay` of a `python`, a limit of a definition', async () => {
  const folder = projectOf('machine-seconds', {
    'tent.ts': shop,
    'work/sum.py': 'def run(input):\n    return 1\n',
    'functions/work.ts': [
      "import { list, number, python, table, text } from 'tentjs'",
      '',
      users,
      "export const sum = python('sum', {",
      "  file: 'work/sum.py',",
      "  access: 'signedIn',",
      '  input: {},',
      '  output: number(),',
      '  limits: { perDay: { machineSeconds: 60 } },',
      '})',
      '',
    ].join('\n'),
  })
  await finds(folder, 'T5007', 'sum')
})

test('[32-9] a `message(...)` that a view writes among its elements passes the type checker', async () => {
  const folder = projectOf('word-in-view', {
    'tent.ts': shop,
    'functions/users.ts': ["import { list, table, text } from 'tentjs'", '', users].join('\n'),
    'messages/en.ts':
      "import { messages } from 'tentjs/ui'\n\nexport default messages('en', { orders: { title: 'Orders' } })\n",
    'screens/orders.tsx': [
      "import { screen, message } from 'tentjs/ui'",
      '',
      "export const ordersScreen = screen('ordersScreen', {",
      "  path: '/orders',",
      "  access: 'anyone',",
      "  view: () => <h1>{message('orders.title')}</h1>,",
      '})',
      '',
    ].join('\n'),
  })
  const { findings } = await checkProject(folder)
  assert.deepEqual(
    findings.map((one) => `${one.code} ${one.where?.file}:${one.where?.line} ${one.message}`),
    [],
  )
})

test('[23-5] T5001: a function of the file that is named `now` is no word that is drawn', async () => {
  const folder = projectOf('own-now', {
    'tent.ts': shop,
    'flows/tidy.ts': [
      "import { flow, list, table, text } from 'tentjs'",
      '',
      users,
      'const now = (): number => 1',
      '',
      "export const tidy = flow('tidy', {",
      '  run: async ({ step }) => {',
      '    const n = now()',
      "    await step('one', () => n)",
      '  },',
      '})',
      '',
    ].join('\n'),
  })
  const { findings } = await checkRules(folder)
  assert.deepEqual(
    findings.map((one) => `${one.code} ${one.message}`),
    [],
  )
})

test('[51-2] [15-1@7b] T5008: a `batch` that states `split` on a definition that does not state `sends: false` is a note', async () => {
  const folder = projectOf('batch-split', {
    'tent.ts': shop,
    'functions/work.ts': [
      "import { action, list, number, table, text } from 'tentjs'",
      '',
      users,
      "export const encode = action('encode', {",
      "  access: 'signedIn',",
      '  batch: { max: 10, split: true },',
      '  input: { n: number() },',
      '  run: async ({ entries }) => entries.map((one) => one.input.n),',
      '})',
      '',
    ].join('\n'),
  })
  const { findings } = await checkRules(folder)
  assert.deepEqual(
    findings.map((one) => [one.code, one.level, one.where?.definition, /split/.test(one.message)]),
    [['T5008', 'note', 'encode', true]],
  )
})

test('[51-12] T2015: the `input` of a filled column that reads through a link into another file', async () => {
  const folder = projectOf('filled-across', {
    'tent.ts': shop,
    'functions/notes.ts': [
      "import { action, link, list, table, text } from 'tentjs'",
      '',
      users,
      "export const teams = table('teams', { columns: { name: text() }, access: { read: 'signedIn' } })",
      '',
      "export const summarize = action('summarize', {",
      "  access: 'nobody',",
      "  system: 'fills the summary of a note',",
      '  input: { by: text() },',
      '  output: text(),',
      '  run: async ({ input }) => input.by,',
      '})',
      '',
      "export const notes = table('notes', {",
      '  columns: {',
      "    team: link('teams', { onRemove: 'remove' }),",
      "    author: link('users', { onRemove: 'clear', optional: true }),",
      "    summary: text({ optional: true, by: { work: summarize, input: { by: 'author.name' } } }),",
      '  },',
      "  tenant: 'team',",
      "  access: { read: 'signedIn' },",
      '})',
      '',
    ].join('\n'),
  })
  const { findings } = await checkRules(folder)
  assert.deepEqual(
    findings.filter((one) => one.code === 'T2015').map((one) => /another file/.test(one.message)),
    [true],
    findings.map((one) => `${one.code} ${one.message}`).join('\n'),
  )
})

test('[32-7] T6007: a screen and a redirect that fit exactly the same addresses', async () => {
  const folder = projectOf('screen-redirect', {
    'tent.ts': [
      "import { project } from 'tentjs'",
      '',
      "export const shop = project('shop', { title: 'Shop', redirects: [{ from: '/orders/:id', to: '/list' }] })",
      '',
    ].join('\n'),
    'functions/users.ts': ["import { list, table, text } from 'tentjs'", '', users].join('\n'),
    'screens/order.tsx': [
      "import { screen } from 'tentjs/ui'",
      '',
      "export const orderScreen = screen('orderScreen', {",
      "  path: '/orders/:order',",
      "  access: 'signedIn',",
      '  view: () => <main>an order</main>,',
      '})',
      '',
    ].join('\n'),
  })
  await finds(folder, 'T6007')
})

test('[30-7] T6013: a literal `src` of an `Image` and a literal `href` of a `head` link of a kind that is not allowed', async () => {
  const screenOf = (name: string, line: string) =>
    [
      "import { Image, screen } from 'tentjs/ui'",
      '',
      `export const ${name} = screen('${name}', {`,
      `  path: '/${name}',`,
      "  access: 'signedIn',",
      line,
      '})',
      '',
    ].join('\n')
  const folder = projectOf('kinds-of-address', {
    'tent.ts': shop,
    'functions/users.ts': ["import { list, table, text } from 'tentjs'", '', users].join('\n'),
    'screens/picture.tsx': screenOf(
      'picture',
      '  view: () => <Image src="javascript:alert(1)" alt="A picture" width={10} height={10} />,',
    ),
    'screens/headed.tsx': screenOf(
      'headed',
      "  head: [{ link: { rel: 'alternate', href: 'javascript:alert(1)' } }],\n  view: () => <main>headed</main>,",
    ),
  })
  await finds(folder, 'T6013', 'picture')
  await finds(folder, 'T6013', 'headed')
})

/** A project of one screen kept as `public`, whose file is written by the test. */
const publicScreen = (name: string, file: string): string =>
  projectOf(name, {
    'tent.ts': shop,
    'functions/users.ts': ["import { list, table, text } from 'tentjs'", '', users].join('\n'),
    'screens/front.tsx': file,
  })

test('[32-11] T6030: a screen kept as `public` whose view calls `useUser`', async () => {
  const folder = publicScreen(
    'public-use-user',
    [
      "import { screen, useUser } from 'tentjs/ui'",
      '',
      "export const front = screen('front', {",
      "  path: '/',",
      "  access: 'anyone',",
      '  cache: { for: 60_000, public: true },',
      '  view: () => {',
      '    const me = useUser()',
      "    return <main>{me ? 'hello' : 'welcome'}</main>",
      '  },',
      '})',
      '',
    ].join('\n'),
  )
  await finds(folder, 'T6030', 'front')
})

test("[26-6] [15-1@9a] T7003: `countBy: 'app'` on a kind of worker that states `perCallerPerDay`", async () => {
  const folder = projectOf('kind-count-by', {
    'tent.ts': [
      "import { project } from 'tentjs'",
      '',
      "export const shop = project('shop', {",
      "  title: 'Shop',",
      "  workers: { gpu: { countBy: 'app', limits: { perCallerPerDay: { workSeconds: 60 } } } },",
      '})',
      '',
    ].join('\n'),
    'functions/users.ts': ["import { list, table, text } from 'tentjs'", '', users].join('\n'),
  })
  await finds(folder, 'T7003')
})

test('[32-11] T6030: a screen kept as `public` that uses a component which reads `user` and does not state `personal: true`', async () => {
  const folder = publicScreen(
    'public-component',
    [
      "import { component, screen } from 'tentjs/ui'",
      '',
      "export const Greeting = component('Greeting', {",
      "  view: ({ user }) => <span>{user ? user.id : 'welcome'}</span>,",
      '})',
      '',
      "export const front = screen('front', {",
      "  path: '/',",
      "  access: 'anyone',",
      '  cache: { for: 60_000, public: true },',
      '  view: () => (',
      '    <main>',
      '      <Greeting />',
      '    </main>',
      '  ),',
      '})',
      '',
    ].join('\n'),
  )
  await finds(folder, 'T6030', 'front')
})
