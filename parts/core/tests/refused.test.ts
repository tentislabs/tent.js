import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Type } from '../index.ts'
import {
  action,
  asset,
  agent,
  boolean,
  calc,
  change,
  choice,
  col,
  date,
  dayOf,
  earlier,
  file,
  flow,
  input,
  json,
  later,
  link,
  lower,
  model,
  number,
  project,
  query,
  round,
  secret,
  seed,
  service,
  table,
  text,
  vector,
  where,
  concat,
} from '../index.ts'
import { checkDescription, describe } from '../internal.ts'

const shop = project('shop', {})
const run = async () => undefined
const access = 'signedIn'

/** Describes definitions that are held in memory, and answers the description with each finding as its code and its words. */
function described(definitions: object[], bodies: Record<string, object[]> = {}) {
  const { description, findings } = describe({
    definitions: definitions.map((value) => {
      const body = bodies[String(Reflect.get(value, 'definition'))]
      return body ? { value, bodies: { run: body } } : { value }
    }),
  })
  return { description, found: findings.map((one) => `${one.code} ${one.message}`) }
}

const codesOf = (found: string[]): string[] => found.map((one) => one.slice(0, 5)).sort()

test('[13-5] the values of a write are held by their columns: a column named from, input or caller is a column', () => {
  const trips = table('trips', { columns: { from: text(), to: text() } })
  const izmir = table('izmir', { columns: { team: link('teams') }, tenant: 'team' })
  const teams = table('teams', { columns: { name: text() } })
  const forms = table('forms', { columns: { input: text(), caller: text(), col: text() } })
  const addTrip = change('addTrip', { access, set: trips.add({ from: 'Izmir', to: 'Ankara' }) })
  const moveTrip = change('moveTrip', { access, set: trips.change(input('trip'), { from: input('from') }) })
  const { description, found } = described([
    shop,
    trips,
    izmir,
    teams,
    forms,
    addTrip,
    moveTrip,
    seed([forms.add({ input: 'a', caller: 'b', col: 'c' }), trips.add({ from: 'izmir', to: 'x' })]),
  ])
  assert.deepEqual(found, [])
  assert.deepEqual(description.functions.addTrip, {
    kind: 'change',
    form: 'plain',
    access: { rule: 'signedIn' },
    writes: [{ add: 'trips', values: { from: 'Izmir', to: 'Ankara' } }],
    touches: ['trips'],
  })
  assert.equal(Reflect.get(description.functions.addTrip, 'reads'), undefined)
  assert.deepEqual(description.seed, {
    writes: [
      { add: 'forms', values: { input: 'a', caller: 'b', col: 'c' } },
      { add: 'trips', values: { from: 'izmir', to: 'x' } },
    ],
  })
  assert.deepEqual(checkDescription(description), [])
  // What a value of a column holds is still held: a plan, and a reference where none may stand.
  const planned = change('planned', { access, set: trips.add({ from: Object(trips.where({ to: 'x' })), to: 'y' }) })
  assert.match(described([shop, trips, planned]).found[0], /^T1014 planned: `set` holds a plan where a value stands/)
  const asked = described([shop, forms, seed([forms.add({ input: input('x'), caller: 'b', col: 'c' })])]).found
  assert.match(asked[0], /^T1014 seed: the starter data holds `input`/)
  assert.equal(asked.length, 1)
})

