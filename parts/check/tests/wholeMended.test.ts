import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkRules } from '../ours.ts'
import { copyOf, lineWith } from './copies.ts'

test('[30-7] T6013: an `href` of `then` worked out from a text that starts with a path of the app, and not one worked out from an address of another site', async () => {
  const folder = copyOf(join('T6013', 'pass'), 'T6013-worked-href')
  const text = [
    "import { Form, screen } from 'tentjs/ui'",
    "import { addOrder } from '../functions/orders'",
    '',
    "export const movedScreen = screen('movedScreen', {",
    "  path: '/moved',",
    "  access: 'signedIn',",
    '  view: () => {',
    "    const id = 'one'",
    '    return (',
    '      <div>',
    `        <Form call={addOrder} then={{ href: \`/orders/\${id}\` }}>`,
    '          <button type="submit">Here</button>',
    '        </Form>',
    "        <Form call={addOrder} then={{ href: '/orders/' + id }}>",
    '          <button type="submit">Here too</button>',
    '        </Form>',
    `        <Form call={addOrder} then={{ href: \`https://example.com/orders/\${id}\` }}>`,
    '          <button type="submit">There</button>',
    '        </Form>',
    '      </div>',
    '    )',
    '  },',
    '})',
    '',
  ].join('\n')
  writeFileSync(join(folder, 'screens', 'moved.tsx'), text)
  const { findings } = await checkRules(folder)
  assert.deepEqual(
    findings.map((one) => [one.code, one.where?.file, one.where?.line, /goTo/.test(one.fix ?? '')]),
    [
      ['T6013', 'screens/moved.tsx', lineWith(text, 'href: `/orders/'), true],
      ['T6013', 'screens/moved.tsx', lineWith(text, "href: '/orders/' + id"), true],
    ],
    findings.map((one) => `${one.code} ${one.where?.line} ${one.message}`).join('\n'),
  )
})

test('[15-1@4] T3004: `for` on a call of a service, and a user handed to `connections` or `grants`, in an action that states no `system`, and not in one that does', async () => {
  const fileOf = (system: string[]): string =>
    [
      "import { action, post, secret, service, text } from 'tentjs'",
      '',
      "export const slack = service('slack', {",
      "  url: 'https://slack.com/api',",
      "  auth: { bearer: secret('SLACK_TOKEN') },",
      "  calls: { postMessage: post('/chat.postMessage', { input: { channel: text(), text: text() } }) },",
      '})',
      '',
      "export const tell = action('tell', {",
      "  access: 'signedIn',",
      ...system,
      '  input: { user: text() },',
      '  run: async ({ input, connections, grants }) => {',
      "    await slack.postMessage({ channel: 'news', text: 'hello' }, { for: input.user })",
      '    connections.list(input.user)',
      '    grants.list(input.user)',
      '    await connections.end(slack, { user: input.user })',
      '    connections.list()',
      "    await slack.postMessage({ channel: 'news', text: 'hello' })",
      '  },',
      '})',
      '',
    ].join('\n')
  const folder = copyOf(join('T3004', 'functions', 'pass'), 'T3004-for-and-user')
  const text = fileOf([])
  writeFileSync(join(folder, 'functions', 'tell.ts'), text)
  const { findings } = await checkRules(folder)
  assert.deepEqual(
    findings.map((one) => [one.code, one.where?.definition, one.where?.line]),
    [
      ['T3004', 'tell', lineWith(text, '{ for: input.user }')],
      ['T3004', 'tell', lineWith(text, 'connections.list(input.user)')],
      ['T3004', 'tell', lineWith(text, 'grants.list(input.user)')],
      ['T3004', 'tell', lineWith(text, 'connections.end(slack, { user')],
    ],
    findings.map((one) => `${one.code} ${one.where?.line} ${one.message}`).join('\n'),
  )
  writeFileSync(join(folder, 'functions', 'tell.ts'), fileOf(["  system: 'tells the news for any user',"]))
  assert.deepEqual((await checkRules(folder)).findings, [])
})

test('[15-1@4] [15-1@7b] T3004: a route that states no `system`, and a flow that runs as its starter, each using full access and waiting for a flow that has it', async () => {
  const cases: [string, string, [string, string][]][] = [
    [
      'routes',
      'functions/feed.ts',
      [
        ['feed', 'db.system.notes.count'],
        ['tidyNow', 'await tidy()'],
      ],
    ],
    [
      'starters',
      'flows/tidy.ts',
      [
        ['tidy', 'db.system.notes.count'],
        ['tidy', '() => sweep()'],
      ],
    ],
  ]
  for (const [name, file, places] of cases) {
    const folder = copyOf(join('T3004', name, 'fail'), `T3004-${name}-cases`)
    const text = readFileSync(join(folder, file), 'utf8')
    const { findings } = await checkRules(folder)
    assert.deepEqual(
      findings.map((one) => [one.code, one.where?.file, one.where?.definition, one.where?.line]),
      places.map(([definition, piece]) => ['T3004', file, definition, lineWith(text, piece)]),
      findings.map((one) => `${one.code} ${one.where?.line} ${one.message}`).join('\n'),
    )
    const passing = await checkRules(copyOf(join('T3004', name, 'pass'), `T3004-${name}-passing`))
    assert.deepEqual(passing.findings, [], name)
  }
})

