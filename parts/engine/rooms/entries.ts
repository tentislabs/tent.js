import type { Description } from '../../core/internal.ts'
import { isStored } from '../../core/internal.ts'
import { flowKey } from '../flows/code.ts'
import type { Entry, Kind } from './room.ts'

/**
 * One entry of a version, with where the engine keeps what the room answers for it: `run` the arrows of the
 * functions and of the flows, `allow` those of the rules made with `allow`, `rule` the rules of the tables, `route`
 * and `routeRule` the routes, `project` the project's own arrows, `backfill` the backfills, and `seed` the seed.
 * `name` is the name it is kept under there, and `or` a second way to the same arrow, where the first finds none.
 */
export interface Kept {
  keep: 'run' | 'allow' | 'rule' | 'route' | 'routeRule' | 'project' | 'backfill' | 'seed'
  name: string
  entry: Entry
  or?: string[]
  // What the entry is, as the error of a bundle that lacks it names it.
  what: string
}

/** What a version names of its code: every entry, and each module with the kinds of entry that need it. */
export interface Named {
  entries: Kept[]
  modules: { path: string; kinds: Kind[] }[]
}

type Stored = Record<string, unknown>

const recordOf = (value: unknown): Stored => (isStored(value) ? value : {})

/** The module and the export of a record stored as code, or nothing for one that is not. */
function codeOf(stored: unknown): { module: string; export: string } | undefined {
  const record = recordOf(stored)
  return typeof record.module === 'string' && typeof record.export === 'string'
    ? { module: record.module, export: record.export }
    : undefined
}

/** The read rule of each column of a table that states one, by `columns.<column>`, as the rules of the table stand by what they rule. */
function columnRules(record: Stored): [string, unknown][] {
  return Object.entries(recordOf(record.columns)).flatMap(([column, type]): [string, unknown][] => {
    const rule: unknown = Reflect.get(Object(type), 'read')
    return rule === undefined ? [] : [[`columns.${column}.read`, rule]]
  })
}

/** The entries of the flows: the `run` and the rule of each that is code, its own `onFail` and `onStop`, and the arrows of its options. */
function flowEntries(flows: Record<string, Stored>, add: (kept: Kept) => void): void {
  for (const [name, record] of Object.entries(flows)) {
    const module = typeof record.module === 'string' ? record.module : undefined
    const exported = typeof record.export === 'string' ? record.export : name
    if (module !== undefined && !Array.isArray(record.body))
      add({
        keep: 'run',
        name: flowKey(name),
        entry: { kind: 'flow', module, path: [exported, 'options', 'run'] },
        what: `the \`run\` of ${name}`,
      })
    for (const which of ['onFail', 'onStop'] as const) {
      const last = Array.isArray(record[which]) ? {} : recordOf(record[which])
      if (typeof last.module !== 'string') continue
      add({
        keep: 'run',
        name: flowKey(name, which),
        entry: { kind: 'flow', module: last.module, path: [`${name}_${which}`] },
        or: [exported, 'options', which],
        what: `the \`${which}\` of ${name}`,
      })
    }
    // The arrows of its options, each stored with the module that holds its definition.
    const moduleOf = (stored: unknown): string => String(recordOf(stored).module)
    const option = (which: string, stored: unknown, path: string[], or?: string[]): void =>
      add({
        keep: 'run',
        name: flowKey(name, which),
        entry: { kind: 'flow', module: moduleOf(stored), path: [exported, 'options', ...path] },
        ...(or ? { or: [exported, 'options', ...or] } : {}),
        what: `the ${which} of ${name}`,
      })
    if (record.key !== undefined) option('key', record.key, ['key'])
    const order: unknown = recordOf(record.pace).order
    if (order !== undefined) option('pace.order', order, ['pace', 'order'])
    const stops = Array.isArray(record.stopOn) ? record.stopOn : []
    // A `stopOn` that was written as one event is stored as a list of one: its key stands under it as written.
    for (const [at, stop] of stops.entries())
      option(`stopOn.${at}`, recordOf(stop).key, ['stopOn', String(at), 'key'], ['stopOn', 'key'])
    // An agent keeps its rule inside its own record, and takes the rules of a function as a flow does.
    const access = codeOf(record.access ?? recordOf(record.agent).access)
    if (access)
      add({
        keep: 'allow',
        name: flowKey(name),
        entry: { kind: 'rule', module: access.module, path: [access.export] },
        what: `the rule of ${name}`,
      })
  }
}

