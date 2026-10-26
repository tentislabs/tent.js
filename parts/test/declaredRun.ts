import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { codes, isStored } from '../core/internal.ts'
import { heldRefusal, holdOutside, notesOf, underTest } from '../engine/index.ts'
import type { AccessCase, CaseCaller, EdgeCase, FormCase } from './declared.ts'
import type { Mark } from './marks.ts'
import { declaredCases, refusalWords, rolesOf, ruleWords, typeWords, valueWords } from './declared.ts'
import { closePage, sendForm } from './page.ts'
import { sampleOf } from './sample.ts'
import type { TestApp } from './testApp.ts'
import { testApp } from './testApp.ts'

type Stored = Record<string, unknown>

/** One case as it ran: the definition it comes from, its line, and the failure it is, where it is one. */
interface Ran {
  definition: string
  line: string
  failure?: string
}

/** What came of a call: taken, or refused with a code, with the error where it was refused. */
type Outcome = { said: string; error?: unknown }

/** Whether a refusal is a failure of a case: an internal error, or an engine code at status 500 or past it. */
function internal(error: unknown): boolean {
  const code = String(Reflect.get(Object(error), 'code') ?? 'T0009')
  const row: unknown = Object.hasOwn(codes, code) ? Reflect.get(codes, code) : undefined
  const status: unknown = isStored(row) ? row.status : undefined
  return code === 'T0009' || (typeof status === 'number' && status >= 500)
}

/** What came of a piece of work: taken, or found nothing where a read answered no row, or refused with the code of its error. */
async function outcomeOf(work: () => Promise<unknown>, read = false): Promise<Outcome> {
  try {
    const got = await work()
    const none = got === null || got === undefined || (Array.isArray(got) && got.length === 0)
    return { said: read && none ? 'found nothing' : 'taken' }
  } catch (error) {
    const code = String(Reflect.get(Object(error), 'code') ?? 'T0009')
    return { said: internal(error) ? `internal ${code}` : `refused ${code}`, error }
  }
}

/** Stands in for every service and model of the app, each refusing with T7132, and for every plain fetch. */
function standInAll(app: TestApp): void {
  for (const name of Object.keys(app.description.services))
    app.standIn(
      name,
      new Proxy(
        {},
        {
          get: (_, call) =>
            call === 'then' || typeof call === 'symbol'
              ? undefined
              : () => Promise.reject(heldRefusal(`The service ${name}, as ${String(call)},`)),
        },
      ),
    )
  for (const name of Object.keys(app.description.models))
    app.standIn(name, {
      async *reply() {
        yield* []
        throw heldRefusal(`The model ${name}`)
      },
      call: async () => Promise.reject(heldRefusal(`The model ${name}`)),
    })
  app.standIn('fetch', { fetch: async () => Promise.reject(heldRefusal('A plain `fetch`')) })
}

/** The values of a new row of `users`: a sample of each column it needs, and the roles. */
function userValues(app: TestApp, roles: string[]): Stored {
  const columns: unknown = Reflect.get(Object(app.description.tables.users), 'columns')
  const values: Stored = { roles }
  for (const [name, type] of Object.entries(isStored(columns) ? columns : {}))
    if (name !== 'roles' && isStored(type) && type.optional !== true && type.default === undefined)
      values[name] = sampleOf(type, name, { n: Object.keys(values).length })
  return values
}

/** A link to a row of a table that is made as the system, for an input or a column that links one. */
const linkedIn =
  (app: TestApp) =>
  async (table: string): Promise<string> =>
    String((await app.make(table, 1))[0]?.id)

/** A sample of each field of an input that must be there: an optional field is left out. */
async function sampleInput(app: TestApp, input: unknown): Promise<Stored> {
  const given: Stored = {}
  for (const [field, type] of Object.entries(isStored(input) ? input : {}))
    if (isStored(type) && type.optional !== true && type.default === undefined)
      given[field] = await sampleOf(type, field, { linked: linkedIn(app) })
  return given
}