test('[16-2] T2005: a link that names a table which the project does not hold, in an argument of a command and in the input of a call of a service', async () => {
  const folder = copyOf(join('T3004', 'functions', 'pass'), 'T2005-command-service')
  mkdirSync(join(folder, 'commands'))
  writeFileSync(
    join(folder, 'commands', 'greet.ts'),
    [
      "import { command, link } from 'tentjs/cli'",
      '',
      "export const greet = command('greet', {",
      "  about: 'Greets a person',",
      "  args: { person: link('people') },",
      '  run: async ({ terminal }) => {',
      "    terminal.write('hello')",
      '  },',
      '})',
      '',
    ].join('\n'),
  )
  writeFileSync(
    join(folder, 'functions', 'slack.ts'),
    [
      "import { link, post, secret, service } from 'tentjs'",
      '',
      "export const slack = service('slack', {",
      "  url: 'https://slack.com/api',",
      "  auth: { bearer: secret('SLACK_TOKEN') },",
      "  calls: { postMessage: post('/chat.postMessage', { input: { channel: link('channels') } }) },",
      '})',
      '',
    ].join('\n'),
  )
  const { findings } = await checkRules(folder)
  assert.deepEqual(
    findings.map((one) => [one.code, one.where?.definition, /`(people|channels)`/.exec(one.message)?.[1]]).sort(),
    [
      ['T2005', 'greet', 'people'],
      ['T2005', 'slack', 'channels'],
    ],
    findings.map((one) => `${one.code} ${one.message}`).join('\n'),
  )
})

test('[32-11] T6030: a screen kept as `public` that uses a personal part which reads `user`, or names a `user` of its own, is no warning', async () => {
  const folder = copyOf(join('T6030', 'pass'), 'T6030-personal-own')
  writeFileSync(
    join(folder, 'screens', 'front.tsx'),
    [
      "import { component, screen } from 'tentjs/ui'",
      '',
      "export const Greeting = component('Greeting', {",
      '  personal: true,',
      "  view: ({ user }) => <span>{user ? user.id : 'welcome'}</span>,",
      '})',
      '',
      "export const front = screen('front', {",
      "  path: '/',",
      "  access: 'anyone',",
      '  cache: { for: 60_000, public: true },',
      '  view: () => {',
      "    const user = { name: 'a guest' }",
      '    return (',
      '      <main>',
      '        <Greeting /> {user.name}',
      '      </main>',
      '    )',
      '  },',
      '})',
      '',
    ].join('\n'),
  )
  const { findings } = await checkRules(folder)
  assert.deepEqual(
    findings.map((one) => `${one.code} ${one.message}`),
    [],
  )
})

test('[12-3b] T4005: an `async` arrow handed to `each` in the view of a component', async () => {
  const folder = copyOf(join('T6030', 'pass'), 'T4005-each-in-view')
  writeFileSync(
    join(folder, 'screens', 'tags.tsx'),
    [
      "import { component, each } from 'tentjs/ui'",
      '',
      "export const Tags = component('Tags', {",
      "  view: () => <span>{String(each(['a', 'b'], async (one) => one))}</span>,",
      '})',
      '',
    ].join('\n'),
  )
  const { findings } = await checkRules(folder)
  assert.deepEqual(
    findings.map((one) => [one.code, one.where?.definition, /`view` of a component/.test(one.message)]),
    [['T4005', 'Tags', true]],
    findings.map((one) => `${one.code} ${one.message}`).join('\n'),
  )
})

test('[32-7] T6007: a redirect from the address of a screen, a second redirect from one address, and a redirect from the address of a route that states `GET`', async () => {
  const folder = copyOf(join('T6007', 'redirects', 'fail'), 'T6007-redirects-cases')
  const text = readFileSync(join(folder, 'tent.ts'), 'utf8')
  const { findings } = await checkRules(folder)
  assert.deepEqual(
    findings.map((one) => [one.code, one.where?.file, one.where?.line]),
    [
      ['T6007', 'tent.ts', lineWith(text, "from: '/orders/:order'")],
      ['T6007', 'tent.ts', lineWith(text, "to: '/orders/two'")],
      ['T6007', 'tent.ts', lineWith(text, "from: '/feed'")],
    ],
    findings.map((one) => `${one.code} ${one.where?.line} ${one.message}`).join('\n'),
  )
  assert.match(findings[0].message, /orderScreen/)
  assert.match(findings[2].message, /readFeed/)
  const passing = await checkRules(copyOf(join('T6007', 'redirects', 'pass'), 'T6007-redirects-passing'))
  assert.deepEqual(passing.findings, [])
})
