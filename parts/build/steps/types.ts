import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { Loaded } from '../../core/internal.ts'
import { uiTypeList } from '../uiTypes.ts'
import type { SourceFile, Step } from '../work.ts'
import { fromJsonSchema, isStored } from '../../core/internal.ts'

/** A stored type as the type checker reads a value of it in backend code. */
function typeOf(type: unknown): string {
  if (!isStored(type)) return 'unknown'
  const values = Array.isArray(type.values) ? type.values : []
  const shape = isStored(type.shape) ? type.shape : {}
  switch (type.kind) {
    case 'text':
    case 'day':
    case 'file':
    case 'link':
      return 'string'
    case 'number':
    case 'boolean':
      return type.kind
    case 'date':
      return 'Date'
    case 'choice':
      return values.map((one) => JSON.stringify(one)).join(' | ') || 'never'
    case 'list':
      return `(${typeOf(type.of)})[]`
    case 'vector':
      return 'number[]'
    case 'object':
      return `{ ${Object.entries(shape)
        .map(
          ([name, one]) =>
            `${JSON.stringify(name)}${isStored(one) && one.optional === true ? '?' : ''}: ${typeOf(one)}`,
        )
        .join('; ')} }`
    default:
      return 'unknown'
  }
}

/** The lists of a project, each with the kinds of definition that stand in it. */
const lists: [string, string[]][] = [
  ['Tables', ['table']],
  ['Functions', ['query', 'change', 'action']],
  ['Flows', ['flow', 'agent']],
  // The entry of a service holds the calls that were read from its `from` file.
  ['Services', []],
  ['Models', ['model']],
]

/** The type of the input of a call that the build read: its fields, or the schema of an approved tool. */
function inputOf(record: unknown): string {
  if (isStored(record) && isStored(record.input)) return typeOf({ kind: 'object', shape: record.input })
  // An approved tool of an outside MCP server holds the JSON Schema of its input, as `tent mcp approve` read it.
  if (isStored(record) && isStored(record.schema)) return typeOf(fromJsonSchema(record.schema))
  return typeOf({ kind: 'object', shape: {} })
}

/**
 * The calls of each service that the build read, typed by their input and their output: those of its `from` file,
 * and the approved tools of an outside MCP server. Each is a call of its record that its definition does not write.
 */
function readCalls(loaded: Loaded[], services: Record<string, Record<string, unknown>>): string[] {
  const lines: string[] = []
  const defined = loaded
    .filter((one) => Reflect.get(one.value, 'kind') === 'service')
    .map((one) => [String(Reflect.get(one.value, 'definition')), Object(Reflect.get(one.value, 'options'))] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  for (const [service, options] of defined) {
    const stored = services[service]
    if (!stored || (options.from === undefined && !stored.mcp)) continue
    const calls = isStored(stored.calls) ? stored.calls : {}
    const written = new Set(isStored(options.calls) ? Object.keys(options.calls) : [])
    const typed = Object.entries(calls)
      .filter(([call]) => !written.has(call))
      .map(([call, record]) => {
        const output = isStored(record) && record.output !== undefined ? typeOf(record.output) : 'unknown'
        // A tool of an outside server may be named with a character that no name of code holds.
        const named = /^[A-Za-z_$][\w$]*$/.test(call) ? call : JSON.stringify(call)
        return `${named}(input: ${inputOf(record)}): Promise<${output}>`
      })
    if (typed.length) lines.push(`    ${service}: { ${typed.join('; ')} }`)
  }
  return lines
}

/**
 * Takes the definitions of a project as they were loaded, and the settings and the services of its description.
 * Answers the text of the type list: one line for each definition, inside the lists that the framework declares
 * empty.
 */
function typeList(
  loaded: Loaded[],
  settings: unknown,
  services: Record<string, Record<string, unknown>>,
  files: SourceFile[],
): string {
  const lines = (kinds: string[]): string[] =>
    loaded
      .filter((one) => kinds.includes(String(Reflect.get(one.value, 'kind'))) && one.file !== undefined)
      .map((one) => ({ name: String(Reflect.get(one.value, 'definition')), file: one.file ?? '', as: one.exportName }))
      .filter((one) => one.as !== undefined)
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .map((one) => `    ${one.name}: typeof import('./${one.file.replace(/\.tsx?$/, '')}').${one.as}`)
  const typed = Object.entries(isStored(settings) ? settings : {})
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, setting]) => `    ${name}: ${typeOf(isStored(setting) ? setting.type : undefined)}`)
  // Each event that a backend file declares, by the name it states, typed by the data of its declaration.
  const events = files
    .filter((one) => one.sort === 'backend')
    .flatMap((one) => (one.seen?.events ?? []).map((declared) => ({ declared, file: one.path })))
    .filter(({ declared }) => declared.name !== undefined)
    .sort((a, b) => ((a.declared.name ?? '') < (b.declared.name ?? '') ? -1 : 1))
    .map(
      ({ declared, file }) =>
        `    ${JSON.stringify(declared.name)}: DataOf<typeof import('./${file.replace(/\.tsx?$/, '')}').${declared.exportName}>`,
    )
  const written = [
    ...lists.map(([list, kinds]) => [list, list === 'Services' ? readCalls(loaded, services) : lines(kinds)] as const),
    ['Settings', typed] as const,
    // A project that declares no event has no list of them.
    ...(events.length ? [['Events', events] as const] : []),
  ]
  const blocks = written.map(([list, inside]) =>
    inside.length ? `  interface ${list} {\n${inside.join('\n')}\n  }` : `  interface ${list} {}`,
  )
  // The type list names `DataOf` of tentjs where a file declares an event, and else imports nothing of it.
  const imported = events.length ? '{ DataOf }' : '{}'
  return `import type ${imported} from 'tentjs'\ndeclare module 'tentjs' {\n${blocks.join('\n')}\n}\n`
}

/** Writes the type list of the project again, where it is not the one that lies there. */
export const step: Step = {
  order: 5,
  run: async (work) => {
    if (!work.description) return
    const screens = [...work.files.values()].some((file) => file.sort === 'screen')
    const listed = typeList(work.loaded, work.description.project.settings, work.description.services, [
      ...work.files.values(),
    ])
    const text = `${listed}${screens ? uiTypeList(work.description) : ''}`
    const lies = join(work.folder, 'tent.d.ts')
    // The file is written only when it changes, so that a save that changes no name wakes no type checker.
    if (existsSync(lies) && readFileSync(lies, 'utf8').replace(/\r\n/g, '\n') === text) return
    try {
      writeFileSync(lies, text)
    } catch {
      // In a project that cannot be written, the type list lies beside the bundle.
      if (work.options.out !== undefined) writeFileSync(join(dirname(resolve(work.options.out)), 'tent.d.ts'), text)
    }
  },
}
