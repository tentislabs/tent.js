import { hostedTools, shippedProviders } from '../models.ts'
import { filterOf } from '../filter.ts'
import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import { unwritableFields } from './callPlaces.ts'
import { limitsOf, triesOf } from './flow.ts'
import { nameAt, nameIf, namesAt } from './named.ts'
import type { Told } from './shared.ts'
import { known, leanOf, ms, optionsOf, plainOf, report, required, setField, wasOf } from './shared.ts'
import { typeOf, typesOf } from './type.ts'

/** The options of `service`. */
const serviceOptions = [
  'url',
  'auth',
  'headers',
  'calls',
  'from',
  'use',
  'limits',
  'tries',
  'onceOnlyHeader',
  'webhook',
  'connection',
  'mcp',
  'was',
]

/** The options of `model`. */
const modelOptions = [
  'provider',
  'name',
  'key',
  'url',
  'hosted',
  'abilities',
  'takes',
  'voices',
  'input',
  'output',
  'limits',
  'tries',
  'fallback',
  'options',
  'countBy',
  'call',
  'units',
  'job',
  'was',
]

const callOptions = [
  'method',
  'path',
  'input',
  'output',
  'body',
  'query',
  'headers',
  'lists',
  'files',
  'sends',
  'changes',
  'about',
]

/** The forms of `auth`, each with the names that its record takes. A form with none holds one value. */
const authForms: Record<string, string[] | undefined> = {
  bearer: undefined,
  by: undefined,
  header: ['name', 'value'],
  basic: ['user', 'password'],
  query: ['name', 'value'],
  oauth: [
    'authorizeUrl',
    'tokenUrl',
    'revokeUrl',
    'clientId',
    'clientSecret',
    'scopes',
    'extra',
    'tokenExtra',
    'tokenAuth',
    'scopeSeparator',
    'proof',
    'discover',
  ],
}

/** How a service signs its requests, as it is stored: one of the six forms. Any other is T1014. */
function authOf(told: Told, written: unknown): unknown {
  if (written === undefined) return undefined
  const bad = (why: string): undefined => {
    report(
      told,
      'T1014',
      `\`auth\` ${why}.`,
      'Write one of bearer, header, basic, query, oauth and by, with the names of its form.',
    )
    return undefined
  }
  const [form, ...more] = isStored(written) ? Object.keys(written) : []
  if (form === undefined || more.length || !Object.hasOwn(authForms, form) || !isStored(written))
    return bad('is none of the six forms an auth has')
  const names = authForms[form]
  const inner = written[form]
  if (names && !isStored(inner)) return bad(`states \`${form}\` as what is no record`)
  const unknown = names ? Object.keys(optionsOf(inner)).find((name) => !names.includes(name)) : undefined
  if (unknown !== undefined) return bad(`states \`${form}.${unknown}\`, which \`${form}\` does not take`)
  return leanOf(written)
}

/** `Authorization`, where the auth sets it: a bearer, a user and a password, a connection, or that header by name. */
function signedHeaders(auth: unknown): string[] {
  const form = optionsOf(auth)
  const named = optionsOf(form.header).name
  const sets = form.bearer !== undefined || form.basic !== undefined || form.oauth !== undefined
  return sets || (typeof named === 'string' && named.toLowerCase() === 'authorization') ? ['authorization'] : []
}

/** One call of a service as it is stored: `sends` only where it is false, and `changes` only where it is stated otherwise than its method says. */
function callOf(told: Told, name: string, written: unknown): Stored {
  const o = optionsOf(written)
  known(told, `the call ${name}`, o, callOptions)
  const stored: Stored = {}
  setField(stored, 'method', o.method)
  setField(stored, 'path', o.path)
  setField(stored, 'body', plainOf(o.body), 'json')
  setField(stored, 'query', o.query)
  setField(stored, 'headers', plainOf(o.headers))
  setField(stored, 'lists', o.lists, 'repeat')
  setField(stored, 'files', o.files)
  setField(stored, 'about', o.about)
  setField(stored, 'input', typesOf(told, `calls.${name}.input`, o.input))
  if (o.output !== undefined) stored.output = typeOf(told, `calls.${name}.output`, o.output)
  if (o.sends === false) stored.sends = false
  if (o.changes !== undefined && o.changes !== (o.method !== 'GET')) stored.changes = o.changes
  return stored
}

/**
 * The operations that `use` names, as they are stored: a list of their ids, or a record from the name of a call to
 * an operation, which names one at least. Any other is T1014.
 */
function operationsOf(told: Told, written: unknown): unknown {
  if (written === undefined) return undefined
  const textsOf = (values: unknown[]): boolean => values.every((one) => typeof one === 'string')
  if (Array.isArray(written) && textsOf(written)) return written
  if (isStored(written) && Object.keys(written).length && textsOf(Object.values(written))) return leanOf(written)
  report(
    told,
    'T1014',
    '`use` is neither a list of the operations of the file nor a record from the name of a call to one.',
    "Write `use: ['PostRefunds']`, or `use: { createRefund: 'PostRefunds' }`.",
  )
  return undefined
}