/**
 * Takes the description of a version. Answers every entry it names, with its kind, and each module with the kinds
 * that need it: the `run` of each function that is code and the arrow of its rule, the rules of the tables, the
 * flows, the routes, the project's own arrows, the backfills, the seed, and each module of a code view.
 */
export function entriesOf(description: Description): Named {
  const entries: Kept[] = []
  const add = (kept: Kept): void => void entries.push(kept)
  for (const [name, record] of Object.entries(description.functions)) {
    // A `python` is carried out by a Python program: its module holds the definition, and no `run` of it.
    const python = typeof record.python === 'object' && record.python !== null
    if (!python && typeof record.module === 'string' && typeof record.export === 'string') {
      const kind =
        record.kind === 'query' || record.kind === 'change' || record.kind === 'action' ? record.kind : 'action'
      add({
        keep: 'run',
        name,
        entry: { kind, module: record.module, path: [record.export, 'options', 'run'] },
        what: `the \`run\` of ${name}`,
      })
    }
    const access = codeOf(record.access)
    if (access)
      add({
        keep: 'allow',
        name,
        entry: { kind: 'rule', module: access.module, path: [access.export] },
        what: `the rule of ${name}`,
      })
  }
  for (const [name, record] of Object.entries(description.tables))
    for (const [what, rule] of [...Object.entries(recordOf(record.access)), ...columnRules(record)]) {
      const code = codeOf(rule)
      if (code)
        add({
          keep: 'rule',
          name: code.export,
          entry: { kind: 'rule', module: code.module, path: [code.export] },
          what: `the rule ${what} of ${name}`,
        })
    }
  flowEntries(description.flows, add)
  for (const [name, record] of Object.entries(description.routes)) {
    const run = codeOf(record)
    if (run)
      add({
        keep: 'route',
        name,
        entry: { kind: 'route', module: run.module, path: [run.export, 'options', 'run'] },
        what: `the \`run\` of the route ${name}`,
      })
    else
      add({
        keep: 'route',
        name,
        entry: { kind: 'route', module: '', path: [] },
        what: `the \`run\` of the route ${name}`,
      })
    const access = codeOf(record.access)
    if (access && run)
      add({
        keep: 'routeRule',
        name,
        entry: { kind: 'rule', module: access.module, path: [access.export] },
        what: `the rule of the route ${name}`,
      })
  }
  for (const [option, stored] of Object.entries(description.project)) {
    const code = codeOf(stored)
    if (!code) continue
    const kind: Kind = option === 'identify' ? 'identify' : option === 'onRequest' ? 'onRequest' : 'rule'
    add({ keep: 'project', name: option, entry: { kind, module: code.module, path: [code.export] }, what: option })
  }
  for (const [name, record] of Object.entries(description.backfills ?? {})) {
    const run = codeOf(recordOf(record).run)
    // A backfill writes rows at once, in a write of its own, as a change does.
    add({
      keep: 'backfill',
      name,
      entry: { kind: 'change', module: run?.module ?? '', path: run ? [run.export] : [] },
      what: `the \`run\` of the backfill ${name}`,
    })
  }
  const seed = description.seed
  if (seed && typeof seed.module === 'string' && !Array.isArray(seed.writes) && !Array.isArray(seed.body))
    add({
      keep: 'seed',
      name: 'seed',
      entry: { kind: 'seed', module: seed.module, path: ['default', 'seed'] },
      what: 'the seed',
    })
  const kinds = new Map<string, Set<Kind>>()
  const needs = (module: string, kind: Kind): void => {
    if (module === '') return
    const held = kinds.get(module) ?? new Set<Kind>()
    held.add(kind)
    kinds.set(module, held)
  }
  for (const { entry } of entries) needs(entry.module, entry.kind)
  for (const file of Object.values(recordOf(recordOf(description.server).views)))
    if (typeof file === 'string') needs(file, 'view')
  return { entries, modules: [...kinds].map(([path, held]) => ({ path, kinds: [...held] })) }
}
