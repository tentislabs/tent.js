import { isStored, type Stored } from './record.ts'
import type { Description } from './description.ts'

const byName = ([a]: [string, unknown], [b]: [string, unknown]): number => (a < b ? -1 : a > b ? 1 : 0)

/** A stored type in a few words: its kind, with what a reader of an outline needs of it. */
function typeOf(type: unknown): string {
  if (!isStored(type)) return 'unknown'
  const values = Array.isArray(type.values) ? type.values.join(' | ') : ''
  const kind =
    type.kind === 'choice'
      ? values
      : type.kind === 'link'
        ? `link to ${String(type.table)}`
        : type.kind === 'list'
          ? `list of ${typeOf(type.of)}`
          : String(type.kind)
  const standsFor = isStored(type.default) ? Object.keys(type.default)[0] : JSON.stringify(type.default)
  return `${kind}${type.optional === true ? '?' : ''}${type.default === undefined ? '' : ` = ${standsFor}`}`
}

const typesOf = (types: unknown): string =>
  Object.entries(isStored(types) ? types : {})
    .map(([name, type]) => `${name} ${typeOf(type)}`)
    .join(', ')

/** A stored rule in a word. */
function ruleOf(rule: unknown): string {
  if (!isStored(rule)) return 'nobody'
  if (rule.rule === 'role') return `role ${String(rule.role)}`
  return rule.rule === 'where' || rule.rule === 'allow' ? `${rule.rule}(...)` : String(rule.rule)
}

/** What starts a flow, in a few words. */
function triggerOf(trigger: unknown): string {
  if (!isStored(trigger)) return ''
  if (typeof trigger.table === 'string') return `${trigger.table} ${String(trigger.when)}`
  const [kind] = Object.keys(trigger)
  return `${kind} ${String(trigger[kind])}`
}

/** The files that a page loads of a project, each with its bytes in the page: the style files, and each module of a view with its style files. */
function pageOf(description: Description, sizes: Record<string, number>): string[] {
  const browser: unknown = description.browser
  if (!isStored(browser)) return []
  const sized = (files: unknown): string =>
    (Array.isArray(files) ? files.map(String) : []).map((file) => `${file} ${sizes[file] ?? 0} bytes`).join(', ')
  // The views of the project: the error screen of the page code is the framework's own.
  const views = (kind: string, of: unknown): string[] =>
    Object.entries(isStored(of) ? of : {})
      .filter(([name]) => Object.hasOwn(description.screens, name) || Object.hasOwn(description.components, name))
      .sort(byName)
      .map(([name, files]) => `  ${kind} ${name}: ${sized(files)}`)
  return [
    ...(Array.isArray(browser.styles) && browser.styles.length ? [`  styles: ${sized(browser.styles)}`] : []),
    ...views('screen', browser.screens),
    ...views('component', browser.components),
  ]
}

/**
 * Takes a description, of each view what the build saw it draw of packages and call, and the bytes of each file of
 * its bundle. Answers the whole app as a short text: each table with its columns and its rules, each function with
 * its inputs and its rule, each flow with what starts it and its steps, each package with who uses it, its bytes in
 * the page and its ways out, each screen with its address, its rule, the queries of its data, the functions it
 * calls and the components it draws, and what a page loads: each style file and each module of a view, with its
 * bytes. The names of a group stand in their order, so one description gives one text.
 */