/** Takes the options of `service` as they were written. Answers the record of the service as it is stored. */
export function serviceOf(told: Told, o: Stored): Stored {
  known(told, 'service', o, serviceOptions)
  const program = isStored(o.mcp) && o.mcp.command !== undefined
  if (!program) required(told, 'service', o, ['url'])
  // A program is spoken to over the channel the engine makes: it has no address, and no auth or lines of one.
  for (const field of ['url', 'auth', 'headers'])
    if (program && o[field] !== undefined)
      report(
        told,
        'T1014',
        `\`${field}\` is stated beside \`mcp.command\`, and a server that is a program has none.`,
        `Take \`${field}\` out: the engine speaks to the program over its input and its output.`,
      )
  const stored: Stored = {}
  setField(stored, 'url', o.url)
  setField(stored, 'auth', authOf(told, o.auth))
  setField(stored, 'headers', plainOf(o.headers))
  const engines = ['content-length', 'host', ...signedHeaders(o.auth)]
  for (const header of Object.keys(optionsOf(o.headers)))
    if (engines.includes(header.toLowerCase()))
      report(told, 'T1014', `the header ${header} is the engine's to set.`, 'Take the header out.')
  const calls = Object.entries(optionsOf(o.calls)).map(([name, call]) => [name, callOf(told, name, call)] as const)
  for (const [name, call] of calls)
    for (const { field, place } of unwritableFields(call, o.url))
      report(
        told,
        'T1014',
        `the field ${field} of the call ${name} is of a kind that cannot be written into ${place}.`,
        'Put the field where its kind can be written: into the body of the call, or as a value of its own.',
      )
  setField(stored, 'calls', Object.fromEntries(calls))
  if (o.from !== undefined) stored.from = { file: o.from }
  setField(stored, 'use', operationsOf(told, o.use))
  setField(stored, 'limits', limitsOf(told, o.limits, ['time'], ['size', 'error'], { time: 30_000 }))
  setField(stored, 'tries', triesOf(told, o.tries, 3))
  setField(stored, 'onceOnlyHeader', o.onceOnlyHeader)
  setField(stored, 'connection', nameIf(told, 'connection', o.connection))
  setField(stored, 'webhook', plainOf(o.webhook))
  const mcp = optionsOf(o.mcp)
  setField(
    stored,
    'mcp',
    isStored(o.mcp) ? plainOf({ ...mcp, model: nameIf(told, 'mcp.model', mcp.model) }) : o.mcp,
    false,
  )
  setField(stored, 'was', wasOf(o.was))
  return stored
}

/** A call of a service that is handed on, as the description names it. */
function serviceCall(told: Told, option: string, handed: unknown): Stored | undefined {
  if (handed === undefined) return undefined
  const named = nameAt(told, option, handed)
  if (named === undefined) return undefined
  const [service, call] = named.split('.')
  if (!call || told.all.get(service)?.kind !== 'service')
    report(
      told,
      'T1014',
      `\`${option}\` names no call of a service.`,
      'Hand it a call of a service, as decisions.decide.',
    )
  return { service, call }
}

/** Takes the options of `model` as they were written. Answers the record of the model as it is stored. */
export function modelOf(told: Told, o: Stored): Stored {
  known(told, 'model', o, modelOptions)
  required(told, 'model', o, o.provider === 'service' ? ['provider', 'name', 'call'] : ['provider', 'name'])
  if (o.provider === 'openai-style') required(told, 'a model of the provider openai-style', o, ['url'])
  const stored: Stored = {}
  for (const name of ['provider', 'name', 'url', 'abilities', 'takes', 'voices', 'units', 'countBy'])
    setField(stored, name, plainOf(o[name]))
  setField(stored, 'key', plainOf(o.key))
  setField(stored, 'tries', triesOf(told, o.tries, 2))
  setField(stored, 'input', typesOf(told, 'input', o.input))
  if (o.output !== undefined) stored.output = typeOf(told, 'output', o.output)
  setField(stored, 'call', serviceCall(told, 'call', o.call))
  if (o.job !== undefined) {
    const job = optionsOf(o.job)
    const check = serviceCall(told, 'job.check', job.check)
    if (check && isStored(stored.call) && check.service !== stored.call.service)
      report(
        told,
        'T1014',
        '`job.check` is a call of another service than `call`.',
        'Name a second call of the same service.',
      )
    const made: Stored = { check, done: filterOf(job.done) }
    setField(made, 'with', plainOf(job.with))
    setField(made, 'failed', job.failed === undefined ? undefined : filterOf(job.failed))
    setField(made, 'every', ms(told, 'job.every', job.every))
    stored.job = made
    if (optionsOf(o.limits).time === undefined)
      report(told, 'T1008', 'a model with `job` states no `limits.time`.', 'State how long the whole job may take.')
  }
  setField(stored, 'limits', limitsOf(told, o.limits, ['time'], [], { time: 60_000 }))
  setField(stored, 'fallback', namesAt(told, 'fallback', o.fallback))
  setField(stored, 'options', plainOf(o.options))
  setField(stored, 'hosted', hostedOf(told, o))
  setField(stored, 'was', wasOf(o.was))
  return stored
}

/** The provider's own tools that a model names, held to those its provider has where the provider ships. */
function hostedOf(told: Told, o: Stored): string[] | undefined {
  if (o.hosted === undefined) return undefined
  const named = Array.isArray(o.hosted) ? o.hosted.map(String) : []
  const has =
    typeof o.provider === 'string' && Object.hasOwn(hostedTools, o.provider) ? hostedTools[o.provider] : undefined
  const ships = typeof o.provider === 'string' && shippedProviders.includes(o.provider)
  for (const name of named)
    if (ships && !has?.includes(name))
      report(
        told,
        'T1014',
        `\`hosted\` names ${name}, which the provider ${String(o.provider)} does not run.`,
        `Name one of ${(has ?? []).join(', ') || 'none: this provider runs no tool of its own'}.`,
      )
  return named.length ? named : undefined
}
