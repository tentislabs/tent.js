import type { Description } from './description.ts'
import type { Finding } from './errors.ts'
import { TentError } from './errors.ts'
import { finding } from './finding.ts'
import type { Fault } from './itself.ts'
import { faultOf } from './itself.ts'
import { isMarked } from './mark.ts'
import type { Stored } from './record.ts'
import { isStored } from './record.ts'
import { heldToTenants } from './stored/tenant.ts'
import { storedBody } from './stored/body.ts'
import { fitted, netted } from './stored/fits.ts'
import { agentOf, flowOf } from './stored/flow.ts'
import { writesHeld } from './stored/from.ts'
import { functionOf } from './stored/function.ts'
import { heldWords } from './stored/held.ts'
import { keepAt, keptAt } from './stored/kept.ts'
import { backfillOf } from './stored/backfill.ts'
import { commandOf, incomingOf, routeOf } from './stored/others.ts'
import { placesOf } from './stored/places.ts'
import { projectOf } from './stored/project.ts'
import { componentOf, deviceRoom, screenOf } from './stored/screen.ts'
import { modelOf, serviceOf } from './stored/service.ts'
import type { Loaded, Told } from './stored/shared.ts'
import { isCamelCase, optionsOf, report } from './stored/shared.ts'
import { tableOf } from './stored/table.ts'
import { takenIn } from './stored/taken.ts'
import { heldValue } from './stored/type.ts'
import { coreVersion } from './version.ts'

const kinds = [
  'query',
  'change',
  'action',
  'flow',
  'agent',
  'table',
  'service',
  'model',
  'project',
  'screen',
  'component',
  'route',
  'incoming',
  'command',
  'backfill',
]
const reservedNames = ['mail', 'files']
const reservedTables = ['system', 'sql', 'n', 'read', 'write']

/** The source file of each definition of a description, kept beside it for the build to fill its modules by. */
export const filesOf = new WeakMap<Description, Map<string, string>>()

/** What a loaded value is: a definition with its name, its kind and its options, or the starter data. */
function definitionOf(value: unknown): { name: string; kind: string; options: Stored } | undefined {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return undefined
  const [name, kind, options]: unknown[] = ['definition', 'kind', 'options'].map((member) => Reflect.get(value, member))
  return typeof name === 'string' && typeof kind === 'string' ? { name, kind, options: optionsOf(options) } : undefined
}

/** Reports a name that is taken, of the wrong form, or reserved for its kind. */
function nameHeld(told: Told, kind: string, exportName: string | undefined): void {
  const { name } = told
  if (exportName !== undefined && exportName !== name)
    report(
      told,
      'T1002',
      `it is exported as ${exportName} and states the name ${name}.`,
      'Give the export and the definition one name.',
    )
  // A component is written as a tag, so its name starts with a capital letter.
  if (kind === 'component' ? !/^[A-Z][a-zA-Z0-9]*$/.test(name) : !isCamelCase(name) && !name.startsWith('_t_'))
    report(
      told,
      'T1013',
      kind === 'component'
        ? 'its name is not a capital letter followed by letters and digits.'
        : 'its name is not camelCase letters and digits.',
      kind === 'component'
        ? 'Start the name with a capital letter, and write letters and digits alone.'
        : 'Start the name with a small letter, and write letters and digits alone.',
    )
  if (name.startsWith('_t_') || reservedNames.includes(name) || (kind === 'table' && reservedTables.includes(name)))
    report(told, 'T1009', `the name \`${name}\` is reserved.`, 'Give the definition another name.')
}

/**
 * Reports what was loaded with a value that no stored form holds, by the way to that value: T1014. Such a value
 * holds itself, is nested more than 200 deep, stands in too many places, or is of a kind that a written value may
 * not hold.
 */
