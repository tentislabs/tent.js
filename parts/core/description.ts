import { arrowsIn } from './arrows.ts'
import { checkInto } from './checked.ts'
import type { Finding } from './errors.ts'
import { TentError } from './errors.ts'
import { finding } from './finding.ts'
import { faultOf } from './itself.ts'
import { limitKind, limitNames } from './limits.ts'
import type { PlanRecord } from './plan.ts'
import type { Stored } from './record.ts'
import { calcSigns } from './signs.ts'
import type { Type } from './type.ts'
import { boolean } from './types/boolean.ts'
import { choice } from './types/choice.ts'
import { json } from './types/json.ts'
import { list } from './types/list.ts'
import { map } from './types/map.ts'
import { number } from './types/number.ts'
import { object } from './types/object.ts'
import { oneOf } from './types/oneOf.ts'
import { nameShape, ref, shapeOf } from './types/ref.ts'
import { text } from './types/text.ts'

/** The description: the plain-data picture of the whole app, in the format `tent.description/1`. */
export interface Description {
  format: string
  app: { name: string; needsEngine: string; dev?: true }
  project: Stored
  tables: Record<string, Stored>
  functions: Record<string, Stored>
  flows: Record<string, Stored>
  screens: Record<string, Stored>
  components: Record<string, Stored>
  services: Record<string, Stored>
  models: Record<string, Stored>
  routes: Record<string, Stored>
  incoming: Record<string, Stored>
  commands: Record<string, Stored>
  // A description that was written before backfills were holds none.
  backfills?: Record<string, Stored>
  messages: Record<string, Stored>
  seed?: Stored
  browser?: Stored
  server?: Stored
  cli?: Stored
  api?: Stored
  mcp?: Stored
  python?: Stored
  assets: Record<string, Stored>
  sources: Record<string, string>
  places: Record<string, Stored>
  packages?: Record<string, Stored>
}

/** A plan as it is stored. */
export type Plan = PlanRecord

type Fields = Record<string, Type>

const T = text()
const N = number()
// A number that is a length of time, in milliseconds, or a size, in bytes: text writes it in words, as `measureAt` says.
const TIME = number({ help: 'a length of time, in milliseconds' })
const SIZE = number({ help: 'a size, in bytes' })
const B = boolean()
const J = json()
const names = list(T)
const may = (type: Type): Type => ({ ...type, optional: true })

/** A record whose first fields must be there and whose other fields may be. A field that is not named is refused. */
const rec = (must: Fields, others: Fields = {}): Type =>
  object({ ...must, ...Object.fromEntries(Object.entries(others).map(([name, type]) => [name, may(type)])) })

/** A record all of whose fields may be left out. */
const some = (others: Fields): Type => rec({}, others)

const VALUE = may(ref('VALUE'))
const EXPR = may(ref('EXPR'))
const FILTER = ref('FILTER')
const PLAN = ref('PLAN')
const TYPE = ref('TYPE')
const RULE = ref('RULE')
const STATEMENT = ref('STATEMENT')
const body = list(STATEMENT)
const secret = rec({ secret: T })
const secretOrText = oneOf([T, secret])
const messageOrText = oneOf([T, rec({ message: T })])
const unitCounts = map(N)
const offer = list(choice(['api', 'mcp', 'cli']))
const asset = rec({ asset: T })
const anyoneRule = rec({ rule: choice(['anyone']), why: T })
const tiedTo = choice(['sqlite'])
// A store of files that the project names: one of the S3 protocol, its address as text or by a setting or a secret.
const fileStore = rec({
  s3: rec({ url: oneOf([T, secret, rec({ setting: T })]), bucket: T, key: secret }, { region: T }),
})
const atLimit = choice(['wait', 'fail'])

const sign = choice(calcSigns)

/** What a group works out for one of its names: a count, or a column summed up, averaged, or its least or most. */
const grouped = oneOf([rec({ count: B }), rec({ sum: T }), rec({ avg: T }), rec({ min: T }), rec({ max: T })])
const moduleOf = rec({}, { module: T, export: T })