/** The caller that a case names, made on the app as it stands: a user with its roles, a key, a grant. */
async function callerFor(app: TestApp, caller: CaseCaller): Promise<Caller> {
  if (caller.kind === 'nobody' || caller.kind === 'system') return { kind: caller.kind }
  if (caller.kind === 'key') return (await app.key({ scopes: ['*'] })).caller
  const user = await app.user(userValues(app, caller.roles ?? []))
  if (caller.kind !== 'grant') return user
  return (await app.grant({ user: String(user.user?.id), scopes: ['*'] })).caller
}

/** Refuses each step of a run that waits for a person, and answers whether there was one: a case asks nobody. */
async function answeredNo(app: TestApp): Promise<boolean> {
  await app.settled()
  let asked = false
  for (const run of await app.runs.find({ of: 'all' }))
    for (const step of run.steps)
      if (step.state === 'waiting')
        try {
          app.runs.refuse(run.id, step.name)
          asked = true
        } catch {
          // A step that waits for a time or an event is no person's to answer.
        }
  await app.settled()
  return asked
}

/** The code of a refusal that an answer of the door carries, or its status where it carries none. */
async function refusedBy(answer: Response): Promise<TentError> {
  const told: unknown = await answer.json().catch(() => undefined)
  const code: unknown = Reflect.get(Object(Reflect.get(Object(told), 'error') ?? told), 'code')
  return new TentError(typeof code === 'string' ? code : `status ${answer.status}`, `answered ${answer.status}`)
}

/** Asks a route as a caller, through every step of the door: nobody with no session, a user with one. */
async function routeAsked(app: TestApp, name: string, as: Caller): Promise<void> {
  const record: Stored = Object(app.description.routes[name])
  const headers = as.kind === 'user' && as.user ? { cookie: app.session(as) } : undefined
  const answer = await app.request(
    new Request(`http://localhost${String(record.path)}`, {
      method: String(record.method ?? 'GET'),
      ...(headers ? { headers } : {}),
    }),
  )
  if (!answer.ok) throw await refusedBy(answer)
}

/** Runs a command of the app's own as a caller, a user by its id or the system, with a sample of each of its words. */
async function commandRan(app: TestApp, name: string, as: Caller): Promise<void> {
  const record: Stored = Object(app.description.commands[name])
  const words = [name]
  for (const [arg, type] of Object.entries(isStored(record.args) ? record.args : {}))
    if (isStored(type) && type.optional !== true) words.push(`--${arg}`, String(sampleOf(type, arg)))
  const done = await app.cli(words, { as: as.kind === 'user' && as.user ? as.user.id : 'system' })
  if (done.code === 0) return
  const code = /\bT\d{4}\b/.exec(`${done.err}\n${done.out}`)?.[0]
  throw new TentError(code ?? `ended ${done.code}`, done.err)
}