function leftOut(told: Told, fault: Fault): void {
  const fix =
    'Write a value that a stored form holds: text, a number, true, false, a list, a record, or a word of ours.'
  const such = fault.why === 'itself' ? 'a value that holds itself' : 'such a value'
  if (told.name) report(told, 'T1014', `\`${fault.at}\` ${fault.words}, and ${such} has no stored form.`, fix)
  else told.findings.push(finding('T1014', 'A value that has no stored form was handed to describe.', { fix }))
}

/**
 * The net around one definition. Carries a piece of the work of describing it out, and answers whether it ended.
 * Whatever is thrown there is a finding on that definition, T1014 with the words of the error, or the code of a
 * failure of ours: it is what nobody foresaw, and `describe` never throws for what a definition holds.
 */
function ended(told: Told, work: () => void): boolean {
  try {
    work()
    return true
  } catch (error) {
    const words = error instanceof Error ? error.message : 'a value was thrown that is no error'
    const fix = 'Write the definition so that reading it throws nothing.'
    const code = error instanceof TentError ? error.code : 'T1014'
    if (told.name) report(told, code, `it could not be described: ${words}`, fix)
    else told.findings.push(finding(code, `What was handed to describe could not be read: ${words}`, { fix }))
    return false
  }
}

/** The names that are reserved for what a definition is offered to: the API, MCP, and the app's own command line. */
function offered(told: Told, kind: string, o: Stored, project: Stored): void {
  const offer = Array.isArray(o.offer) ? o.offer : []
  const reserved = (why: string) =>
    report(
      told,
      'T1009',
      `the name \`${told.name}\` is reserved ${why}.`,
      'Give it another name, or name it in `names` of the project.',
    )
  if (
    offer.includes('api') &&
    told.name === 'docs' &&
    keptAt(optionsOf(optionsOf(project.api).names), told.name) === undefined
  )
    reserved('for a function that is offered to the API')
  const tool = keptAt(optionsOf(optionsOf(project.mcp).names), told.name) ?? told.name
  if (offer.includes('mcp')) {
    if (tool === 'findFunction' || tool === 'callFunction') reserved('for a function that is offered to MCP')
    if (String(tool).length > 64)
      report(
        told,
        'T1014',
        'its name is longer than the 64 characters that a tool of MCP may have.',
        'Give its tool a shorter name in `mcp.names` of the project.',
      )
  }
  const word =
    keptAt(optionsOf(optionsOf(project.cli).names), told.name) ??
    told.name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
  if (
    (offer.includes('cli') || kind === 'command') &&
    ['login', 'logout', 'whoami', 'help', 'file'].includes(String(word))
  )
    reserved('for a word of the command line')
}

/** One definition as `all` holds it: its kind, its options as they were written, and what the build loaded. */
type Entry = { kind: string; options: Stored; loaded: Loaded }

/** One thing that describing a definition read of the others, with what it found. */
type Read =
  | { name: string; what: 'absent' }
  | { name: string; what: 'present' }
  | { name: string; what: 'kind'; kind: string }
  | { name: string; what: 'options'; options: Stored }
  | { name: string; what: 'loaded'; loaded: Loaded }
  | { what: 'all'; names: string }
  | { what: 'project'; options: Stored }
  | { what: 'written' }

/**
 * What describing a screen or a component made of it alone: its record, what was found, and what it read of the
 * other definitions. A build hands the same object again for a file whose text and imports did not change: what
 * was made is then handed again where everything it read is as it was, and its record is the very record.
 */
interface Described {
  loaded: Loaded
  reads: Read[]
  record: Stored
  findings: Finding[]
}

const describedOf = new WeakMap<object, Described[]>()

/** The walk of each definition that decides what it may hold, kept by the object the build handed, as it was handed. */
const walkedOf = new WeakMap<
  object,
  { bodies?: object; views?: object; one: ReturnType<typeof definitionOf>; fault: Fault | undefined }
>()