nameShape(
  'TYPE',
  rec(
    {
      kind: choice([
        'text',
        'number',
        'boolean',
        'date',
        'day',
        'choice',
        'link',
        'file',
        'list',
        'object',
        'json',
        'vector',
      ]),
    },
    {
      min: N,
      max: N,
      pattern: T,
      lines: choice(['one', 'many']),
      secret: B,
      whole: B,
      values: names,
      messages: T,
      table: T,
      onRemove: choice(['refuse', 'remove', 'clear']),
      maxSize: SIZE,
      kinds: names,
      of: TYPE,
      shape: map(TYPE),
      size: N,
      model: T,
      old: choice(['drop', 'keep']),
      copy: choice(['small']),
      optional: B,
      default: oneOf([ref('VALUE'), rec({ today: B })]),
      label: messageOrText,
      help: messageOrText,
      unique: B,
      index: B,
      private: B,
      personal: B,
      sealed: B,
      was: names,
      from: VALUE,
      keeps: rec({ do: choice(['count', 'sum', 'min', 'max']), of: T, by: T }, { column: T, where: FILTER }),
      read: RULE,
      findable: B,
      by: some({
        work: T,
        input: map(T),
        take: T,
        columns: names,
        batch: N,
        debounce: TIME,
        tries: N,
        order: choice(['missing', 'oldest']),
        version: T,
        limits: some({ perMinute: N, perDay: unitCounts, atLimit: choice(['wait', 'fail']) }),
      }),
    },
  ),
)

nameShape(
  'RULE',
  oneOf([
    rec({ rule: choice(['nobody', 'signedIn', 'owner']) }),
    rec({ rule: choice(['role']), role: T }),
    rec({ rule: choice(['anyone']), why: T }),
    rec({ rule: choice(['where']) }, { module: T, export: T, filter: FILTER, as: names, give: EXPR }),
    rec({ rule: choice(['allow']) }, { module: T, export: T, as: names, test: EXPR }),
  ]),
)

const valueOperators = [
  'is',
  'above',
  'atLeast',
  'below',
  'atMost',
  'not',
  'in',
  'contains',
  'startsWith',
  'before',
  'after',
]

nameShape(
  'FILTER',
  oneOf([
    rec(
      { col: T },
      {
        ...Object.fromEntries(valueOperators.map((operator) => [operator, VALUE])),
        empty: B,
        filled: choice(['made', 'missing', 'old', 'failed']),
        given: B,
      },
    ),
    rec({ any: list(FILTER) }),
    rec({ all: list(FILTER) }),
    rec({ not: FILTER }),
  ]),
)

/** The forms of a value that both a form written with values and a body hold. */
const valueForms: Type[] = [
  T,
  N,
  B,
  rec({ input: T }),
  rec({ caller: T }),
  rec({ setting: T }),
  rec({ col: T }),
  rec({ now: B }),
  rec({ random: B }),
]

nameShape(
  'VALUE',
  oneOf([
    ...valueForms,
    list(VALUE),
    rec({ concat: list(VALUE) }),
    // An object the author wrote: its entries, each a key and its value.
    rec({ object: list(list(VALUE)) }),
    rec({ calc: sign, left: VALUE, right: VALUE }),
    rec({ fn: T }, { args: list(VALUE) }),
    PLAN,
  ]),
)

nameShape(
  'PLAN',
  rec(
    { from: T },
    {
      of: VALUE,
      where: FILTER,
      search: VALUE,
      with: names,
      sort: list(rec({ by: T }, { down: B })),
      limit: VALUE,
      skip: VALUE,
      after: VALUE,
      pick: names,
      one: choice(['get', 'first']),
      id: VALUE,
      count: B,
      history: B,
      group: rec({ by: names, values: map(grouped) }),
      near: rec({ col: T, value: VALUE }, { measure: choice(['straight']), within: VALUE }),
      rank: rec({ model: T, words: VALUE }, { top: VALUE }),
    },
  ),
)

const WRITE = oneOf([
  rec({ add: T, values: map(VALUE) }, { of: VALUE }),
  rec({ change: T, id: VALUE, values: map(VALUE) }, { of: VALUE }),
  rec({ remove: T, id: VALUE }, { of: VALUE }),
])

const CALL = oneOf([
  rec({ function: T }, { member: T }),
  rec({ service: T, call: T }),
  rec({ model: T }, { call: T }),
  rec({ builtin: T }),
  rec({ flow: T }, { member: T }),
  rec({ agent: T, member: T }),
])

const ARROW = rec({ arrow: names, do: body }, { waits: B })
const args = list(oneOf([ref('EXPR'), ARROW, list(ARROW)], { optional: true }))
const place = oneOf([T, N, ref('EXPR')])