/** What came of one case of access, as the line of the table names it and as it ran. */
async function accessRun(app: TestApp, one: AccessCase): Promise<{ key: string; said: string }> {
  const description = app.description
  const key = `${one.definition} - ${one.what}: as ${one.caller.words}`
  // A caller that the app cannot make, with no table of users, has no case.
  if (!Object.hasOwn(description.tables, 'users') && !['nobody', 'system'].includes(one.caller.kind))
    return { key, said: 'no users' }
  if (one.of === 'route' || one.of === 'command') {
    const as = await callerFor(app, one.caller)
    const { said } = await outcomeOf(() =>
      one.of === 'route' ? routeAsked(app, one.definition, as) : commandRan(app, one.definition, as),
    )
    return { key, said }
  }
  if (one.of === 'call') {
    const record: unknown = Object.hasOwn(description.functions, one.definition)
      ? description.functions[one.definition]
      : description.flows[one.definition]
    const input = await sampleInput(app, Reflect.get(Object(record), 'input'))
    const as = await callerFor(app, one.caller)
    const { said } = await outcomeOf(() => app.call(one.definition, input, { as }))
    return { key, said }
  }
  const table: Stored = Object(description.tables[one.definition])
  const columns: Stored = isStored(table.columns) ? table.columns : {}
  const owner = typeof table.owner === 'string' ? table.owner : undefined
  const ownerUser = owner ? await app.user(userValues(app, [])) : undefined
  const [row] = await app.make(one.definition, 1, () => (owner && ownerUser ? { [owner]: ownerUser.user?.id } : {}))
  const id = String(row?.id)
  const kind = one.caller.kind
  const as =
    kind === 'owner' && ownerUser
      ? ownerUser
      : kind === 'tenant' || kind === 'otherTenant'
        ? { kind: 'system' as const }
        : await callerFor(app, { ...one.caller, kind: kind === 'other' ? 'user' : kind })
  const tenant = typeof table.tenant === 'string' ? table.tenant : undefined
  const values = await sampleInput(app, Object.fromEntries(Object.entries(columns).filter(([name]) => name !== owner)))
  const [first] = Object.entries(values).filter(([name, value]) => typeof value !== 'object' && name !== tenant)
  // The tenant a row of a tenant table is reached in: its own, or another made for the case.
  const linksTo: unknown = tenant === undefined ? undefined : Reflect.get(Object(columns[tenant]), 'table')
  const of =
    tenant === undefined
      ? {}
      : kind === 'otherTenant' && typeof linksTo === 'string'
        ? { of: await linkedIn(app)(linksTo) }
        : { of: String(one.what === 'add' ? values[tenant] : row?.[tenant]) }
  const asked = {
    read: () =>
      app.read(
        ['owner', 'other', 'tenant', 'otherTenant'].includes(kind)
          ? { from: one.definition, ...of, one: 'get', id }
          : { from: one.definition, ...of },
        { as },
      ),
    add: () => app.write([{ add: one.definition, ...of, values }], { as }),
    change: () =>
      app.write([{ change: one.definition, ...of, id, values: first ? { [first[0]]: first[1] } : {} }], { as }),
    remove: () => app.write([{ remove: one.definition, ...of, id }], { as }),
  }
  // A read of one row that the caller may not reach, or that stands in another tenant, finds nothing.
  const reached = ['owner', 'other', 'tenant', 'otherTenant'].includes(kind) && one.what === 'read'
  const { said } = await outcomeOf(asked[one.what === 'access' ? 'read' : one.what], reached)
  return { key, said }
}

/**
 * Takes the edges of one field and what calls the function with an input. Cuts a failing input down to the smallest
 * that still fails, as Hypothesis and fast-check shrink a case: an optional field is left out, and a number, the
 * length of a text and of a list move toward their least while the call still fails.
 */
async function smallest(
  input: Stored,
  type: Stored,
  field: string,
  fails: (input: Stored) => Promise<boolean>,
): Promise<Stored> {
  const value = input[field]
  const least = typeof type.min === 'number' ? type.min : 0
  /** The least whole number from `low` up to `high` at which `at` still fails, where it fails at `high`. */
  const search = async (low: number, high: number, at: (n: number) => Stored): Promise<Stored> => {
    if (await fails(at(low))) return at(low)
    let [ok, bad] = [low, high]
    while (bad - ok > 1) {
      const middle = Math.floor((ok + bad) / 2)
      if (await fails(at(middle))) bad = middle
      else ok = middle
    }
    return at(bad)
  }
  if (typeof value === 'number' && value > least)
    return search(least, Math.floor(value), (n) => ({ ...input, [field]: n }))
  if (typeof value === 'string' && value.length > least)
    return search(least, value.length, (n) => ({ ...input, [field]: value.slice(0, n).padEnd(n, 'a') }))
  if (Array.isArray(value) && value.length > least)
    return search(least, value.length, (n) => ({ ...input, [field]: value.slice(0, n) }))
  return input
}