/** Whether two values that a definition wrote hold the same: plain records and lists by what they hold, anything else by itself. */
function sameWritten(one: unknown, other: unknown, depth = 0): boolean {
  if (Object.is(one, other)) return true
  if (typeof one !== 'object' || typeof other !== 'object' || one === null || other === null || depth > 64) return false
  if (Array.isArray(one))
    return (
      Array.isArray(other) &&
      one.length === other.length &&
      one.every((held, at) => sameWritten(held, other[at], depth + 1))
    )
  const plain = (value: object): boolean => [Object.prototype, null].includes(Object.getPrototypeOf(value))
  if (!plain(one) || !plain(other)) return false
  const keys = Reflect.ownKeys(one)
  return (
    keys.length === Reflect.ownKeys(other).length &&
    keys.every(
      (key) => Object.hasOwn(other, key) && sameWritten(Reflect.get(one, key), Reflect.get(other, key), depth + 1),
    )
  )
}

/** Whether a definition was loaded as it was before: each field, by itself. */
const sameLoaded = (one: Loaded, other: Loaded): boolean => {
  const keys = Object.keys(one)
  return (
    keys.length === Object.keys(other).length &&
    keys.every((key) => Object.is(Reflect.get(one, key), Reflect.get(other, key)))
  )
}

/**
 * Takes what all holds, and the names and kinds of all as one text. Answers a map over it that notes each thing a
 * describing reads into the reads it is told, so that what it made can be held to what it read. Each entry is
 * wrapped once: the definitions are described one after another, each with reads of its own.
 */
function watched(
  all: Map<string, Entry>,
  namesNow: () => string,
): { map: Map<string, Entry>; noting(reads: Read[]): void } {
  let reads: Read[] = []
  const note = (read: Read): void => void reads.push(read)
  // The wrap of each entry, by its name: one that notes the kind it is asked for, and one that goes through all,
  // whose kinds the names of all stand for.
  const wraps = new Map<string, { of: Entry; asked: Entry; through: Entry }>()
  const wrap = (name: string, one: Entry, kindKnown: boolean): Entry => {
    let held = wraps.get(name)
    if (held?.of !== one) {
      const made = (known: boolean): Entry => ({
        get kind() {
          if (!known) note({ name, what: 'kind', kind: one.kind })
          return one.kind
        },
        get options() {
          note({ name, what: 'options', options: one.options })
          return one.options
        },
        get loaded() {
          note({ name, what: 'loaded', loaded: one.loaded })
          return one.loaded
        },
      })
      held = { of: one, asked: made(false), through: made(true) }
      wraps.set(name, held)
    }
    return kindKnown ? held.through : held.asked
  }
  const through = function* (): Generator<[string, Entry]> {
    note({ what: 'all', names: namesNow() })
    for (const [name, one] of all) yield [name, wrap(name, one, true)]
  }
  const map = new (class extends Map<string, Entry> {
    override get(name: string): Entry | undefined {
      const one = all.get(name)
      if (!one) note({ name, what: 'absent' })
      return one && wrap(name, one, false)
    }
    override has(name: string): boolean {
      const has = all.has(name)
      note(has ? { name, what: 'present' } : { name, what: 'absent' })
      return has
    }
    override get size(): number {
      note({ what: 'all', names: namesNow() })
      return all.size
    }
    override set(name: string, one: Entry): this {
      note({ what: 'written' })
      all.set(name, one)
      return this
    }
    override delete(name: string): boolean {
      note({ what: 'written' })
      return all.delete(name)
    }
    override clear(): void {
      note({ what: 'written' })
      all.clear()
    }
    override entries(): MapIterator<[string, Entry]> {
      return Iterator.from(through())
    }
    override [Symbol.iterator](): MapIterator<[string, Entry]> {
      return Iterator.from(through())
    }
    override keys(): MapIterator<string> {
      return Iterator.from(through()).map(([name]) => name)
    }
    override values(): MapIterator<Entry> {
      return Iterator.from(through()).map(([, one]) => one)
    }
    override forEach(each: (one: Entry, name: string, map: Map<string, Entry>) => void): void {
      for (const [name, one] of through()) each(one, name, this)
    }
  })()
  return {
    map,
    noting: (into) => {
      reads = into
    },
  }
}

