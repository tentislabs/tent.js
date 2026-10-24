import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  action,
  input,
  link,
  model,
  number,
  object,
  post,
  project,
  python,
  service,
  table,
  text,
  vector,
} from '../index.ts'
import { checkDescription, describe } from '../internal.ts'

const run = async () => undefined
const access = 'signedIn'

/** Describes definitions, and answers the description with the codes that were found. */
function described(definitions: object[]) {
  const { description, findings } = describe({ definitions: definitions.map((value) => ({ value })) })
  return { description, codes: findings.map((one) => `${one.code} ${one.message}`) }
}

test('[51-1] the options of heavy work are stored as the format gives them, and an action that states worker with an input field run is refused', () => {
  const shop = project('shop', {
    workers: {
      gpu: {
        about: 'A machine with a graphics card',
        atOnce: 4,
        wait: '20 minutes',
        queue: 100,
        order: 'oldest',
        turns: 'caller',
        place: 'pack',
        loaded: 'no',
        alone: false,
        idleAfter: '5 minutes',
        mayStop: true,
        lost: 2,
        next: { kind: 'gpuSpot', after: ['lost', 'wait', 'memory'] },
        orHere: 'busy',
        outside: { services: 'writer', models: 'writer' },
        systemWork: false,
        limits: {
          perDay: { workSeconds: 3600, machineSeconds: 7200 },
          perCallerPerDay: { workSeconds: 60 },
          atLimit: 'fail',
        },
        countBy: 'app',
      },
      // What is left out of a kind is left out of its record, and so is what equals what holds when it is left out.
      gpuSpot: {
        wait: '15 minutes',
        order: 'waited',
        place: 'spread',
        loaded: 'first',
        idleAfter: '2 minutes',
        lost: 10,
        mayStop: false,
        outside: 'writer',
      },
      any: { orHere: true },
    },
  })
  const hooks = service('hooks', { url: 'https://hooks.example.com', calls: { status: post('/status') } })
  const embedder = model('embedder', { provider: 'openai', name: 'text-embedding-3-small', abilities: ['embed'] })
  const summarize = action('summarize', {
    access,
    system: 'fills a column for every reader',
    input: { text: text() },
    output: object({ short: text() }),
    run: async () => ({ short: '' }),
  })
  const notes = table('notes', {
    columns: {
      team: link('teams'),
      title: text(),
      body: text(),
      summary: text({ optional: true, by: summarize }),
      short: text({
        optional: true,
        old: 'keep',
        by: {
          work: summarize,
          input: { text: 'body' },
          take: 'short',
          version: 'v2',
          debounce: '10 seconds',
          tries: 5,
          order: 'oldest',
          limits: { perMinute: 600, perDay: { tokensIn: 5_000_000 }, atLimit: 'wait' },
        },
      }),
      plain: text({ optional: true, by: { work: 'summarize', debounce: '5 seconds', tries: 3, order: 'missing' } }),
      meaning: vector({ size: 1536, model: embedder, by: 'body', old: 'drop' }),
      wide: vector({ size: 1536, model: embedder, by: { columns: ['title', 'body'], batch: 64, version: 'v3' } }),
      both: vector({ size: 1536, model: embedder, by: ['title', 'body'] }),
    },
  })
  const encode = action('encode', {
    access,
    input: { note: link('notes') },
    worker: 'gpu',
    batch: { max: 600, wait: '2 seconds', measure: 'note', split: true },
    remember: { for: '30 days', kind: false, version: 'v2', shared: 'the same for everyone who may read the note' },
    rows: { notes: notes.where({ id: input('note') }).pick(['body']) },
    uses: [summarize, hooks.status, { definition: 'mail.send' }],
    limits: {
      time: '2 hours',
      try: '20 minutes',
      reserve: '10 minutes',
      lost: 5,
      perDay: { workSeconds: 3600 },
      atLimit: 'wait',
      runKept: '2 hours',
    },
    changes: false,
    callerGone: 'stop',
    follow: access,
    run,
  })
  // `background: true` says what `worker: 'any'` says, and each is stored as it was written.
  const quiet = action('quiet', {
    access,
    background: true,
    batch: { max: 8 },
    remember: true,
    callerGone: 'goOn',
    run,
  })
  const here = action('here', { access, background: 'here', run })
  const any = action('any', { access, worker: 'any', run })
  const churn = python('churn', {
    file: 'ml/churn.py',
    input: {},
    output: number(),
    access,
    worker: 'gpu',
    batch: { max: 32 },
    remember: { shared: 'why' },
    uses: [hooks.status],
    changes: false,
    callerGone: 'stop',
  })
  const { description, codes } = described([shop, hooks, embedder, summarize, notes, encode, quiet, here, any, churn])
  assert.deepEqual(codes, [])
  assert.deepEqual(checkDescription(description), [])

  assert.deepEqual(description.project.workers, {
    gpu: {
      about: 'A machine with a graphics card',
      atOnce: 4,
      wait: 1_200_000,
      queue: 100,
      order: 'oldest',
      turns: 'caller',
      place: 'pack',
      loaded: 'no',
      alone: false,
      idleAfter: 300_000,
      mayStop: true,
      lost: 2,
      next: { kind: 'gpuSpot', after: ['lost', 'wait', 'memory'] },
      orHere: 'busy',
      outside: { services: 'writer', models: 'writer' },
      systemWork: false,
      limits: {
        perDay: { workSeconds: 3600, machineSeconds: 7200 },
        perCallerPerDay: { workSeconds: 60 },
        atLimit: 'fail',
      },
      countBy: 'app',
    },
    gpuSpot: { outside: 'writer' },
    any: { orHere: true },
  })
  assert.deepEqual(description.functions.encode, {
    kind: 'action',
    form: 'code',
    export: 'encode',
    input: { note: { kind: 'link', table: 'notes' } },
    access: { rule: 'signedIn' },
    worker: 'gpu',
    batch: { max: 600, wait: 2000, measure: 'note', split: true },
    remember: { for: 2_592_000_000, kind: false, version: 'v2', shared: 'the same for everyone who may read the note' },
    rows: { notes: { from: 'notes', where: { col: 'id', is: { input: 'note' } }, pick: ['body'] } },
    uses: ['summarize', 'hooks.status', 'mail.send'],
    changes: false,
    callerGone: 'stop',
    follow: { rule: 'signedIn' },
    limits: {
      time: 7_200_000,
      try: 1_200_000,
      reserve: 600_000,
      runKept: 7_200_000,
      lost: 5,
      perDay: { workSeconds: 3600 },
      atLimit: 'wait',
    },
  })
  const less = (name: string) => {
    const { kind: _kind, form: _form, export: _export, access: _access, ...rest } = description.functions[name]
    return rest
  }
  assert.deepEqual(less('quiet'), { background: true, batch: { max: 8 }, remember: true })
  assert.deepEqual(less('here'), { background: 'here' })
  assert.deepEqual(less('any'), { worker: 'any' })
  assert.deepEqual(less('churn'), {
    output: { kind: 'number' },
    worker: 'gpu',
    batch: { max: 32 },
    remember: { shared: 'why' },
    uses: ['hooks.status'],
    changes: false,
    callerGone: 'stop',
    python: { file: 'ml/churn.py' },
  })

  const columns = Object(description.tables.notes.columns)
  assert.deepEqual(columns.summary, { kind: 'text', optional: true, by: { work: 'summarize' } })
  assert.deepEqual(columns.short, {
    kind: 'text',
    optional: true,
    old: 'keep',
    by: {
      work: 'summarize',
      input: { text: 'body' },
      take: 'short',
      debounce: 10_000,
      tries: 5,
      order: 'oldest',
      version: 'v2',
      limits: { perMinute: 600, perDay: { tokensIn: 5_000_000 }, atLimit: 'wait' },
    },
  })
  assert.deepEqual(columns.plain, { kind: 'text', optional: true, by: { work: 'summarize' } })
  assert.deepEqual(columns.meaning, {
    kind: 'vector',
    size: 1536,
    model: 'embedder',
    old: 'drop',
    by: { columns: ['body'] },
  })
  assert.deepEqual(columns.wide, {
    kind: 'vector',
    size: 1536,
    model: 'embedder',
    by: { columns: ['title', 'body'], batch: 64, version: 'v3' },
  })
  assert.deepEqual(columns.both, { kind: 'vector', size: 1536, model: 'embedder', by: { columns: ['title', 'body'] } })

  // A step of a body states the same options, and its lengths are stored in milliseconds.
  const step = (time: unknown, reserve: unknown) => ({
    do: {
      await: {
        fn: 'step',
        args: [
          'encode',
          { arrow: [], do: [] },
          {
            object: [
              ['worker', 'gpuSpot'],
              ['time', time],
              ['reserve', reserve],
              ['remember', { object: [['key', [{ name: ['input', 'note'] }]]] }],
            ],
          },
        ],
      },
    },
  })
  const flowed = describe({
    definitions: [
      { value: shop },
      { value: action('steps', { access, run }), bodies: { run: [step('2 hours', '20 minutes')] } },
    ],
  })
  assert.deepEqual(flowed.description.functions.steps.body, [step(7_200_000, 1_200_000)])
  assert.deepEqual(checkDescription(flowed.description), [])

  // An action, and a `python`, that states `worker` or `background` may hold no input field named `run`.
  const fields = { run: text() }
  const refused: [string, object][] = [
    ['an action that states worker', action('a', { access, worker: 'gpu', input: fields, run })],
    ['an action that states background', action('a', { access, background: true, input: fields, run })],
    ['an action that states background here', action('a', { access, background: 'here', input: fields, run })],
    [
      'a python that states worker',
      python('a', { file: 'a.py', input: fields, output: number(), access, worker: 'gpu' }),
    ],
  ]
  for (const [what, definition] of refused) {
    const found = described([shop, definition]).codes
    assert.deepEqual(
      found,
      ['T1009 a: the input field `run` is reserved for an action that states `worker` or `background`.'],
      what,
    )
  }
  assert.deepEqual(described([shop, action('a', { access, input: fields, run })]).codes, [])
  assert.deepEqual(described([shop, action('a', { access, background: false, input: fields, run })]).codes, [])

  // `by` and `old` belong to a column: on an input each is T1003, and so is `old` on a column that states no `by`.
  const asInput = (type: object) =>
    described([shop, action('a', { access, input: { v: Object.assign(text(), type) }, run })]).codes
  assert.match(asInput({ by: 'summarize' })[0], /^T1003 a: input\.v, a `text`, has no option `by`/)
  assert.match(asInput({ old: 'keep' })[0], /^T1003 a: input\.v, a `text`, has no option `old`/)
  const alone = described([shop, table('t', { columns: { a: text({ optional: true, old: 'drop' }) } })]).codes
  assert.match(alone[0], /^T1003 t: columns\.a, a `text`, has no option `old`/)
  assert.equal(alone.length, 1)
})