nameShape(
  'EXPR',
  oneOf([
    ...valueForms,
    list(EXPR),
    rec({ name: list(place) }),
    rec({ read: EXPR, path: list(place) }),
    rec({ text: list(EXPR) }),
    rec({ object: list(list(EXPR)) }),
    rec({ op: choice([...calcSigns, '===', '!==', '&&', '||', '??']), left: EXPR, right: EXPR }),
    rec({ not: EXPR }),
    rec({ minus: EXPR }),
    rec({ nothing: B }),
    rec({ if: EXPR }, { then: EXPR, else: EXPR }),
    rec({ message: oneOf([T, list(EXPR)]) }, { with: map(EXPR) }),
    rec({ asset: EXPR }),
    rec({ fn: T }, { args }),
    rec({ concat: list(EXPR) }),
    rec({ calc: sign, left: EXPR, right: EXPR }),
    rec({ function: T }, { member: T }),
    rec({ agent: T }, { member: T }),
    rec({ flow: T }, { member: T }),
    rec({ service: T }),
    rec({ model: T }),
    rec({ table: T }),
    rec({ await: EXPR }),
    rec({ call: CALL }, { args: list(EXPR), system: B }),
    rec(
      { plan: oneOf([rec({ db: T }, { system: B }), rec({ table: T }), rec({ name: list(place) })]) },
      { then: list(map(args)) },
    ),
    // An option of the project that is left out is named with nothing as its value.
    rec(
      { named: oneOf([rec({ top: T }), rec({ textFile: T, as: T }), rec({ project: names })]) },
      { value: oneOf([ref('VALUE'), rec({ nothing: B })]) },
    ),
    rec({ type: TYPE }),
    rec({ types: map(TYPE) }),
  ]),
)

nameShape(
  'STATEMENT',
  oneOf([
    rec({ const: oneOf([T, names]) }, { value: EXPR }),
    rec({ if: EXPR }, { then: body, else: body }),
    rec({ for: T, of: EXPR, do: body }),
    rec({ return: EXPR }),
    rec({ do: EXPR }),
  ]),
)

const TRIGGER = oneOf([
  rec({ every: T }),
  rec({ cron: T }, { zone: T }),
  rec({ table: T, when: choice(['added', 'changed', 'removed']) }, { where: FILTER, columns: names }),
  rec({ event: T }, { where: map(EXPR) }),
  rec({ incoming: T }),
])

const tries = oneOf([N, some({ max: N, wait: TIME, on: list(N), first: TIME })])
const together = some({ max: N, group: T, then: choice(['wait', 'refuse', 'stop', 'join']) })
const remember = oneOf([B, some({ key: list(EXPR), for: TIME, kind: B, version: T, shared: T })])
const batch = some({ max: N, wait: TIME, measure: T, split: B })
const state = map(
  oneOf([TYPE, rec({ type: TYPE }, { in: choice(['address', 'device', 'browser']), back: B, reset: names })]),
)
const address = oneOf([T, asset])
const head = list(
  oneOf([
    rec({ meta: some({ name: T, property: T, content: T, media: T }) }),
    rec({
      link: some({
        rel: choice(['icon', 'apple-touch-icon', 'manifest', 'alternate', 'preconnect', 'dns-prefetch', 'preload']),
        href: address,
        type: T,
        sizes: T,
        media: T,
        hreflang: T,
        title: T,
        as: T,
        crossorigin: T,
      }),
    }),
    rec({
      script: some({ src: address, async: B, defer: B, type: T, load: choice(['now', 'alive', 'idle']), consent: T }),
    }),
  ]),
)
const scheme = oneOf([
  choice(['standard', 'stripe', 'github']),
  rec({ header: T }, { encoding: choice(['hex', 'base64']), prefix: T, id: T }),
  rec({ by: T }),
])

const unlock = some({
  scripts: names,
  styles: names,
  fonts: names,
  frames: names,
  styleTags: B,
  wasm: B,
  blobWorkers: B,
  eval: B,
  camera: B,
  location: B,
  microphone: B,
  more: map(names),
})