/** Whether what a describing read of the other definitions is as it was. */
function readAgain(reads: Read[], all: Map<string, Entry>, namesNow: () => string, project: Stored): boolean {
  return reads.every((read) => {
    if (read.what === 'written') return false
    if (read.what === 'all') return read.names === namesNow()
    if (read.what === 'project') return sameWritten(read.options, project)
    const one = all.get(read.name)
    if (read.what === 'absent') return one === undefined
    if (read.what === 'present') return one !== undefined
    if (read.what === 'kind') return one?.kind === read.kind
    if (read.what === 'options') return one !== undefined && sameWritten(one.options, read.options)
    return one !== undefined && sameLoaded(one.loaded, read.loaded)
  })
}

/**
 * Takes the definitions of a project as the build loaded them, with the messages and the assets. Answers the
 * description, and what was found: a name that differs from its export (T1002), an unknown option (T1003), a name
 * used twice (T1004), two forms at once (T1007), a required option left out (T1008), a reserved name (T1009), a
 * time, a size or a schedule that does not read (T1011), no project or more than one (T1012), a name of the wrong
 * form (T1013), and a value that is not allowed (T1014). It reads no file and asks no engine.
 */
export function describe(input: {
  definitions: Loaded[]
  messages?: Record<string, Record<string, string | Record<string, string>>>
  assets?: Record<string, { file: string; width?: number; height?: number }>
}): { description: Description; findings: Finding[] } {
  const findings: Finding[] = []
  const all: Told['all'] = new Map()
  const told = (name: string, loaded: Loaded): Told => ({ name, loaded, findings, all })
  const made: { name: string; kind: string; options: Stored; loaded: Loaded }[] = []
  let seed: Loaded | undefined
  let projectsLeftOut = 0
  const noDefinition: number[] = []
  for (const [at, loaded] of input.definitions.entries()) {
    // What the list holds in a place is the build's to hand, and is held here all the same.
    if (typeof loaded !== 'object' || loaded === null) {
      noDefinition.push(at + 1)
      continue
    }
    let one: ReturnType<typeof definitionOf>
    let fault: Fault | undefined
    const isSeed = isMarked(loaded.value) && 'seed' in loaded.value
    // The one walk that decides what a written value may hold. Every walk below follows it: what it refuses is
    // left out here, so none of them is handed it.
    const who = told(isSeed ? 'seed' : '', loaded)
    const read = ended(who, () => {
      const walked = walkedOf.get(loaded.value)
      if (walked && walked.bodies === loaded.bodies && walked.views === loaded.views) {
        one = walked.one
        fault = walked.fault
        if (one) who.name = one.name
      } else {
        one = definitionOf(loaded.value)
        if (one) who.name = one.name
        const written = one ? one.options : loaded.value
        // What is counted is what stands in the value of an option, as in a write it is what stands in a row: a
        // number inside 200 lists is taken there, and inside 201 it is refused.
        fault =
          faultOf(written, takenIn(written), -1) ??
          faultOf({ bodies: loaded.bodies, views: loaded.views }, takenIn(undefined), -1)
        walkedOf.set(loaded.value, { bodies: loaded.bodies, views: loaded.views, one, fault })
      }
    })
    if (!read || fault) {
      if (fault) leftOut(who, fault)
      if (one?.kind === 'project') projectsLeftOut++
    } else if (isSeed) seed = loaded
    else if (!one || !kinds.includes(one.kind))
      findings.push(
        finding('T1014', 'A value that is no definition was handed to describe.', {
          fix: 'Hand it what a word of ours returned.',
        }),
      )
    else if (all.has(one.name))
      report(told(one.name, loaded), 'T1004', 'two definitions have this name.', 'Give one of them another name.')
    else {
      all.set(one.name, { ...one, loaded })
      made.push({ ...one, loaded })
    }
  }
  const projects = made.filter((one) => one.kind === 'project')
  // A `project` that was left out was written all the same.
  const written = projects.length + projectsLeftOut
  if (written !== 1)
    findings.push(
      finding('T1012', written ? 'A project has more than one `project`.' : 'A project has no `project`.', {
        fix: 'Write exactly one `project`.',
      }),
    )
  for (const place of noDefinition) {
    const words = `place ${place} of the list that was handed to describe holds no definition.`
    const fix = 'Hand it a list of what the words of ours returned, each with where it stands.'
    if (projects[0]) report(told(projects[0].name, projects[0].loaded), 'T1014', words, fix)
    else findings.push(finding('T1014', `P${words.slice(1)}`, { fix }))
  }
  const projectOptions = projects[0]?.options ?? {}
  const description: Description = {
    format: 'tent.description/1',
    app: { name: projects[0]?.name ?? '', needsEngine: coreVersion },
    project: {},
    tables: {},
    functions: {},
    flows: {},
    screens: {},
    components: {},
    services: {},
    models: {},
    routes: {},
    incoming: {},
    commands: {},
    backfills: {},
    messages: input.messages ?? {},
    assets: input.assets ?? {},
    sources: {},
    places: {},
  }
  const files = new Map<string, string>()
  filesOf.set(description, files)
  /** Takes a definition out of the description, and out of what the other definitions read of it. */
  const takeOut = (name: string, kind: string): void => {
    all.delete(name)
    allText = undefined
    if (kind === 'project') description.project = {}
    for (const part of [
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
      'backfills',
    ] as const)
      delete description[part]?.[name]
  }
  // The names and the kinds of every definition as one text, made again where one is taken out.
  let allText: string | undefined
  const namesNow = (): string => {
    allText ??= [...all].map(([name, one]) => `${name} ${one.kind}`).join('\n')
    return allText
  }
  // What all holds, as a describing of a screen or a component reads it.
  const watching = watched(all, namesNow)
  // Each screen and component that was described anew, with its record and where its findings end.
  const fresh: { name: string; part: 'screens' | 'components'; value: object; described: Described; at: number }[] = []
  // Each screen and component whose record was handed again: it was held to the shape when it was made.
  const kept = new Set<string>()
  for (const { name, kind, options, loaded } of made) {
    if (loaded.file !== undefined) files.set(name, loaded.file)
    const part = kind === 'screen' ? 'screens' : kind === 'component' ? 'components' : undefined
    const held =
      part &&
      describedOf
        .get(loaded.value)
        ?.find((one) => sameLoaded(one.loaded, loaded) && readAgain(one.reads, all, namesNow, projectOptions))
    if (part && held) {
      keepAt(description[part], name, held.record)
      findings.push(...held.findings)
      kept.add(name)
      continue
    }
    const reads: Read[] = []
    watching.noting(reads)
    const one: Told = part ? { name, loaded, findings: [], all: watching.map } : told(name, loaded)
    if (part) reads.push({ what: 'project', options: projectOptions })
    const described = ended(one, () => {
      nameHeld(one, kind, loaded.exportName)
      offered(one, kind, options, projectOptions)
      // Whatever a word takes, each option that was written is held against what was stored of it here.
      const keep = (part: Exclude<keyof Description, 'project'>, record: Stored): void => {
        fitted(one, part, record, options)
        keepAt(Object(description[part]), name, record)
      }
      if (kind === 'project') {
        description.project = projectOf(one, options)
        fitted(one, 'project', description.project, options)
      } else if (kind === 'table') keep('tables', tableOf(one, options))
      else if (kind === 'query' || kind === 'change' || kind === 'action')
        keep('functions', functionOf(one, kind, options))
      else if (kind === 'flow') keep('flows', flowOf(one, options))
      else if (kind === 'agent') keep('flows', agentOf(one, options))
      else if (kind === 'screen') keep('screens', screenOf(one, options))
      else if (kind === 'component') keep('components', componentOf(one, options))
      else if (kind === 'service') keep('services', serviceOf(one, options))
      else if (kind === 'model') keep('models', modelOf(one, options))
      else if (kind === 'route') keep('routes', routeOf(one, options))
      else if (kind === 'incoming') keep('incoming', incomingOf(one, options))
      else if (kind === 'backfill') keep('backfills', backfillOf(one, options))
      else keep('commands', commandOf(one, options))
    })
    if (part) {
      findings.push(...one.findings)
      const record = keptAt(description[part], name)
      if (described && record)
        fresh.push({
          name,
          part,
          value: loaded.value,
          described: { loaded, reads, record, findings: one.findings },
          at: findings.length,
        })
    }
    if (!described) takeOut(name, kind)
  }
  for (const [name, { kind, loaded }] of [...all]) {
    const records = [description.tables, description.functions, description.flows, description.services]
    const record = name === description.app.name ? description.project : records.map((group) => keptAt(group, name))
    const one = told(name, loaded)
    if (!ended(one, () => heldWords(one, [record, keptAt(description.models, name), keptAt(description.routes, name)])))
      takeOut(name, kind)
  }
  // An incoming call names its flow, and the flow does not list it: it is added to what starts the flow.
  for (const [name, incoming] of Object.entries(description.incoming)) {
    const flow = keptAt(description.flows, String(incoming.then))
    if (flow) flow.on = [...(Array.isArray(flow.on) ? flow.on : []), { incoming: name }]
  }
  if (seed) {
    const loaded = seed
    const one = told('seed', loaded)
    const described = ended(one, () => {
      description.seed = seedOf(one, loaded)
      heldWords(one, description.seed)
    })
    if (!described) {
      delete description.seed
      seed = undefined
    }
  }
  // The device states of an app share one cookie, so what they could hold is counted over the whole app.
  const room = deviceRoom(description.project.state, description.screens)
  if (room.passed && projects[0])
    report(
      told(projects[0].name, projects[0].loaded),
      'T1014',
      `the states that are kept \`in: 'device'\` could hold ${room.bytes} bytes together, and their one cookie holds 3500.`,
      "Keep the larger ones `in: 'browser'`.",
    )
  const toldTenant = (name: string): Told => told(name, all.get(name)?.loaded ?? seed ?? { value: {} })
  heldToTenants(
    description,
    (name, message, fix) => report(toldTenant(name), 'T2013', message, fix),
    (part, name, work) => {
      if (ended(toldTenant(name), work)) return
      if (part === 'seed') delete description.seed
      else takeOut(name, all.get(name)?.kind ?? '')
    },
  )
  netted(
    description,
    (name) => {
      const loaded = name === 'seed' ? seed : kept.has(name) ? undefined : all.get(name)?.loaded
      return loaded && told(name, loaded)
    },
    ended,
  )
  description.places = placesOf(all)
  // What was made of a screen or a component is kept where nothing after its describing took from its record.
  for (const one of fresh) {
    const later = findings.slice(one.at).some((made) => made.message.startsWith(`${one.name}: `))
    if (later || keptAt(description[one.part], one.name) !== one.described.record) continue
    describedOf.set(one.value, [one.described, ...(describedOf.get(one.value) ?? [])].slice(0, 2))
  }
  return { description, findings }
}

/** The starter data as it is stored: a list of writes, the body that the build read, or nothing yet for code. */
function seedOf(told: Told, loaded: Loaded): Stored {
  const data: unknown = Reflect.get(loaded.value, 'seed')
  const body = loaded.bodies?.run
  if (Array.isArray(data)) {
    const writes = data.filter((one) => isStored(one) && isMarked(one)).map((one) => ({ ...one }))
    if (writes.length !== data.length)
      report(told, 'T1014', 'the starter data holds what is no write.', 'Write orders.add(...) and its like.')
    heldValue(told, 'the starter data', writes, ['input', 'caller'])
    writesHeld(told, 'the starter data', writes)
    return { writes }
  }
  return Array.isArray(body) ? { body: storedBody(told, body) } : {}
}
