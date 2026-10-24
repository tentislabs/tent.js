import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TentError, text } from '../../core/index.ts'
import { definitionsOf } from '../policy.ts'
import { pathIn } from '../paths.ts'
import { describedNow, writeHeld } from '../written.ts'
import type { ProjectTool } from './face.ts'
import { placeOf } from './placed.ts'
import { asPattern, closingOf } from './renamed.ts'
import { notShown } from './shown.ts'

/** Adds a name to the `removed` list of the text of a definition, or states the list before its last bracket. */
function withRemoved(definition: string, name: string): string {
  const listed = /removed: \[/.exec(definition)
  if (listed)
    return `${definition.slice(0, listed.index + listed[0].length)}'${name}', ${definition.slice(listed.index + listed[0].length)}`
  const end = definition.lastIndexOf('})')
  return `${definition.slice(0, end).replace(/\s*$/, '')}\n  removed: ['${name}'],\n${definition.slice(end)}`
}

/** A text with one stretch taken out, with the empty lines it leaves joined into one. */
const without = (text: string, from: number, to: number): string =>
  `${text.slice(0, from).replace(/\n*$/, '\n')}${text.slice(to + 1).replace(/^\n+/, '\n')}`.replace(/\n{3,}/g, '\n\n')

/**
 * `remove`: removes a definition, a column (`orders.note`) or a file, and states it where the framework asks:
 * `removed` on the table for a column, and on `project` for a table, which is the tool's own writing.
 */
export const removeTool: ProjectTool = {
  name: 'remove',
  about:
    'Removes a definition, a column, as orders.note, or a file of the project, and states the removal where the framework asks for it, so that the data that goes with it is not taken by mistake.',
  input: { name: text({ min: 1, optional: true }), path: text({ min: 1, optional: true }) },
  writes: true,
  async run(at, input) {
    const project = at.one.folders.project
    if (typeof input.path === 'string') {
      const place = pathIn(project, input.path, { writes: true, engine: at.policy.also.includes('engine') })
      if (!existsSync(place)) throw notShown(input.path)
      const { point } = await writeHeld(at, [{ path: input.path }], { tool: 'remove' })
      return { removed: input.path, point: point.id }
    }
    if (typeof input.name !== 'string')
      throw new TentError('T0002', '`remove` takes a `name` or a `path`.', { fields: { name: 'required' } })
    const name = input.name
    const { description } = await describedNow(at)
    const all = definitionsOf(description)
    const writes = new Map<string, string>()
    const textOf = (path: string): string => writes.get(path) ?? readFileSync(join(project, path), 'utf8')
    const [owner = '', column] = name.split('.')
    const defined = all.get(name)
    const table = all.get(owner)
    if (defined?.file && column === undefined) {
      const whole = textOf(defined.file)
      const place = placeOf(description, name, whole)
      if (!place) throw notShown(name)
      writes.set(defined.file, without(whole, place.from, place.to))
      // A table that goes is stated as removed on `project`, so that its rows are dropped only on purpose.
      const app = String(Reflect.get(Object(Reflect.get(Object(description), 'app')), 'name') ?? '')
      const projectAt = all.get(app)
      if (defined.kind === 'table' && projectAt?.file) {
        const text = textOf(projectAt.file)
        const at0 = placeOf(description, app, text)
        if (at0)
          writes.set(
            projectAt.file,
            `${text.slice(0, at0.from)}${withRemoved(text.slice(at0.from, at0.to + 1), name)}${text.slice(at0.to + 1)}`,
          )
      }
    } else if (table?.kind === 'table' && table.file && column) {
      const whole = textOf(table.file)
      const place = placeOf(description, owner, whole)
      if (!place) throw notShown(name)
      const definition = whole.slice(place.from, place.to + 1)
      const key = new RegExp(`([{,]\\s*)${asPattern(column)}\\s*:\\s*[A-Za-z]+\\(`).exec(definition)
      if (!key) throw notShown(name)
      const start = key.index + (key[1]?.length ?? 0)
      const typeEnd = closingOf(definition, key.index + key[0].length - 1)
      const after = definition.slice(typeEnd + 1).replace(/^\s*,\s?/, '')
      const changed = withRemoved(`${definition.slice(0, start)}${after}`, column)
      writes.set(table.file, `${whole.slice(0, place.from)}${changed}${whole.slice(place.to + 1)}`)
    } else throw notShown(name)
    const { point } = await writeHeld(
      at,
      [...writes].map(([path, text]) => ({ path, text })),
      { tool: 'remove', free: ['project'] },
    )
    return { removed: name, point: point.id }
  },
}
