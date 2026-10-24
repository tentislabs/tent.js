import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { providerAddresses } from '../core/internal.ts'

/** What an agent that builds may read, change and call in a workspace: the `policy` of `agent`. */
export interface Policy {
  read: string[]
  edit: string[]
  create: string[]
  remove: string[]
  tools: string[]
  ask: string[]
  reaches: string[]
  also: string[]
  mode: 'build' | 'propose' | 'frozen'
}

// The project tools that write, which the mode `propose` takes away with `run`.
const writing = ['edit', 'write', 'rename', 'remove']

const textsOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])

/**
 * The policy of an agent from its stored record, with what holds where a field is left out: nothing is allowed,
 * and the mode is `build`. Nothing for an agent that states no policy: it is given no tool.
 */
export function policyOf(record: object): Policy | undefined {
  const stated: unknown = Reflect.get(Object(Reflect.get(record, 'agent')), 'policy')
  if (typeof stated !== 'object' || stated === null) return undefined
  const of = (name: string): unknown => Reflect.get(stated, name)
  const mode = of('mode')
  return {
    read: textsOf(of('read')),
    edit: textsOf(of('edit')),
    create: textsOf(of('create')),
    remove: textsOf(of('remove')),
    tools: textsOf(of('tools')),
    ask: textsOf(of('ask')),
    reaches: textsOf(of('reaches')),
    also: textsOf(of('also')),
    mode: mode === 'propose' || mode === 'frozen' ? mode : 'build',
  }
}

/** The project tools a policy offers: those it names, less what its mode takes away. */
export function toolsOf(policy: Policy): string[] {
  if (policy.mode === 'frozen') return []
  return policy.mode === 'propose'
    ? policy.tools.filter((one) => !writing.includes(one) && one !== 'run')
    : policy.tools
}

/** Whether an entry of a policy covers a definition: `'*'`, its kind, or its kind with a name, as `'screen:orders*'`. */
function covers(entry: string, kind: string, name: string): boolean {
  if (entry === '*' || entry === kind) return true
  const [of, pattern] = entry.split(':')
  if (of !== kind || pattern === undefined) return false
  return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(name)
}

/** Whether a list of a policy covers a definition of a kind and a name. */
export const allows = (list: string[], kind: string, name: string): boolean =>
  list.some((one) => covers(one, kind, name))

// The parts of a description that hold definitions by their names.
const parts = [
  'tables',
  'functions',
  'flows',
  'screens',
  'components',
  'services',
  'models',
  'routes',
  'incoming',
  'commands',
]

/** The kind of a definition as a policy names it: one of the ten words, `agent`, `python`, `route`, `incoming`, `command`. */
function kindOf(part: string, record: Record<string, unknown>): string {
  if (part === 'functions') return record.python !== undefined ? 'python' : String(record.kind ?? 'action')
  if (part === 'flows') return record.agent !== undefined ? 'agent' : 'flow'
  return part.replace(/s$/, '')
}

/** One definition of a description: its kind, its stored record, and the file it lies in. */
export interface Placed {
  kind: string
  record: Record<string, unknown>
  file?: string
}

/** Every definition of a description by its name, the project among them, with the file that holds it. */
export function definitionsOf(description: Description | undefined): Map<string, Placed> {
  const found = new Map<string, Placed>()
  if (!description) return found
  const places: Record<string, unknown> = Object(Reflect.get(description, 'places'))
  const fileOf = (name: string): string | undefined => {
    const file: unknown = Reflect.get(Object(places[name]), 'file')
    return typeof file === 'string' ? file : undefined
  }
  for (const part of parts) {
    const all: Record<string, unknown> = Object(Reflect.get(description, part))
    for (const [name, record] of Object.entries(all)) {
      const file = fileOf(name)
      found.set(name, { kind: kindOf(part, Object(record)), record: Object(record), ...(file ? { file } : {}) })
    }
  }
  const project: Record<string, unknown> = Object(Reflect.get(description, 'project'))
  const name = String(Reflect.get(Object(Reflect.get(description, 'app')), 'name') ?? '')
  const file = fileOf(name)
  if (name !== '') found.set(name, { kind: 'project', record: project, ...(file ? { file } : {}) })
  return found
}

/** The hosts that a definition names: the address of a service, the place of a model or of its provider, and the `hosts` of the project. */
function hostsOf(placed: Placed): string[] {
  const host = (address: unknown): string[] => {
    if (typeof address !== 'string') return []
    try {
      return [new URL(address).hostname.toLowerCase()]
    } catch {
      return []
    }
  }
  if (placed.kind === 'service') {
    // A service sends its client secret and its tokens to the addresses of its auth too.
    const oauth: unknown = Reflect.get(Object(placed.record.auth), 'oauth')
    const auth = ['authorizeUrl', 'tokenUrl', 'revokeUrl'].flatMap((key) => host(Reflect.get(Object(oauth), key)))
    return [...host(placed.record.url), ...auth]
  }
  // A model that names its provider reaches the provider's address.
  if (placed.kind === 'model') {
    const provider = placed.record.provider
    return host(placed.record.url ?? (typeof provider === 'string' ? providerAddresses[provider] : undefined))
  }
  if (placed.kind === 'project')
    return textsOf(placed.record.hosts).flatMap((one) => host(one.includes('://') ? one : `https://${one}`))
  return []
}