test('[13-5] a column with from: what it may hold, when its column is optional, the type of its result, and no plain write of it', () => {
  const customers = table('customers', { columns: { name: text() } })
  const lines = (columns: Record<string, object>) =>
    codesOf(
      described([
        shop,
        customers,
        table('lines', {
          columns: {
            net: number(),
            rate: number({ optional: true }),
            title: text(),
            at: date(),
            owner: link('customers'),
            ...columns,
          },
        }),
      ]).found,
    )
  const stored = described([
    shop,
    table('lines', {
      columns: {
        net: number(),
        rate: number({ optional: true }),
        title: text(),
        at: date(),
        gross: number({ from: calc('*', col('net'), 1.2) }),
        rounded: number({ from: round(col('net'), 1) }),
        withRate: number({ from: calc('*', col('net'), col('rate')), optional: true }),
        share: number({ from: calc('/', col('net'), 4), optional: true }),
        label: text({ from: concat(col('title'), ' ', col('net')) }),
        small: text({ from: lower(col('title')) }),
        day: text({ from: dayOf(col('at'), 'Europe/Istanbul') }),
        late: boolean({ from: calc('>', col('net'), 100) }),
        loose: json({ from: col('net') }),
      },
    }),
  ])
  assert.deepEqual(stored.found, [])
  const columns = Object(stored.description.tables.lines.columns)
  assert.deepEqual(columns.gross, { kind: 'number', from: { calc: '*', left: { col: 'net' }, right: 1.2 } })
  assert.deepEqual(columns.share, {
    kind: 'number',
    optional: true,
    from: { calc: '/', left: { col: 'net' }, right: 4 },
  })
  assert.deepEqual(columns.label, { kind: 'text', from: { concat: [{ col: 'title' }, ' ', { col: 'net' }] } })

  // Another column with `from`, and a column through a link.
  assert.deepEqual(lines({ gross: number({ from: col('net') }), twice: number({ from: col('gross') }) }), ['T1014'])
  assert.deepEqual(lines({ buyer: text({ from: col('owner.name') }) }), ['T1014'])
  // A `from` that names an optional column, or that divides or takes a remainder, makes its column optional.
  assert.deepEqual(lines({ withRate: number({ from: calc('*', col('net'), col('rate')) }) }), ['T1014'])
  assert.deepEqual(lines({ share: number({ from: calc('/', col('net'), 4) }) }), ['T1014'])
  assert.deepEqual(lines({ left: number({ from: round(calc('%', col('net'), 4)) }) }), ['T1014'])
  // A result that is not of the type of its column.
  assert.deepEqual(lines({ gross: number({ from: concat(col('net'), '!') }) }), ['T1014'])
  assert.deepEqual(lines({ label: text({ from: round(col('net')) }) }), ['T1014'])
  assert.deepEqual(lines({ late: boolean({ from: col('title') }) }), ['T1014'])
  assert.deepEqual(lines({ gross: number({ from: 'a text' }) }), ['T1014'])
  // A column with `from` is worked out by the store, and no plain write names it.
  const totals = table('totals', { columns: { net: number(), gross: number({ from: calc('*', col('net'), 1.2) }) } })
  const set = change('set', { access, set: totals.add({ net: 1, gross: 2 }) })
  const writes = described([shop, totals, set, seed([totals.change('t1', { gross: 3 })])]).found
  assert.deepEqual(codesOf(writes), ['T1014', 'T1014'])
  assert.match(writes[0], /^T1014 set: `set` writes the column `gross` of totals, which states `from`/)
  assert.deepEqual(described([shop, totals, change('set', { access, set: totals.add({ net: 1 }) })]).found, [])
})

