import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { treeOfText } from '../../build/index.ts'
import { TentError, text } from '../../core/index.ts'
import { pathOf } from '../paths.ts'
import { projectFiles } from '../projectFiles.ts'
import { definitionsOf } from '../policy.ts'
import type { Writing } from '../written.ts'
import { describedNow, writeHeld } from '../written.ts'
import type { ProjectTool } from './face.ts'
import { placeOf } from './placed.ts'
import { asPattern, closingOf, codeRanges, keyEdits, renamedPlain, wordEdits } from './renamed.ts'

/** Every `.ts` and `.tsx` file of a project, by its place, but the types that the framework writes. */
const sourcesOf = (folder: string): string[] =>
  projectFiles(folder).filter((place) => /\.tsx?$/.test(place) && basename(place) !== 'tent.d.ts')

/** The error of a name that names no definition or column that a rename can reach. */
const noName = (name: string): TentError =>
  new TentError('T0001', `No definition or column ${JSON.stringify(name).slice(0, 80)} is in the project.`, {
    fix: 'Name a definition by its name, and a column as `orders.buyer`.',
  })

/** Adds `was` to the text of a definition: to the list it states, or as a list of its own before its last bracket. */
function withWas(definition: string, was: string): string {
  const listed = /was: \[/.exec(definition)
  if (listed)
    return `${definition.slice(0, listed.index + listed[0].length)}'${was}', ${definition.slice(listed.index + listed[0].length)}`
  const one = /was: (['"])([^'"]*)\1/.exec(definition)
  if (one) return definition.replace(one[0], `was: ['${one[2]}', '${was}']`)
  const end = definition.lastIndexOf('})')
  return `${definition.slice(0, end).replace(/\s*$/, '')}\n  was: ['${was}'],\n${definition.slice(end)}`
}

/** Adds `was` to the options of the type of a column, which its text writes as `text({ ... })` or `text()`. */
function columnWas(type: string, was: string): string {
  const open = type.indexOf('(')
  const close = open < 0 ? -1 : closingOf(type, open)
  if (close < 0) return type
  const inside = type.slice(open + 1, close).trim()
  const options = inside === '' ? `{ was: '${was}' }` : inside.replace(/\s*\}$/, `, was: '${was}' }`)
  return `${type.slice(0, open + 1)}${options}${type.slice(close)}`
}

/**
 * `rename`: renames a definition or a column (`orders.buyer`). It changes the name,
 * adds `was`, and changes every plain place that names it; the places in code it lists in its answer and leaves.
 */
export const renameTool: ProjectTool = {
  name: 'rename',
  about:
    'Renames a definition, or a column, as orders.buyer: it adds was, so that no row is lost, and changes every plain place that names it. The places in code that name it, in the body of a function or the view of a screen, it lists and leaves for you to change.',
  input: { name: text({ min: 1 }), to: text({ min: 1, pattern: '^[A-Za-z_][A-Za-z0-9_]*$' }) },
  writes: true,
  async run(at, input) {
    const project = at.one.folders.project
    const { description } = await describedNow(at)
    const all = definitionsOf(description)
    const [name, to] = [String(input.name), String(input.to)]
    const writes = new Map<string, string>()
    const textOf = (path: string): string => writes.get(path) ?? readFileSync(join(project, path), 'utf8')
    // The files of routes and commands are code whole. In every other file the views of screens, the bodies of
    // actions and what the description holds as code are: a place there that names it is listed and left.
    const coded = new Set(
      [...all.values()]
        .filter((one) => one.kind === 'route' || one.kind === 'command')
        .flatMap((one) => (one.file === undefined ? [] : [one.file])),
    )
    const code: { path: string; line: number }[] = []
    const files = sourcesOf(project).map((place) => pathOf(project, place))
    const defined = all.get(name)
    const [owner = '', column = ''] = name.split('.')
    // The form of a definition by its name, which its own file already names anew.
    const formOf = (one: string): unknown => all.get(one === to ? name : one)?.record.form
    const table = all.get(owner)
    let renamed: { from: string; to: string } | undefined
    if (defined?.file) {
      const whole = textOf(defined.file)
      const place = placeOf(description, name, whole)
      if (!place) throw noName(name)
      let definition = whole.slice(place.from, place.to + 1)
      definition = definition
        .replace(new RegExp(`(export const )${asPattern(name)}\\b`), `$1${to}`)
        .replace(new RegExp(`(\\(\\s*)(['"])${asPattern(name)}\\2`), `$1$2${to}$2`)
      writes.set(defined.file, `${whole.slice(0, place.from)}${withWas(definition, name)}${whole.slice(place.to + 1)}`)
      for (const path of files) {
        const before = textOf(path)
        if (!new RegExp(`(?<![\\w$.])${asPattern(name)}(?![\\w$])`).test(before)) continue
        const tree = treeOfText(path, before)
        if (coded.has(path) || !tree) {
          before.split('\n').forEach((line, k) => {
            if (new RegExp(`\\b${asPattern(name)}\\b`).test(line)) code.push({ path, line: k + 1 })
          })
          continue
        }
        const after = renamedPlain(before, codeRanges(tree, formOf), wordEdits(tree, name, to))
        for (const line of after.code) code.push({ path, line })
        if (after.text !== before) writes.set(path, after.text)
      }
      renamed = { from: name, to }
    } else if (table?.kind === 'table' && table.file && column) {
      const whole = textOf(table.file)
      const place = placeOf(description, owner, whole)
      if (!place) throw noName(name)
      const definition = whole.slice(place.from, place.to + 1)
      const key = new RegExp(`(\\n\\s*|\\{\\s*)${asPattern(column)}(\\s*:\\s*)([A-Za-z]+\\()`)
      const found = key.exec(definition)
      if (!found) throw noName(name)
      const typeAt = found.index + found[0].length - 1
      const typeEnd = closingOf(definition, typeAt)
      const type = definition.slice(typeAt - (found[3]?.length ?? 1) + 1, typeEnd + 1)
      const changed = `${definition.slice(0, found.index)}${found[1]}${to}${found[2]}${columnWas(type, column)}${definition.slice(typeEnd + 1)}`
      writes.set(table.file, `${whole.slice(0, place.from)}${changed}${whole.slice(place.to + 1)}`)
      for (const path of files) {
        const before = textOf(path)
        const tree = treeOfText(path, before)
        if (coded.has(path) || !tree) continue
        const after = renamedPlain(before, codeRanges(tree, formOf), keyEdits(tree, owner, column, to))
        for (const line of after.code) code.push({ path, line })
        if (after.text !== before) writes.set(path, after.text)
      }
    } else throw noName(name)
    const changed: Writing[] = [...writes].map(([path, text]) => ({ path, text }))
    const { point } = await writeHeld(at, changed, { tool: 'rename', ...(renamed ? { renamed } : {}) })
    return { renamed: { from: name, to }, files: [...writes.keys()].sort(), code, point: point.id }
  },
}