const auth = oneOf([
  rec({ bearer: secretOrText }),
  rec({ header: rec({ name: T, value: secretOrText }) }),
  rec({ basic: rec({ user: secretOrText, password: secretOrText }) }),
  rec({ query: rec({ name: T, value: secretOrText }) }),
  rec({
    oauth: some({
      authorizeUrl: T,
      tokenUrl: T,
      revokeUrl: T,
      clientId: secretOrText,
      clientSecret: secretOrText,
      scopes: names,
      extra: map(T),
      tokenExtra: map(T),
      tokenAuth: choice(['body', 'basic']),
      scopeSeparator: T,
      proof: B,
      discover: B,
    }),
  }),
  rec({ by: T }),
])

const policy = some({
  read: names,
  edit: names,
  create: names,
  remove: names,
  tools: names,
  ask: names,
  reaches: names,
  also: names,
  mode: choice(['build', 'propose', 'frozen']),
})

const worker = some({
  about: T,
  atOnce: N,
  wait: TIME,
  queue: N,
  order: choice(['waited', 'oldest']),
  turns: choice(['caller']),
  place: choice(['spread', 'pack']),
  loaded: choice(['first', 'no']),
  alone: oneOf([B, N]),
  idleAfter: TIME,
  mayStop: B,
  lost: N,
  next: rec({ kind: T, after: list(choice(['lost', 'wait', 'memory'])) }),
  orHere: oneOf([B, choice(['busy'])]),
  outside: oneOf([
    choice(['writer']),
    some({ services: choice(['writer']), models: choice(['writer']), fetch: choice(['writer']) }),
  ]),
  systemWork: B,
  limits: some({ perDay: unitCounts, perCallerPerDay: unitCounts, atLimit }),
  countBy: choice(['app']),
})

const project = some({
  title: T,
  languages: names,
  zone: T,
  currency: T,
  icon: asset,
  head,
  html: map(T),
  state,
  signInPath: T,
  identify: moduleOf,
  onRequest: moduleOf,
  uploads: RULE,
  images: some({ widths: list(N), formats: list(choice(['avif', 'webp'])) }),
  cookies: some({ sameSite: choice(['lax', 'none']), domain: T }),
  cli: some({ name: T, names: map(T), login: choice(['key']) }),
  mcp: some({
    toolsListed: N,
    asks: oneOf([choice(['engine', 'client']), names]),
    only: oneOf([choice(['queries']), names]),
    clients: list(oneOf([rec({ id: T }, { name: T, redirects: names, for: choice(['mcp', 'app']) }), anyoneRule])),
    on: map(T),
    anyone: B,
    stream: B,
    scopes: map(names),
    inline: SIZE,
    names: map(T),
  }),
  python: some({
    version: T,
    index: list(oneOf([T, rec({ url: T }, { user: secret, password: secret })])),
    build: names,
    own: some({ version: T, address: T, fingerprint: T }),
    locks: map(some({ version: T })),
  }),
  describeTo: RULE,
  api: some({ names: map(T), headers: names, origins: oneOf([names, anyoneRule]) }),
  roots: names,
  trailingSlash: choice(['strip', 'keep']),
  settings: map(rec({ type: TYPE }, { public: B })),
  mail: some({ from: oneOf([T, rec({ name: T, address: T })]), send: secretOrText }),
  files: some({ store: fileStore }),
  limits: some(
    Object.fromEntries(
      limitNames.map((name) => [name, limitKind(name) === 'time' ? TIME : limitKind(name) === 'size' ? SIZE : N]),
    ),
  ),
  redirects: list(rec({ from: T, to: T }, { permanent: B })),
  hosts: names,
  unlock,
  privateHosts: names,
  hold: oneOf([B, some({ net: names, programs: names, native: names })]),
  countBy: choice(['app', 'caller', 'limits']),
  workers: map(worker),
  backups: some({ every: oneOf([TIME, B]), keep: N, beforeChanges: B, test: B, archive: B, store: fileStore }),
  history: some({ leave: names }),
  publish: some({ health: T, within: TIME }),
  cache: some({ keysHeader: T }),
  vitals: some({ share: N }),
  release: some({ gradual: B, steps: list(N), every: TIME, watch: some({ failures: N, slower: N, calls: N }) }),
  trace: some({
    share: N,
    otlp: rec({ url: oneOf([T, rec({ setting: T })]) }, { headers: map(oneOf([T, secret, rec({ setting: T })])) }),
  }),
  removed: names,
  build: moduleOf,
  was: names,
})

