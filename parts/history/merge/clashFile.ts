import { definitionSource } from '../../core/internal.ts'
import type { Described } from '../compare/definitions.ts'
import type { Clash } from '../point.ts'
import type { Clashed } from './files.ts'
import type { LinesApart } from './lines.ts'

const head =
  '// tent.clash.ts - written by `tent history merge`. Put the definition you want into its own file, then remove this file.'

/** A value as a line of the clash file shows it: as JSON, and nothing as `nothing`. */
const shown = (value: unknown): string => (value === undefined ? 'nothing' : (JSON.stringify(value) ?? 'nothing'))

/** Lines inside a comment, which never end it. */
const inComment = (lines: string[]): string[] => lines.map((line) => `  ${line.replace(/\*\//g, '* /')}`)

/** The text of a definition of one side, under another name: `export const name__side = <word>('name', ...)`. */
function sideText(described: Described | undefined, name: string, side: 'ours' | 'theirs'): string[] {
  try {
    if (!described) throw new Error('no description')
    const text = definitionSource(Object(described), name)
    return [text.replace(`export const ${name} =`, `export const ${name}__${side} =`)]
  } catch {
    return [`// ${side}: the definition is code, and stands as its file holds it`]
  }
}

/** The lines of ours and theirs of each place where both changed the same lines, in a comment. */
const linesText = (places: LinesApart[]): string[] =>
  places.flatMap((place) => ['/* ours', ...inComment(place.ours), 'theirs', ...inComment(place.theirs), '*/'])

const span = (places: LinesApart[]): string => {
  const first = places[0]?.line ?? 1
  const last = places.reduce((most, one) => Math.max(most, one.line + Math.max(one.count, 1) - 1), first)
  return `lines ${first} to ${last}`
}

/**
 * Takes what a merge left as ours, and the descriptions of the two sides. Answers the text of `tent.clash.ts`:
 * for each thing a numbered line that says where it is and what clashed, then what the person needs to choose:
 * the two definitions under names of their own, or the lines of each side in a comment.
 */
export function clashText(clashes: Clashed[], described: { ours?: Described; theirs?: Described }): string {
  const lines = [head]
  for (const [k, one] of clashes.entries()) {
    const n = k + 1
    const where = `${one.what} ${one.name} (${one.file})`
    const apart = one.apart
    if (apart.kind === 'fields') {
      const fields = apart.fields.map(
        (field) =>
          `${(field.name ? [field.name, ...field.path.slice(1)] : field.path).join('.')} - ours ${shown(field.ours)}, theirs ${shown(field.theirs)}, before ${shown(field.base)}`,
      )
      lines.push(`// ${n}. ${where}: ${fields.join('; ')}`)
      lines.push(...sideText(described.ours, one.name, 'ours'), ...sideText(described.theirs, one.name, 'theirs'))
    } else if (apart.kind === 'code') {
      lines.push(`// ${n}. ${where}: code, ${span(apart.lines)}`, ...linesText(apart.lines))
    } else if (apart.kind === 'lines') {
      lines.push(`// ${n}. file ${one.name}: both changed ${span(apart.lines)}`, ...linesText(apart.lines))
    } else if (apart.kind === 'bytes') {
      lines.push(`// ${n}. file ${one.name}: both changed it. Theirs is kept beside it as ${one.name}.theirs`)
    } else if (apart.kind === 'file') {
      const said = apart.changed === 'theirs' ? 'removed here, and changed there' : 'changed here, and removed there'
      lines.push(
        `// ${n}. file ${one.name}: ${said}${apart.changed === 'theirs' ? `. Theirs is kept beside it as ${one.name}.theirs` : ''}`,
      )
    } else if (apart.kind === 'removed') {
      const said = apart.changed === 'theirs' ? 'removed here, and changed there' : 'changed here, and removed there'
      lines.push(`// ${n}. ${where}: ${said}`)
      if (apart.changed === 'theirs') lines.push(...sideText(described.theirs, one.name, 'theirs'))
    } else {
      lines.push(`// ${n}. ${where}: both changed it, and ${apart.why}`)
      lines.push(...sideText(described.theirs, one.name, 'theirs'))
    }
  }
  return `${lines.join('\n')}\n`
}

/** What a merge left as ours as the data of its point: one clash for each field, step, place of lines or file. */
export function clashData(clashes: Clashed[]): Clash[] {
  return clashes.flatMap((one): Clash[] => {
    const apart = one.apart
    if (apart.kind === 'fields')
      return apart.fields.map((field) => ({
        what: field.what ?? one.what,
        name: field.name ?? one.name,
        path: field.path,
        ours: field.ours,
        theirs: field.theirs,
        base: field.base,
      }))
    if (apart.kind === 'code' || apart.kind === 'lines')
      return apart.lines.map((place) => ({
        what: one.what,
        name: one.name,
        ours: place.ours,
        theirs: place.theirs,
        base: place.base,
      }))
    if (apart.kind === 'unwritable')
      return [{ what: one.what, name: one.name, ours: apart.why, theirs: null, base: null }]
    const changed = 'changed' in apart ? apart.changed : undefined
    return [
      {
        what: one.what,
        name: one.name,
        ours: changed === 'theirs' ? null : 'changed',
        theirs: changed === 'ours' ? null : 'changed',
        base: null,
      },
    ]
  })
}