test('[11-6] the tools of an agent are held to the reserved names, by the name each is told under', () => {
  const writer = model('writer', { provider: 'anthropic', name: 'claude' })
  const tool = (name: string) => query(name, { access, about: 'a tool', run: () => 1 })
  const helper = (more: object, tools: unknown[]) =>
    Object.assign(
      agent('helper', {
        model: writer,
        instructions: 'Help.',
        tools: [],
        limits: { steps: 4, perRun: { tokensOut: 1000 } },
      }),
      {
        options: {
          model: writer,
          instructions: 'Help.',
          tools,
          limits: { steps: 4, perRun: { tokensOut: 1000 } },
          ...more,
        },
      },
    )
  // The longest a sequence may work between two of its steps is 5 seconds where it is left out.
  const passes = (pass: string) =>
    Object(
      described([shop, writer, helper({ limits: { steps: 4, perRun: { tokensOut: 1000 }, pass } }, [])]).description
        .flows.helper.agent,
    ).limits
  assert.deepEqual(passes('5 seconds'), { steps: 4, perRun: { tokensOut: 1000 } })
  assert.deepEqual(passes('2 seconds'), { steps: 4, perRun: { tokensOut: 1000 }, pass: 2000 })
  const names = ['call', 'sequence', 'all', 'fill', 'fail', 'sum', 'later', 'each', 'concat']
  const found = (more: object, told: (name: string) => unknown = (name) => tool(name)) =>
    described([shop, writer, ...names.map(tool), helper(more, names.map(told))]).found.filter((one) =>
      one.startsWith('T1009 helper:'),
    )
  // With tool calls alone no name is reserved.
  assert.deepEqual(found({}), [])
  assert.deepEqual(found({ tell: 'tools' }), [])
  // Told as a list, `call` and `sequence` are names of the engine.
  assert.equal(found({ tell: 'list' }).length, 2)
  assert.match(found({ tell: 'list' })[0], /the tool `call` is told under a name that is reserved/)
  // With a sequence, so is every name that a sequence may hold beside its tools.
  assert.equal(found({ sequence: true }).length, names.length)
  assert.equal(found({ tell: 'list', sequence: true }).length, names.length)
  // The type words of a sequence are names of it too.
  const types = ['text', 'number', 'boolean', 'date', 'day', 'choice', 'list', 'object']
  const typed = (more: object) =>
    described([shop, writer, ...types.map(tool), helper(more, types.map(tool))]).found.filter((one) =>
      one.startsWith('T1009 helper:'),
    )
  assert.equal(typed({ sequence: true }).length, types.length)
  assert.deepEqual(typed({ tell: 'list' }), [])
  // The way out is `name` of its entry, and a name that is given there is held too.
  assert.deepEqual(
    found({ tell: 'list', sequence: true }, (name) => ({ tool: tool(name), name: `${name}Tool` })),
    [],
  )
  const renamed = described([
    shop,
    writer,
    tool('totals'),
    helper({ sequence: true }, [{ tool: tool('totals'), name: 'sum' }]),
  ]).found
  assert.deepEqual(codesOf(renamed), ['T1009'])
})

test('[13-5] a written zone of dayOf and a written length of later and of earlier are held wherever a stored value holds their record', () => {
  const events = table('events', {
    columns: {
      at: date(),
      day: text({ from: dayOf(col('at'), 'Mars/Phobos') }),
      good: text({ from: dayOf(col('at'), 'Asia/Tokyo') }),
      zoned: text({ from: dayOf(col('at'), col('at')) }),
    },
  })
  const soon = query('soon', {
    access,
    input: { at: date(), length: text() },
    rows: events
      .where({ at: { before: later(input<Date>('at'), '7 dayz') } })
      .limit(calc('+', 1, 1))
      .skip(0),
  })
  const fine = query('fine', {
    access,
    input: { at: date(), length: text() },
    rows: events.where({
      at: { before: later(input<Date>('at'), input('length')), after: earlier(input<Date>('at'), '1.5 hours') },
    }),
  })
  const old = change('old', {
    access,
    input: { at: date() },
    set: events.add({ at: earlier(input<Date>('at'), 'a while') }),
  })
  const guarded = table('guarded', {
    columns: { at: date() },
    access: { read: where({ at: { after: earlier(input<Date>('now'), '3 fortnights') } }) },
  })
  const inBody = [
    { const: 'due', value: { fn: 'later', args: [{ name: ['now'] }, '2 weekz'] } },
    { return: { fn: 'dayOf', args: [{ name: ['due'] }, 'Nowhere/City'] } },
  ]
  const { found } = described([shop, events, soon, fine, old, guarded, query('body', { access, run: () => 1 })], {
    body: inBody,
  })
  assert.deepEqual(
    found.map((one) => one.replace(/: .*$/, '')),
    ['T1014 events', 'T1011 soon', 'T1011 old', 'T1011 guarded', 'T1011 body', 'T1014 body'],
  )
  assert.match(found[0], /`dayOf` names no time zone that the runtime knows: "Mars\/Phobos"/)
  assert.match(found[1], /`later` is handed no length of time: "7 dayz"/)
})

