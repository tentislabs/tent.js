import { fingerprintOf } from '../../core/internal.ts'
import type { Made } from '../borrowed/vite.ts'
import type { Owed } from '../owed.ts'
import { owedOf, withOwed } from '../owed.ts'
import { moduleName } from '../run.ts'
import type { Step } from '../work.ts'
import { found } from '../work.ts'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

/** Whether a stored record, or anything inside it, is stored as code: it holds an export whose module the build fills. */
function holdsCode(record: unknown): boolean {
  if (Array.isArray(record)) return record.some(holdsCode)
  if (typeof record !== 'object' || record === null) return false
  return typeof Reflect.get(record, 'export') === 'string' || Object.values(record).some(holdsCode)
}

/**
 * The module files that the builder made, each under the name it has in the bundle, with what it imports named so
 * too, and with the exports that it owes for the code inside its definitions. `lost` is told each that could not
 * be added.
 */
function named(
  made: Made[],
  needed: Set<string>,
  owed: Map<string, Owed[]>,
  lost: (one: Owed) => void,
): Map<string, { name: string; text: string }> {
  const modules = new Map(made.filter((one) => one.name.endsWith('.js')).map((one) => [one.name, one] as const))
  const done = new Map<string, { name: string; text: string }>()
  const name = (file: string, seen: string[]): string | undefined => {
    const one = modules.get(file)
    if (!one) return undefined
    const held = done.get(file)
    if (held) return held.name
    const added = withOwed(one.text, owed.get(file) ?? [])
    added.lost.forEach(lost)
    let text = added.text
    // A module names what it imports by its file, so those files are named first. Two modules that import each
    // other cannot both come first: the second is then named by its own text alone.
    for (const imported of new Set(one.imports)) {
      const to = seen.includes(imported) ? undefined : name(imported, [...seen, file])
      if (to !== undefined) text = text.replaceAll(`"./${imported}"`, `"./${to.slice('server/'.length)}"`)
    }
    const stem = file.replace(/\.js$/, '')
    // The last line of a module names its map by the name of the module, which holds the fingerprint: so the
    // fingerprint is taken of the code above that line.
    const map = `//# sourceMappingURL=${file}.map`
    const final = `server/${stem}.${fingerprintOf(encode(text.replace(map, ''))).slice(0, 12)}.js`
    text = text.replace(map, `//# sourceMappingURL=${final.slice('server/'.length)}.map`)
    done.set(file, { name: final, text })
    return final
  }
  for (const file of [...needed].sort()) name(file, [])
  return done
}

/** Names the module of each backend file that holds code, and the code they share, by its fingerprint. */
export const step: Step = {
  order: 6,
  run: async (work) => {
    const description = work.description
    if (!description || !work.made.length) return
    const loaded = new Map(work.loaded.map((one) => [Reflect.get(one.value, 'definition'), one] as const))
    const needed = new Set<string>()
    const owed = new Map<string, Owed[]>()
    const owner = new Map<Owed, { definition: string; file: string; line?: number }>()
    // A definition that holds code needs the module of its file, and that module owes an export for each rule and
    // each option of the definition that is code.
    const holds = (definition: string, record: unknown): void => {
      const one = loaded.get(definition)
      if (one?.file === undefined || !holdsCode(record)) return
      const module = `${moduleName(one.file)}.js`
      needed.add(module)
      const more = owedOf(record, one.exportName ?? definition, Reflect.get(one.value, 'options'))
      owed.set(module, [...(owed.get(module) ?? []), ...more])
      for (const each of more) owner.set(each, { definition, file: one.file, line: one.line })
    }
    // An export that the description names and no module gives would fail where the engine loads it: it is told here.
    const lost = (one: Owed): void => {
      const { definition, file, line } = owner.get(one) ?? { definition: one.from, file: '' }
      const why = one.way
        ? `the module of ${file} does not give \`${one.from}\``
        : `\`${definition}\` states no option that it stands for`
      found(
        work,
        'T1014',
        file,
        line,
        `${definition}: the build cannot write the export \`${one.name}\`, since ${why}.`,
        'Write the definition as a top-level `export const` of its file, with the rule or the code in place.',
        definition,
      )
    }
    const groups = [
      description.tables,
      description.functions,
      description.flows,
      description.routes,
      description.commands,
      description.backfills ?? {},
    ]
    for (const group of groups) for (const [definition, record] of Object.entries(group)) holds(definition, record)
    holds(description.app.name, description.project)
    const seed = description.seed
    if (seed && seed.writes === undefined && seed.body === undefined) needed.add('seed.js')
    const sources = new Map(work.made.map((one) => [one.name, one] as const))
    for (const [file, module] of named(work.made, needed, owed, lost)) {
      work.bundle.set(module.name, encode(module.text))
      const map = sources.get(`${file}.map`)
      if (map) {
        // The map names the file it is for, which has its final name now.
        const held: unknown = JSON.parse(map.text)
        const text = JSON.stringify({ ...Object(held), file: module.name.slice('server/'.length) })
        work.bundle.set(`${module.name}.map`, encode(text))
      }
      const source = [...work.files.values()].find((one) => `${moduleName(one.path)}.js` === file && needed.has(file))
      if (source) work.modules[source.path] = module.name
    }
  },
}
