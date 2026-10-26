import type { Description } from '../core/internal.ts'
import { isStored } from '../core/internal.ts'

type Stored = Record<string, unknown>

/** A caller of the cases, by the words a line names it with: a user carries the roles it is made with. */
export interface CaseCaller {
  words: string
  kind: 'nobody' | 'system' | 'user' | 'key' | 'grant' | 'owner' | 'other' | 'tenant' | 'otherTenant'
  roles?: string[]
}

/** A case of access: a definition, or what is done to a table, by one caller, with the rule it is held to. */
export interface AccessCase {
  definition: string
  // What the definition is: a function or an offered flow is called, a route asked, a command run, a table used.
  of: 'call' | 'route' | 'command' | 'table'
  what: 'access' | 'read' | 'add' | 'change' | 'remove'
  rule: unknown
  caller: CaseCaller
}

/** A case of an edge: one field of the input of a function at one value its type takes at its edge. */
export interface EdgeCase {
  definition: string
  field: string
  type: Stored
  // The value, or nothing for a field left out, or the table of a link to a row that is made first.
  value?: unknown
  left?: true
  link?: string
}

/** A case of a form: a call of a screen sent from a page empty, with a sample, or with one field at an edge. */
export interface FormCase {
  definition: string
  screen: string
  path: string
  sent: 'empty' | 'sample' | { field: string; value: unknown }
}

/** Every case of a description, each kind in the order it is carried out. */
export interface Cases {
  access: AccessCase[]
  edges: EdgeCase[]
  forms: FormCase[]
}

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Every role that a rule of the description names, in the order of their names. */
export function rolesOf(description: Description): string[] {
  const found = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) for (const one of value) walk(one)
    else if (isStored(value)) {
      if (value.rule === 'role' && typeof value.role === 'string') found.add(value.role)
      for (const one of Object.values(value)) walk(one)
    }
  }
  walk(description)
  return [...found].sort(byName)
}

/** The callers of a definition: nobody, a user with no role, one of each role, the system, and a key and a grant where it is offered. */
function callersOf(roles: string[], offer: unknown): CaseCaller[] {
  const doors = Array.isArray(offer) ? offer.map(String) : []
  return [
    { words: 'nobody', kind: 'nobody' },
    { words: 'a user with no role', kind: 'user', roles: [] },
    ...roles.map((role): CaseCaller => ({ words: `a user of the role ${role}`, kind: 'user', roles: [role] })),
    { words: 'the system', kind: 'system' },
    ...(doors.includes('api') ? [{ words: 'a key', kind: 'key' as const }] : []),
    ...(doors.includes('mcp') ? [{ words: 'a grant', kind: 'grant' as const }] : []),
  ]
}

/** The values that a type takes at its edges: its least and its most, empty where that is let, and each of a choice. */
function edgesOf(type: Stored): { value?: unknown; left?: true; link?: string }[] {
  const min = typeof type.min === 'number' ? type.min : undefined
  const max = typeof type.max === 'number' ? type.max : undefined
  const edges: { value?: unknown; left?: true; link?: string }[] = []
  if (type.kind === 'text') {
    if (!min) edges.push({ value: '' })
    if (min) edges.push({ value: 'a'.repeat(min) })
    if (max !== undefined) edges.push({ value: 'a'.repeat(max) })
  } else if (type.kind === 'number') {
    if (min !== undefined) edges.push({ value: min })
    if (max !== undefined) edges.push({ value: max })
  } else if (type.kind === 'list') {
    if (!min) edges.push({ value: [] })
  } else if (type.kind === 'choice' && Array.isArray(type.values))
    for (const one of type.values) edges.push({ value: one })
  else if (type.kind === 'link' && typeof type.table === 'string') edges.push({ link: type.table })
  if (type.optional === true) edges.push({ left: true })
  return edges
}

/** A path of a screen that names no value of a row: the one address a case may open. */
const plainPath = (path: unknown): path is string =>
  typeof path === 'string' && !path.includes(':') && !path.includes('*')

/**
 * Takes a description. Answers every case made from it, deterministic, each kind in the order of the names of the
 * definitions: what each caller gets of each function and each offered flow, of each route whose address names no
 * value, asked by each caller a request can be, of each command of the app's own, run by each caller but nobody, and
 * of reading, adding to, changing and removing each table, with the owner and another user where the table names an
 * owner, and the system in the tenant of the row and in another tenant where it names a tenant; each field of the input
 * of each function at the values its type takes at its edges; and each form of each screen whose address names no
 * value, sent empty, with a sample and with each field of a text, a number or a choice at its edges.
 */