const table = some({
  columns: map(TYPE),
  owner: T,
  access: some({ read: RULE, add: RULE, change: RULE, remove: RULE }),
  search: oneOf([names, rec({ columns: names }, { by: choice(['words', 'pieces']) })]),
  indexes: list(names),
  unique: list(names),
  keepHistory: B,
  removed: names,
  reaches: names,
  tenant: T,
  // A word other than 'counts' or 'scores' is stored as it is written, for the check to name (T2016).
  shows: T,
  plain: B,
  was: names,
  kept: choice(['memory']),
  lasts: oneOf([TIME, rec({ for: TIME, by: T }, { where: FILTER })]),
})

const limitsOfWork = some({
  time: TIME,
  try: TIME,
  reserve: TIME,
  lost: N,
  perDay: unitCounts,
  atLimit,
  runKept: TIME,
  memory: SIZE,
  load: TIME,
})

const fn = rec(
  { kind: choice(['query', 'change', 'action']), form: choice(['plain', 'code']) },
  {
    about: T,
    input: map(TYPE),
    output: TYPE,
    access: RULE,
    plan: PLAN,
    writes: list(WRITE),
    body,
    module: T,
    export: T,
    reads: names,
    touches: names,
    reaches: names,
    everywhere: B,
    live: B,
    refresh: TIME,
    heavy: B,
    background: oneOf([B, choice(['here'])]),
    worker: T,
    batch,
    remember,
    rows: map(PLAN),
    uses: names,
    changes: B,
    callerGone: choice(['goOn', 'stop']),
    follow: RULE,
    danger: choice(['none', 'ask']),
    sends: B,
    imports: B,
    offer,
    deprecated: T,
    system: T,
    tiedTo,
    countBy: choice(['caller', 'limits']),
    limits: limitsOfWork,
    python: some({ file: T, packages: names, files: names, lock: T, gpu: B, atOnce: N }),
    plain: B,
    was: names,
  },
)

// The judge of a guard and of a score: its model by name, the rule, the score at which it passes, and its kind.
const judged = rec({ model: T, rule: T }, { pass: N, words: T, kind: choice(['fromTools', 'onTask']) })

// A guard of an agent: the name of a function or a flow, a judge, or one of the engine's own.
const guard = oneOf([T, rec({ ours: choice(['noOtherPeople', 'noPersonal']) }), rec({ judge: judged })])

const agent = some({
  model: T,
  instructions: T,
  access: RULE,
  tools: list(oneOf([T, rec({ tool: T }, { tries: N, about: T, line: B, name: T })])),
  outside: names,
  trust: names,
  knows: list(oneOf([choice(['caller', 'time']), rec({ facts: T })])),
  limits: some({
    steps: N,
    perRun: unitCounts,
    time: TIME,
    ask: TIME,
    result: SIZE,
    toolCalls: N,
    toolsAtOnce: N,
    pass: TIME,
  }),
  policy,
  memory: some({
    in: T,
    thread: T,
    of: T,
    keep: N,
    after: N,
    shrink: oneOf([T, rec({ function: T }), rec({ flow: T }), rec({ nearest: N })]),
    model: T,
    recall: N,
  }),
  words: some(
    Object.fromEntries(
      [
        'asksFirst',
        'refused',
        'unfinished',
        'tooLarge',
        'file',
        'summary',
        'list',
        'call',
        'sequence',
        'gives',
        'reads',
        'writes',
        'sends',
        'answer',
        'guarded',
        'handOver',
        'handedOver',
        'question',
        'recalled',
        'facts',
        'joins',
      ].map((name) => [name, T]),
    ),
  ),
  driver: T,
  reasoning: some({ show: B, save: B }),
  tell: choice(['tools', 'list']),
  sequence: B,
  voice: some({ hear: T, speak: T, name: T, language: T, whole: B }),
  output: TYPE,
  guards: some({ in: list(guard), out: list(guard), refused: T }),
  handsOver: names,
  questions: B,
  score: rec({ share: N, with: judged }, {}),
})