/** What came of one edge, as its line names it, and the failure where the code of the app failed at it. */
async function edgeRun(app: TestApp, one: EdgeCase): Promise<{ line: string; failure?: string }> {
  const record: Stored = Object(app.description.functions[one.definition])
  const input = await sampleInput(app, record.input)
  if (one.left) delete input[one.field]
  else input[one.field] = one.link ? await linkedIn(app)(one.link) : one.value
  const shown = one.left ? 'left out' : one.link ? `a row of ${one.link} that exists` : valueWords(one.value)
  const call = (given: Stored) => outcomeOf(() => app.call(one.definition, given, { as: { kind: 'system' } }))
  const { said, error } = await call(input)
  const line = `${one.definition}.${one.field} - ${typeWords(one.type)}: ${shown}, ${said}`
  if (!said.startsWith('internal')) return { line }
  const least = await smallest(input, one.type, one.field, async (given) =>
    (await call(given)).said.startsWith('internal'),
  )
  const where: unknown = Reflect.get(Object(error), 'where')
  const place = isStored(where)
    ? `\nat ${String(where.file)}:${String(where.line)} (${String(where.definition ?? one.definition)})`
    : ''
  const message = String(Reflect.get(Object(error), 'message') ?? error)
  return {
    line,
    failure: `${line}\nThe code of the app failed: ${message}${place}\nthe smallest input that fails: ${JSON.stringify(least)}`,
  }
}

/** The input that a form sends, as the call that reads it: a number of a number field, a text of every other. */
function formInput(fields: Stored, values: Record<string, string>): Stored {
  const input: Stored = {}
  for (const [field, text] of Object.entries(values)) {
    const type: unknown = fields[field]
    if (text === '') continue
    input[field] = isStored(type) && type.kind === 'number' ? Number(text) : text
  }
  return input
}

/** What came of one form, as its line names it, and the failure where it answered otherwise than its call. */
async function formRun(app: TestApp, one: FormCase): Promise<{ line: string; failure?: string }> {
  const record: Stored = Object(app.description.functions[one.definition])
  const fields: Stored = isStored(record.input) ? record.input : {}
  const sample = await sampleInput(app, fields)
  const values: Record<string, string> = {}
  for (const [field, type] of Object.entries(fields))
    if (isStored(type) && ['text', 'number', 'choice'].includes(String(type.kind)))
      values[field] = one.sent === 'empty' ? '' : String(sample[field] ?? '')
  if (typeof one.sent === 'object') values[one.sent.field] = String(one.sent.value)
  const shown = typeof one.sent === 'object' ? `${one.sent.field} ${valueWords(one.sent.value)} (an edge)` : one.sent
  const user = await app.user(userValues(app, rolesOf(app.description)))
  const page = await app.open(one.path, { as: user })
  // The log writes the moment of a call by the clock of the app, which runs with the time of the system here.
  const sent = Date.now() - 1
  try {
    await sendForm(page, one.definition, values)
  } finally {
    await closePage(page)
  }
  const last = callsOf(await app.logs({ newest: 20 }), one.definition, sent).at(-1)
  const said = !last ? 'not sent' : last.ok ? 'taken' : `refused ${String(last.code)}`
  const call = await outcomeOf(() => app.call(one.definition, formInput(fields, values), { as: user }))
  const line = `${one.definition} - form on ${one.path}: ${shown}, ${said}`
  // A form that the page itself held back, for what its fields do not fit, answers as the call refuses it.
  const same = said === call.said || (said === 'not sent' && call.said.startsWith('refused'))
  return same
    ? { line }
    : { line, failure: `${line}\nThe form answered ${said}, and its call with the same input ${call.said}.` }
}

/** The calls of a function in the newest rows of the log since a moment, each with whether it was taken and its code. */
function callsOf(logs: Record<string, unknown>, name: string, since: number): { ok: boolean; code?: unknown }[] {
  const calls: unknown = logs.calls
  return (Array.isArray(calls) ? calls : [])
    .filter((one) => Reflect.get(Object(one), 'name') === name && Number(Reflect.get(Object(one), 'at')) >= since)
    .map((one) => ({ ok: Boolean(Reflect.get(Object(one), 'ok')), code: Reflect.get(Object(one), 'code') }))
}