export function declaredCases(description: Description): Cases {
  const roles = rolesOf(description)
  const access: AccessCase[] = []
  // A flow is called where it states who may call it, and an agent, a flow too, by its own `access`.
  const ruleOfFlow = (flow: Stored): unknown => flow.access ?? (isStored(flow.agent) ? flow.agent.access : undefined)
  const callable: [string, Stored, unknown][] = [
    ...Object.entries(description.functions).map(([name, record]): [string, Stored, unknown] => [
      name,
      record,
      record.access,
    ]),
    ...Object.entries(description.flows).flatMap(([name, flow]): [string, Stored, unknown][] =>
      ruleOfFlow(flow) === undefined ? [] : [[name, flow, ruleOfFlow(flow)]],
    ),
  ].sort(([a], [b]) => byName(a, b))
  for (const [name, record, rule] of callable)
    for (const caller of callersOf(roles, record.offer))
      access.push({ definition: name, of: 'call', what: 'access', rule, caller })
  for (const [name, record] of Object.entries(description.routes).sort(([a], [b]) => byName(a, b)))
    if (plainPath(record.path))
      for (const caller of callersOf(roles, undefined).filter((one) => one.kind !== 'system'))
        access.push({ definition: name, of: 'route', what: 'access', rule: record.access, caller })
  for (const [name, record] of Object.entries(description.commands).sort(([a], [b]) => byName(a, b)))
    for (const caller of callersOf(roles, undefined).filter((one) => one.kind !== 'nobody'))
      access.push({ definition: name, of: 'command', what: 'access', rule: record.access, caller })
  for (const [name, table] of Object.entries(description.tables).sort(([a], [b]) => byName(a, b))) {
    const rules: Stored = isStored(table.access) ? table.access : {}
    for (const what of ['read', 'add', 'change', 'remove'] as const) {
      const callers = callersOf(roles, undefined)
      if (typeof table.owner === 'string' && what !== 'add')
        callers.push({ words: 'the owner', kind: 'owner' }, { words: 'another user', kind: 'other' })
      // A row of one tenant is reached in its tenant alone, whoever asks: the system asks, past every rule.
      if (typeof table.tenant === 'string' && what !== 'add')
        callers.push(
          { words: 'the system, in the tenant of the row', kind: 'tenant' },
          { words: 'the system, in another tenant', kind: 'otherTenant' },
        )
      for (const caller of callers) access.push({ definition: name, of: 'table', what, rule: rules[what], caller })
    }
  }
  const edges: EdgeCase[] = []
  for (const [name, record] of Object.entries(description.functions).sort(([a], [b]) => byName(a, b))) {
    const input: Stored = isStored(record.input) ? record.input : {}
    for (const [field, type] of Object.entries(input).sort(([a], [b]) => byName(a, b)))
      if (isStored(type)) for (const edge of edgesOf(type)) edges.push({ definition: name, field, type, ...edge })
  }
  const forms: FormCase[] = []
  for (const [screen, record] of Object.entries(description.screens).sort(([a], [b]) => byName(a, b))) {
    if (!plainPath(record.path)) continue
    const calls = Array.isArray(record.calls) ? record.calls.map(String).sort(byName) : []
    for (const name of calls) {
      const fn: unknown = Object.hasOwn(description.functions, name) ? description.functions[name] : undefined
      if (!isStored(fn) || fn.kind === 'query' || !isStored(fn.input)) continue
      const base = { definition: name, screen, path: record.path }
      forms.push({ ...base, sent: 'empty' }, { ...base, sent: 'sample' })
      for (const [field, type] of Object.entries(fn.input).sort(([a], [b]) => byName(a, b)))
        if (isStored(type) && ['text', 'number', 'choice'].includes(String(type.kind)))
          for (const edge of edgesOf(type)) if (!edge.left) forms.push({ ...base, sent: { field, value: edge.value } })
    }
  }
  return { access, edges, forms }
}

/** A rule in the words it is written with: `role('staff')`, `signedIn`, `anyone`, or a rule written as code. */
export function ruleWords(rule: unknown): string {
  const stored: Stored = isStored(rule) ? rule : {}
  if (stored.rule === 'role') return `role('${String(stored.role)}')`
  if (stored.rule === 'where' || stored.rule === 'allow') return 'a rule written as code'
  return typeof stored.rule === 'string' ? stored.rule : 'no rule'
}

/** Why a rule refuses a caller, in a few words, where the rule says it. */
export function refusalWords(rule: unknown): string {
  const stored: Stored = isStored(rule) ? rule : {}
  if (stored.rule === 'role') return ` (needs role '${String(stored.role)}')`
  if (stored.rule === 'signedIn') return ' (needs a signed-in caller)'
  if (stored.rule === 'owner') return ' (needs the owner of the row)'
  if (stored.rule === 'nobody') return ' (lets nobody in)'
  return ''
}

/** A type in the words it is written with: its kind and the bounds that make its edges. */
export function typeWords(type: Stored): string {
  if (type.kind === 'choice' && Array.isArray(type.values))
    return `choice(${type.values.map((one) => valueWords(one)).join(', ')})`
  if (type.kind === 'link') return `link('${String(type.table)}')`
  const bounds = ['min', 'max', 'optional'].flatMap((name) =>
    type[name] === undefined ? [] : [`${name}: ${String(type[name])}`],
  )
  return `${String(type.kind)}(${bounds.length ? `{ ${bounds.join(', ')} }` : ''})`
}

/** A value in the words a line shows it with: a text in single quotes, and anything else as JSON. */
export const valueWords = (value: unknown): string =>
  typeof value === 'string' ? `'${value.replaceAll("'", "\\'")}'` : (JSON.stringify(value) ?? String(value))