const flow = rec(
  { form: choice(['plain', 'code']) },
  {
    on: list(TRIGGER),
    key: moduleOf,
    stopOn: list(rec({ event: T, key: moduleOf })),
    pace: some({
      debounce: TIME,
      perMinute: N,
      drop: some({ max: N, per: TIME }),
      batch: some({ max: N, wait: TIME }),
      order: moduleOf,
      turns: choice(['key']),
    }),
    sealed: B,
    about: T,
    input: map(TYPE),
    output: TYPE,
    sends: B,
    offer,
    access: RULE,
    system: T,
    body,
    onFail: oneOf([body, moduleOf]),
    onStop: oneOf([body, moduleOf]),
    module: T,
    export: T,
    stepNames: list(some({ name: T, repeated: B, inCode: B })),
    limits: some({ steps: N, time: TIME, result: SIZE, wait: TIME, pass: TIME, stepTime: TIME }),
    tries,
    together,
    moveRuns: choice(['never', 'whenSafe']),
    as: choice(['starter']),
    danger: choice(['ask']),
    follow: RULE,
    countBy: choice(['caller', 'limits']),
    tiedTo,
    agent,
    plain: B,
    was: names,
  },
)

const data = map(some({ query: T, action: T, input: map(EXPR), needed: B, wait: B, refresh: N, code: B }))
const view = {
  state,
  data: oneOf([data, rec({ code: B })]),
  uses: names,
  needs: names,
  // What its hooks need of the headers of the page, from the hooks the file of its view imports.
  opens: some({ microphone: B }),
  // The changes and the actions that the file of the view names, as the build read them from its source.
  calls: names,
  layout: T,
  was: names,
}

// A value of a screen that may be an arrow: what was read of it, or the mark of an arrow that is code.
const worked = oneOf([ref('EXPR'), rec({ code: B })], { optional: true })

const screen = some({
  ...view,
  path: T,
  for: choice(['notFound', 'error', 'grant', 'ask']),
  title: worked,
  access: RULE,
  loading: T,
  cache: oneOf([TIME, rec({ for: TIME }, { public: B })]),
  server: B,
  offer,
  about: T,
  framedBy: oneOf([names, T]),
  head,
  seo: some({
    description: worked,
    image: oneOf([worked, rec({ view: T }, { size: list(N) })]),
    index: B,
    data: worked,
    addresses: some({ query: T, input: map(EXPR) }),
  }),
})

const component = some({ ...view, props: map(TYPE), browser: B, personal: B })

const serviceCall = some({
  method: T,
  path: T,
  body: oneOf([T, some({ text: T, bytes: T, type: T })]),
  query: names,
  headers: map(T),
  lists: choice(['repeat', 'brackets', 'comma']),
  files: choice(['base64']),
  about: T,
  input: map(TYPE),
  output: TYPE,
  sends: B,
  changes: B,
  schema: J,
  fingerprint: T,
})

const service = some({
  url: T,
  auth,
  headers: map(secretOrText),
  calls: map(serviceCall),
  from: rec({ file: T }, { fingerprint: T, calls: names }),
  use: oneOf([names, map(T)]),
  limits: some({ perSecond: N, perMinute: N, atOnce: N, size: SIZE, error: SIZE, redirects: N, time: TIME }),
  tries,
  onceOnlyHeader: T,
  connection: T,
  webhook: rec({ scheme, secret }),
  mcp: oneOf([B, some({ command: names, env: map(secretOrText), per: T, keep: T, model: T })]),
  host: T,
  was: names,
})

const serviceCallOf = rec({ service: T, call: T })

const model = rec(
  { provider: T, name: T },
  {
    key: secret,
    url: T,
    hosted: names,
    abilities: names,
    takes: N,
    voices: names,
    tries,
    input: map(TYPE),
    output: TYPE,
    call: serviceCallOf,
    units: map(oneOf([T, N])),
    job: rec({ check: serviceCallOf, done: FILTER }, { with: map(T), failed: FILTER, every: TIME }),
    limits: some({ perDay: unitCounts, perCallerPerDay: unitCounts, time: TIME }),
    fallback: names,
    options: map(J),
    countBy: choice(['app']),
    was: names,
  },
)

const route = some({
  method: oneOf([T, names]),
  path: T,
  access: RULE,
  system: T,
  origins: oneOf([names, anyoneRule]),
  limits: some({ time: TIME, size: SIZE }),
  verified: B,
  tiedTo,
  module: T,
  export: T,
  was: names,
})

const incoming = some({
  path: T,
  verify: rec({ scheme }, { service: T, secret }),
  open: T,
  limits: some({ size: SIZE }),
  then: T,
  was: names,
})

const command = some({ about: T, args: map(TYPE), access: RULE, module: T, export: T, was: names })

// A backfill: the table it walks, its code, how many rows a write takes, the column it fills, and its reason.
const backfill = rec(
  { table: T, run: rec({ export: T }, { module: T }) },
  { page: N, fills: T, system: T, about: T, was: names },
)