test('[13-5] a line of the head and a state of the project are held', () => {
  const headed = (head: object[]) =>
    codesOf(described([Object.assign(project('shop', {}), { options: { head } })]).found)
  const lines = [
    { meta: { name: 'theme-color', content: '#0f1115', media: '(prefers-color-scheme: dark)', property: 'og:x' } },
    { link: { rel: 'icon', href: asset('icon.svg'), type: 'image/svg+xml', sizes: 'any' } },
    { link: { rel: 'alternate', href: 'https://example.com/feed', hreflang: 'en', title: 'Feed', media: 'all' } },
    { link: { rel: 'preload', href: asset('a.woff2'), as: 'font', crossorigin: 'anonymous' } },
    { script: { src: 'https://js.example.com/a.js', async: true, defer: false, type: 'module' } },
    { script: { src: asset('count.js') } },
  ]
  const unlock = { scripts: ['https://js.example.com'] }
  const good = described([Object.assign(project('shop', {}), { options: { head: lines, unlock } })])
  assert.deepEqual(good.found, [])
  // The `src` of a script is an asset, or an address on a host that `unlock.scripts` lists.
  const scripted = (src: unknown, scripts?: string[]) =>
    described([
      Object.assign(project('shop', {}), { options: { head: [{ script: { src } }], unlock: scripts && { scripts } } }),
    ]).found
  const there = 'https://js.example.com/a.js'
  assert.deepEqual(scripted(there, ['https://js.example.com']), [])
  assert.deepEqual(scripted(there, ['https://other.example.com', 'js.example.com']), [])
  assert.deepEqual(scripted(asset('count.js')), [])
  for (const scripts of [
    undefined,
    [],
    ['https://other.example.com'],
    ['https://example.com'],
    ['http://js.example.com'],
  ])
    assert.match(
      String(scripted(there, scripts)[0]),
      /^T1014 shop: line 1 of `head` states a `src` on a host that `unlock.scripts` does not list/,
      JSON.stringify(scripts),
    )
  assert.deepEqual(codesOf(scripted('a.js', ['https://js.example.com'])), ['T1014'])
  assert.deepEqual(codesOf(scripted('//js.example.com/a.js', ['https://js.example.com'])), ['T1014'])
  assert.deepEqual(Object(good.description.project.head)[1], {
    link: { rel: 'icon', href: { asset: 'icon.svg' }, type: 'image/svg+xml', sizes: 'any' },
  })
  assert.deepEqual(checkDescription(good.description), [])
  for (const line of [
    { meta: { 'http-equiv': 'refresh', content: '0; url=https://example.com' } },
    { frame: {} },
    { meta: { name: 'a' }, link: { rel: 'icon' } },
    { link: { rel: 'stylesheet', href: 'https://example.com/a.css' } },
    { link: { rel: 'icon', onload: 'x' } },
    { script: { src: 'a.js', async: 'yes' } },
    { script: { src: 'a.js', integrity: 'x' } },
    { meta: { name: 5 } },
    { meta: 'theme-color' },
    'meta',
  ])
    assert.deepEqual(headed([Object(line)]), ['T1014'], JSON.stringify(line))

  const stated = (state: object) =>
    codesOf(described([Object.assign(project('shop', {}), { options: { state } })]).found)
  const kinds = { type: choice(['auto', 'dark'], { default: 'auto' }), in: 'device' }
  assert.deepEqual(
    stated({ mode: kinds, seen: { type: boolean(), in: 'device' }, n: { type: number({ default: 0 }), in: 'device' } }),
    [],
  )
  assert.deepEqual(
    stated({
      note: { type: text({ max: 100, optional: true }), in: 'device' },
      draft: { type: json({ optional: true }), in: 'browser' },
    }),
    [],
  )
  assert.deepEqual(stated({ plain: text({ optional: true }), open: { type: boolean() } }), [])
  // `'address'` is for a screen and a component, and `back` for a state that is kept in the address.
  const tab = text({ default: '' })
  assert.deepEqual(stated({ tab: { type: tab, in: 'address' } }), ['T1014'])
  assert.deepEqual(stated({ tab: { type: tab, back: true } }), ['T1014'])
  assert.deepEqual(stated({ tab: { type: tab, in: 'device', back: true } }), ['T1014', 'T1014'])
  // A cookie is small: a device state takes a boolean, a choice, a number, or a text of 100 characters at most.
  for (const type of [json(), text(), text({ max: 101 }), date(), file(), vector({ size: 3 }), link('users')])
    assert.deepEqual(stated({ kept: { type: { ...type, optional: true }, in: 'device' } }), ['T1014'], type.kind)
  assert.deepEqual(stated({ kept: { type: text({ optional: true }), in: 'nowhere' } }), ['T1014'])
})

