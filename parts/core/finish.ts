import { filesOf } from './describe.ts'
import type { Description } from './description.ts'
import { isStored } from './record.ts'
import { sendsOut } from './sendsOut.ts'

/** What the build made of a project, which `finish` writes into the description. */
interface Built {
  modules: Record<string, string>
  stepNames?: Record<string, object[]>
  serviceCalls?: Record<string, object>
  tiedTo?: Record<string, string>
  sources: Record<string, string>
  browser?: object
  server?: object
  cli?: object
  api?: object
  mcp?: object
  python?: object
}

/** Fills the module of everything in a record that is stored as code: what holds an export and no module yet. */
function fill(record: unknown, module: string | undefined): void {
  if (Array.isArray(record)) for (const one of record) fill(one, module)
  if (!isStored(record)) return
  if (typeof record.export === 'string' && record.module === undefined && module !== undefined) record.module = module
  for (const one of Object.values(record)) fill(one, module)
}

/**
 * Takes a description, and what the build made after it: the built module of each source file, the step names of
 * the code flows, the calls that were read for a service, what is tied to SQLite, the fingerprints of the sources,
 * and the records of what was built. Answers the description with all of it filled in, and with `sends` worked
 * out for each action and each flow whose `run` was read.
 */
export function finish(description: Description, built: Built): Description {
  const files = filesOf.get(description) ?? new Map<string, string>()
  const done: Description = structuredClone(description)
  filesOf.set(done, files)
  const groups = [done.tables, done.functions, done.flows, done.routes, done.commands, done.backfills ?? {}]
  for (const group of groups)
    for (const [name, record] of Object.entries(group)) fill(record, built.modules[files.get(name) ?? ''])
  fill(done.project, built.modules[files.get(done.app.name) ?? ''])
  if (done.seed && done.seed.writes === undefined && done.seed.body === undefined)
    done.seed.module = built.modules['seed.ts']
  for (const [name, steps] of Object.entries(built.stepNames ?? {}))
    if (done.flows[name]) done.flows[name].stepNames = steps
  for (const [name, calls] of Object.entries(built.serviceCalls ?? {})) {
    const service = done.services[name]
    if (service) service.calls = { ...(isStored(service.calls) ? service.calls : {}), ...calls }
  }
  for (const [name, store] of Object.entries(built.tiedTo ?? {})) {
    const record = done.functions[name] ?? done.flows[name] ?? done.routes[name]
    if (record) record.tiedTo = store
  }
  done.sources = { ...built.sources }
  for (const part of ['browser', 'server', 'cli', 'api', 'mcp', 'python'] as const) {
    const made = built[part]
    if (made !== undefined) done[part] = { ...made }
  }
  // With every call of every service known, a plain action and a plain flow that reach nothing which sends say so.
  for (const [name, record] of [...Object.entries(done.functions), ...Object.entries(done.flows)]) {
    const plain = Array.isArray(record.body) && (record.kind === 'action' || record.kind === undefined)
    if (plain && record.sends === undefined && !sendsOut(done, name)) record.sends = false
  }
  return done
}