/** The shape of the description, written once, with the types of the framework. */
export const descriptionShape: Type = rec(
  {
    format: T,
    app: rec({ name: T, needsEngine: T }, { dev: B }),
  },
  {
    project,
    tables: map(table),
    functions: map(fn),
    flows: map(flow),
    screens: map(screen),
    components: map(component),
    services: map(service),
    models: map(model),
    routes: map(route),
    incoming: map(incoming),
    commands: map(command),
    backfills: map(backfill),
    messages: map(map(oneOf([T, map(T)]))),
    assets: map(rec({ file: T }, { width: N, height: N })),
    sources: map(T),
    places: map(rec({ file: T, from: N, to: N })),
    // Each package that the project imports: who uses it, whether it reaches a browser, its bytes in the page, and
    // the ways out of the computer that its code takes.
    packages: map(rec({ by: names, browser: B }, { bytes: N, out: names })),
    seed: some({ writes: list(WRITE), body, module: T }),
    browser: some({
      page: some({ main: T, names: map(T), parts: map(T) }),
      shared: names,
      styles: names,
      screens: map(names),
      components: map(names),
      messages: map(T),
    }),
    server: some({ screens: T, views: map(T), modules: names, makers: T }),
    cli: some({ files: names }),
    api: some({ openapi: T, docs: T }),
    mcp: some({ screens: map(map(T)), frame: names }),
    python: some({ lock: T, files: map(T) }),
  },
)

/**
 * Takes a description. Answers what in it does not fit the format: each field that the shape does not name or
 * that is of another type, by its dotted name, and each word that is handed another value in the place of its
 * arrow. A description that fits answers an empty list. One that holds itself, or is nested more than 1,000 deep,
 * has no text, and that is all that is said of it.
 */
export function checkDescription(description: unknown): Finding[] {
  // Every walk over a description follows this one, the walk of the arrows below among them.
  // A record that was written is stored as three things inside each other, so a description is held to 1,000.
  const fault = faultOf(description, undefined, 1, 1000)
  if (fault) return [finding('T0002', `\`${fault.at}\` ${fault.words}.`, { fields: { [fault.at]: 'type' } })]
  const found = checkInto(descriptionShape, description)
  arrowsIn(description, found)
  return found
}

/**
 * Takes the names on the way to a part of the description, with `*` for any key of a map. Answers the names of the
 * fields of that part, as the shape holds them. Throws T0009 where the way leads to no record.
 */
export function fieldsOf(...path: string[]): string[] {
  let at: Type | undefined = descriptionShape
  for (const name of path) {
    if (at?.kind === 'map' && name === '*') at = at.of
    else at = at?.kind === 'object' ? at.shape[name] : undefined
  }
  if (at?.kind !== 'object')
    throw new TentError('T0009', `The shape of the description holds no record at ${path.join('.')}.`)
  return Object.keys(at.shape)
}

/** A type of the shape, with a shape that is named, as a type is, taken for the shape kept under its name. */
const followed = (type: Type | undefined): Type | undefined => (type?.kind === 'ref' ? shapeOf(type.name) : type)

/** The kind of a number of the shape, or nothing for a type that is no such number. */
function measureOf(type: Type | undefined): 'time' | 'size' | undefined {
  if (type?.kind === 'oneOf') return type.of.map((one) => measureOf(followed(one))).find((one) => one !== undefined)
  if (type?.kind !== 'number') return undefined
  return type.help === TIME.help ? 'time' : type.help === SIZE.help ? 'size' : undefined
}

/**
 * Takes the names on the way to a field of the description, with `*` for any key of a map. Answers whether the
 * shape marks it as a length of time or as a size, which text writes in words, or nothing for any other field. A
 * field that may hold one of several forms is followed into the form that is a record, and a shape that is named,
 * as a type, a plan and a filter are, into the shape kept under its name.
 */
export function measureAt(...path: string[]): 'time' | 'size' | undefined {
  let at: Type | undefined = descriptionShape
  for (const name of path) {
    const one = followed(at)
    const record: Type | undefined =
      one?.kind === 'oneOf' ? one.of.map(followed).find((each) => each?.kind === 'object') : one
    if (record?.kind === 'map' && name === '*') at = record.of
    else at = record?.kind === 'object' ? record.shape[name] : undefined
  }
  return measureOf(followed(at))
}