test('[13-5] names: a column is held as a definition is, and a setting and a secret named then are reserved', () => {
  const named = (columns: Record<string, Type>) => described([shop, table('t', { columns })]).found
  assert.deepEqual(codesOf(named({ first_name: text(), Big: text(), 'a-b': text(), '9lives': text() })), [
    'T1013',
    'T1013',
    'T1013',
    'T1013',
  ])
  assert.match(named({ first_name: text() })[0], /^T1013 t: the name of the column `first_name` is not camelCase/)
  assert.deepEqual(named({ firstName: text(), a1: text(), from: text() }), [])
  // A reserved name of a column is T1009, and no T1013 beside it.
  assert.deepEqual(codesOf(named({ id: text() })), ['T1009'])

  const settings = project('shop', { settings: { then: { type: text() }, other: { type: text() } } })
  const set = described([settings]).found
  assert.deepEqual(codesOf(set), ['T1009'])
  assert.match(set[0], /^T1009 shop: the setting name `then` is reserved/)
  const hooks = service('hooks', { url: 'https://h.example', auth: { bearer: secret('then') } })
  const mailed = project('shop', { mail: { from: 'a@example.com', send: secret('then') } })
  const kept = described([mailed, hooks, model('m', { provider: 'openai', name: 'x', key: secret('then') })]).found
  assert.deepEqual(codesOf(kept), ['T1009', 'T1009', 'T1009'])
  assert.match(kept[0], /the secret name `then` is reserved/)
  assert.deepEqual(
    described([shop, service('ok', { url: 'https://h.example', auth: { bearer: secret('THEN') } })]).found,
    [],
  )
})

test('[51-1] alone of a kind of worker takes false or a whole number from 1 up, and a step of a body stores its lengths in milliseconds', () => {
  const kind = (alone: unknown) =>
    described([Object.assign(project('shop', {}), { options: { workers: { gpu: { alone } } } })])
  for (const alone of [false, 1, 3]) {
    const { description, found } = kind(alone)
    assert.deepEqual(found, [])
    assert.deepEqual(description.project.workers, { gpu: { alone } })
    assert.deepEqual(checkDescription(description), [])
  }
  for (const alone of [true, 0, 1.5, -1, 'one']) {
    const { found } = kind(alone)
    assert.deepEqual(codesOf(found), ['T1014'], String(alone))
    assert.match(found[0], /^T1014 shop: `workers\.gpu\.alone` takes false or a whole number of 1 or more/)
  }

  const step = (options: unknown[][]) => ({
    do: { await: { fn: 'step', args: ['encode', { arrow: [], do: [] }, { object: options }] } },
  })
  const written = step([
    ['worker', 'gpu'],
    ['time', '2 hours'],
    ['reserve', '20 minutes'],
    [
      'remember',
      {
        object: [
          ['key', [{ name: ['input', 'note'] }]],
          ['for', '30 days'],
          ['version', 'v2'],
        ],
      },
    ],
  ])
  const before = JSON.stringify(written)
  const flowed = described([shop, flow('steps', { run })], { steps: [{ if: true, then: [written] }, step([])] })
  assert.deepEqual(flowed.found, [])
  assert.deepEqual(flowed.description.flows.steps.body, [
    {
      if: true,
      then: [
        step([
          ['worker', 'gpu'],
          ['time', 7_200_000],
          ['reserve', 1_200_000],
          [
            'remember',
            {
              object: [
                ['key', [{ name: ['input', 'note'] }]],
                ['for', 2_592_000_000],
                ['version', 'v2'],
              ],
            },
          ],
        ]),
      ],
    },
    step([]),
  ])
  // What the build handed is left as it was.
  assert.equal(JSON.stringify(written), before)
  assert.deepEqual(checkDescription(flowed.description), [])
  // A length that is worked out stays as it is, a number is milliseconds, and a written one that does not read is T1011.
  const worked = step([
    ['time', { name: ['input', 'time'] }],
    ['reserve', 5000],
    ['remember', true],
  ])
  const kept = described([shop, action('a', { access, run })], { a: [worked] })
  assert.deepEqual([kept.found, kept.description.functions.a.body], [[], [worked]])
  const bad = described([shop, action('a', { access, run })], {
    a: [
      step([
        ['time', 'a while'],
        ['remember', { object: [['for', 'long']] }],
      ]),
    ],
  }).found
  assert.deepEqual(codesOf(bad), ['T1011', 'T1011'])
})