export function outline(
  description: Description,
  drawn: Record<string, { packages?: Record<string, string> }> = {},
  sizes: Record<string, number> = {},
): string {
  const lines: string[] = [description.app.name]
  const group = (title: string, entries: [string, Stored][], write: (name: string, record: Stored) => string[]) => {
    if (!entries.length) return
    lines.push(title)
    for (const [name, record] of entries.sort(byName)) lines.push(...write(name, record).map((line) => `  ${line}`))
  }
  group('tables', Object.entries(description.tables), (name, table) => {
    const rules = Object.entries(isStored(table.access) ? table.access : {})
      .map(([what, rule]) => `${what} ${ruleOf(rule)}`)
      .join(', ')
    const shown = typeof table.shows === 'string' ? `shows ${table.shows}` : typesOf(table.columns)
    return [`${name}: ${shown}`, `  ${rules || 'nobody'}`]
  })
  group('functions', Object.entries(description.functions), (name, made) => [
    `${String(made.kind)} ${name}(${typesOf(made.input)}): ${ruleOf(made.access)}, ${String(made.form)}`,
  ])
  group('flows', Object.entries(description.flows), (name, flow) => {
    const on = (Array.isArray(flow.on) ? flow.on : []).map(triggerOf).join(', ')
    const steps = (Array.isArray(flow.stepNames) ? flow.stepNames : [])
      .map((step: unknown) =>
        isStored(step)
          ? step.inCode === true
            ? 'in code'
            : `${step.repeated === true ? 'repeated ' : ''}${String(step.name)}`
          : '',
      )
      .join(', ')
    const kind = isStored(flow.agent) ? 'agent' : 'flow'
    return [`${kind} ${name}(${typesOf(flow.input)})${on ? ` on ${on}` : ''}`, ...(steps ? [`  steps: ${steps}`] : [])]
  })
  group('packages', Object.entries(description.packages ?? {}), (name, used) => {
    const by = Array.isArray(used.by) ? used.by.map(String) : []
    const of = (kind: string, label: string): string[] => {
      const named = by.filter((one) => one.startsWith(`${kind}:`)).map((one) => one.slice(kind.length + 1))
      return named.length ? [`${label} ${named.join(', ')}`] : []
    }
    const out = Array.isArray(used.out) ? used.out.map(String) : []
    return [
      `${name}: ${[
        ...of('screen', 'screens'),
        ...of('component', 'components'),
        ...of('backend', 'backend'),
        ...of('file', 'files'),
        ...(used.browser === true ? [`browser ${typeof used.bytes === 'number' ? used.bytes : 0} bytes`] : []),
        ...(out.length ? [`reaches ${out.join(', ')}`] : []),
      ].join('; ')}`,
    ]
  })
  // What the hold names the app may reach, where it holds one.
  const hold = description.project.hold
  if (hold === true) lines.push('hold', '  nothing named')
  else if (typeof hold === 'object' && hold !== null) {
    const ways = ['net', 'programs', 'native'].flatMap((field) => {
      const list: unknown = Reflect.get(hold, field)
      return Array.isArray(list) && list.length ? [`  ${field} ${list.map(String).join(', ')}`] : []
    })
    lines.push('hold', ...(ways.length ? ways : ['  nothing named']))
  }
  group('screens', Object.entries(description.screens), (name, screen) => {
    const data = Object.entries(isStored(screen.data) && screen.data.code !== true ? screen.data : {}).flatMap(
      ([entry, read]) =>
        isStored(read) ? [`${entry} from ${String(read.query ?? read.action ?? read.function ?? '')}`] : [],
    )
    const calls = Array.isArray(screen.calls) ? screen.calls.map(String) : []
    const from = drawn[name]?.packages ?? {}
    const components = [
      ...(Array.isArray(screen.uses) ? screen.uses.map(String) : []),
      ...Object.entries(from).map(([tag, one]) => `${tag} of ${one}`),
    ]
    return [
      `${name}: ${typeof screen.path === 'string' ? screen.path : `for ${String(screen.for)}`}, ${ruleOf(screen.access)}`,
      ...(data.length ? [`  data: ${data.join(', ')}`] : []),
      ...(calls.length ? [`  calls: ${calls.join(', ')}`] : []),
      ...(components.length ? [`  components: ${components.join(', ')}`] : []),
    ]
  })
  const page = pageOf(description, sizes)
  if (page.length) lines.push('page', ...page)
  group('services', Object.entries(description.services), (name, service) => [
    `${name}: ${Object.keys(isStored(service.calls) ? service.calls : {}).join(', ')}`,
  ])
  group('models', Object.entries(description.models), (name, model) => [
    `${name}: ${String(model.provider)} ${String(model.name)}`,
  ])
  return `${lines.join('\n')}\n`
}