/**
 * Takes the app and a case. Carries the case out from the mark of the data, as the work of a test of its own, so
 * that what of it reached outside is told, a Python program among it, which the engine cannot hold; then settles the
 * runs it started and answers no to each that asks a person. Answers what the case answered, and the words its line
 * ends with for what it reached and what it asked.
 */
async function caseRun<Answer>(
  app: TestApp,
  mark: Mark,
  k: number,
  work: () => Promise<Answer>,
): Promise<{ answer: Answer; more: string }> {
  await app.back(mark)
  const notes = notesOf(`declared ${k}`)
  const answer = await underTest(notes, work)
  const asked = await underTest(notes, () => answeredNo(app))
  const outside = [...notes.outside].sort()
  const more = `${outside.length ? `; reached outside: ${outside.join(', ')}` : ''}${asked ? '; a person was asked, and answered no' : ''}`
  return { answer, more }
}

/**
 * Runs the cases made from the declarations of the project in the folder the program was started in, as `tent test
 * --declared` starts it, each from one mark of its data, with every service and model stood in for, and every plain
 * fetch, request of a page to another host and connection of the app's code held: what each caller gets of each definition, kept in `tests/declared/access.json` and held to it as a
 * picture is, each edge of each input, and each form. Each case is a test of the runner, by its line, in the order of
 * the names of the definitions. With `update`, the table of access is kept anew.
 */
export async function declared(o: { update?: boolean } = {}): Promise<void> {
  const folder = resolve(process.cwd())
  holdOutside()
  const app = await testApp({ folder })
  standInAll(app)
  const mark = await app.mark()
  const cases = declaredCases(app.description)
  const ran: Ran[] = []
  const file = join(folder, 'tests', 'declared', 'access.json')
  const kept: Stored = existsSync(file) ? Object(JSON.parse(readFileSync(file, 'utf8'))) : {}
  const table: Record<string, string> = {}
  let k = 0
  for (const one of cases.access) {
    const { answer, more } = await caseRun(app, mark, k++, () => accessRun(app, one))
    const { key, said } = answer
    if (said === 'no users') continue
    table[key] = said
    // A refusal of the rule says why; any other is the code's own.
    const why = ['refused T3101', 'refused T0006', 'refused T2103'].includes(said) ? refusalWords(one.rule) : ''
    const line = `${one.definition} - ${one.what}: ${ruleWords(one.rule)}: as ${one.caller.words}, ${said}${why}${more}`
    const was = kept[key]
    const changed = !o.update && typeof was === 'string' && was !== said
    ran.push({ definition: one.definition, line, ...(changed ? { failure: `${key}: was ${was}, now ${said}` } : {}) })
  }
  for (const one of [...cases.edges, ...cases.forms]) {
    const { answer, more } = await caseRun(app, mark, k++, () =>
      'screen' in one ? formRun(app, one) : edgeRun(app, one),
    )
    const failure = answer.failure?.replace(answer.line, `${answer.line}${more}`)
    ran.push({ definition: one.definition, line: `${answer.line}${more}`, ...(failure ? { failure } : {}) })
  }
  if (o.update || !existsSync(file)) {
    mkdirSync(join(folder, 'tests', 'declared'), { recursive: true })
    const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : 1)))
    writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`)
  }
  // The cases stand in the order of the names of their definitions, each kind in its own order within a name.
  const ordered = ran
    .map((one, k) => ({ one, k }))
    .sort((a, b) => (a.one.definition < b.one.definition ? -1 : a.one.definition > b.one.definition ? 1 : a.k - b.k))
  for (const { one } of ordered)
    test(one.line, () => {
      if (one.failure !== undefined) throw new Error(one.failure)
    })
}