test('[11-1b] an unknown name in a part of the description is refused by describe, naming the name and the nearest real one', () => {
  const writer = model('writer', { provider: 'anthropic', name: 'claude' })
  const withOptions = (definition: object, options: object) => Object.assign(definition, { options })
  const inProject = (options: object) => [withOptions(project('shop', {}), options)]
  const helper = (more: object) => [
    shop,
    writer,
    withOptions(
      agent('helper', {
        model: writer,
        instructions: 'Help.',
        tools: [],
        limits: { steps: 4, perRun: { tokensOut: 9 } },
      }),
      { model: writer, instructions: 'Help.', tools: [], limits: { steps: 4, perRun: { tokensOut: 9 } }, ...more },
    ),
  ]
  const places: [string, object[], string, string][] = [
    ['unlock', inProject({ unlock: { script: [] } }), 'script', 'scripts'],
    ['python', inProject({ python: { versions: '3.13' } }), 'versions', 'version'],
    ['cli', inProject({ cli: { nam: 'shop' } }), 'nam', 'name'],
    ['images', inProject({ images: { width: [320] } }), 'width', 'widths'],
    ['cookies', inProject({ cookies: { domains: 'example.com' } }), 'domains', 'domain'],
    ['mcp', inProject({ mcp: { toolListed: 5 } }), 'toolListed', 'toolsListed'],
    ['api', inProject({ api: { header: [] } }), 'header', 'headers'],
    ['mail', inProject({ mail: { form: 'a@example.com' } }), 'form', 'from'],
    ['backups', inProject({ backups: { keeps: 3 } }), 'keeps', 'keep'],
    ['history', inProject({ history: { leaves: [] } }), 'leaves', 'leave'],
    ['publish', inProject({ publish: { healthy: 'ping' } }), 'healthy', 'health'],
    ['limits', inProject({ limits: { callSise: '1 MB' } }), 'callSise', 'callSize'],
    ['a kind of worker', inProject({ workers: { gpu: { atOnse: 2 } } }), 'atOnse', 'atOnce'],
    ['an entry of state', inProject({ state: { tab: { type: text(), ins: 'device' } } }), 'ins', 'in'],
    ['policy', helper({ policy: { reads: [] } }), 'reads', 'read'],
    ['words', helper({ words: { refuse: 'No.' } }), 'refuse', 'refused'],
    [
      'the access of a table',
      [
        shop,
        withOptions(table('t', { columns: { a: text() } }), { columns: { a: text() }, access: { reed: 'signedIn' } }),
      ],
      'reed',
      'read',
    ],
  ]
  for (const [what, definitions, name, nearest] of places) {
    const found = described(definitions).found.filter((one) => one.startsWith('T1003'))
    assert.equal(found.length, 1, `${what}: ${JSON.stringify(found)}`)
    assert.ok(
      found[0].includes(`has no option \`${name}\`. The nearest one is \`${nearest}\`.`),
      `${what}: ${found[0]}`,
    )
  }
})