/** What a definition states that only `also` opens: `system` on a definition, and the options of `project` that open the app wider. */
function widerOf(placed: Placed): string[] {
  const wider: string[] = []
  if (typeof placed.record.system === 'string') wider.push('system')
  if (placed.kind !== 'project') return wider
  const project = placed.record
  if (project.unlock !== undefined) wider.push('unlock')
  if (Reflect.get(Object(project.api), 'origins') !== undefined) wider.push('api.origins')
  if (project.cookies !== undefined) wider.push('cookies')
  if (project.framedBy !== undefined) wider.push('framedBy')
  if (project.privateHosts !== undefined) wider.push('privateHosts')
  if (project.roots !== undefined) wider.push('roots')
  return wider
}

/** Whether a description holds starter data that was read: a list of writes, or an arrow in its stored form. */
function plainSeed(description: Description | undefined): boolean {
  const seed: unknown = description?.seed
  return typeof seed === 'object' && seed !== null && ('writes' in seed || 'body' in seed)
}

/** What a write needs of the policy, and what it waits for the person for. */
export interface Needs {
  refused?: string
  asks: string[]
}

/**
 * Takes a policy, the description before a write and after it, the files that were written, each with its path and
 * whether it was removed, a definition the write renamed, and the kinds that the tool's own writing changes. Holds,
 * for each file, the names that it held before against the names it holds now: a name that is gone needs `remove`, a
 * new one `create`, and one whose record changed `edit`, each for the kind of that definition, and each waits for the
 * person where `ask` names it (a rename by `rename`). A file that holds no definition needs the kind `file`, and a
 * `seed.ts` that is written as code the kind `seed`. A definition of a file that was not written is held as much
 * where the write changed its record, as one that takes an imported value does. Then no definition that changed may
 * state an option of the `also` list that the policy does not name, nor name a host outside `reaches`. Answers what
 * is refused, with its rule, and what the person is asked.
 */
export function needsOf(
  policy: Policy,
  before: Description | undefined,
  after: Description | undefined,
  files: { path: string; removed: boolean }[],
  o: { renamed?: { from: string; to: string }; free?: string[] } = {},
): Needs {
  const { renamed } = o
  // A kind that the tool's own writing changes, as `removed` on `project`, needs no right of its own.
  const free = (kind: string): boolean => o.free?.includes(kind) === true
  const [was, now] = [definitionsOf(before), definitionsOf(after)]
  const placedIn = (all: Map<string, Placed>, paths: Set<string>): Map<string, Placed> =>
    new Map([...all].filter(([, placed]) => paths.has(placed.file ?? '')))
  const asks = new Set<string>()
  const changed: [string, Placed][] = []
  const heldOne = (held: Map<string, Placed>, holds: Map<string, Placed>): string | undefined => {
    for (const [name, placed] of held) {
      const kept = renamed?.from === name ? holds.get(renamed.to) : holds.get(name)
      if (kept && renamed?.from === name) {
        if (!allows(policy.edit, placed.kind, name)) return `edit ${placed.kind} ${name}`
        if (policy.ask.includes('rename')) asks.add('rename')
        changed.push([renamed.to, kept])
      } else if (!kept) {
        if (!allows(policy.remove, placed.kind, name)) return `remove ${placed.kind} ${name}`
        if (policy.ask.includes('remove')) asks.add('remove')
      } else if (JSON.stringify(kept.record) !== JSON.stringify(placed.record)) {
        if (free(placed.kind)) continue
        if (!allows(policy.edit, placed.kind, name)) return `edit ${placed.kind} ${name}`
        if (policy.ask.includes('edit')) asks.add('edit')
        changed.push([name, kept])
      }
    }
    for (const [name, placed] of holds) {
      if (held.has(name) || renamed?.to === name) continue
      if (!allows(policy.create, placed.kind, name)) return `create ${placed.kind} ${name}`
      if (policy.ask.includes('create')) asks.add('create')
      changed.push([name, placed])
    }
    return undefined
  }
  for (const { path, removed } of files) {
    const [held, holds] = [placedIn(was, new Set([path])), placedIn(now, new Set([path]))]
    const refused = heldOne(held, holds)
    if (refused) return { refused, asks: [] }
    // A file that holds no definition is the kind `file`, but a `seed.ts` written as code, which is the kind `seed`.
    const kind = path === 'seed.ts' && !removed && !plainSeed(after) ? 'seed' : 'file'
    if (!held.size && !holds.size && !allows(policy.edit, kind, path) && !allows(policy.create, kind, path))
      return { refused: `edit ${kind} ${path}`, asks: [] }
  }
  // The definitions of the files that were not written, whose records a written file may change all the same.
  const written = new Set(files.map((one) => one.path))
  const rest = (all: Map<string, Placed>): Map<string, Placed> =>
    new Map([...all].filter(([, placed]) => !written.has(placed.file ?? '') && !free(placed.kind)))
  const refused = heldOne(rest(was), rest(now))
  if (refused) return { refused, asks: [] }
  for (const [name, placed] of changed) {
    for (const option of widerOf(placed))
      if (!policy.also.includes(option)) return { refused: `also ${option} on ${name}`, asks: [] }
    for (const host of hostsOf(placed))
      if (!policy.reaches.includes('*') && !policy.reaches.includes(host))
        return { refused: `reaches ${host} from ${name}`, asks: [] }
  }
  return { asks: [...asks] }
}

/** The error of a write that the policy refuses: T9105, with the rule that was broken, which the model is handed. */
export const refusedBy = (rule: string): TentError =>
  new TentError('T9105', `The policy of the agent does not allow this: ${rule}.`, {
    fields: { rule },
    fix: 'Write the change within the policy: the kinds of definition it may create, edit and remove, the hosts it may reach and the options it opens.',
  })
