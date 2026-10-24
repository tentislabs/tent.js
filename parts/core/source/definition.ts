import type { Description } from '../description.ts'
import { TentError } from '../errors.ts'
import type { Doc } from './doc.ts'
import { group } from './doc.ts'
import { flowEntries, functionEntries, incomingEntries, tableEntries } from './backend.ts'
import { modelEntries, serviceEntries } from './outside.ts'
import { projectEntries } from './project.ts'
import { isStored } from '../record.ts'
import { quoted } from './texts.ts'
import type { Writing } from './writing.ts'
import { noText, ours } from './writing.ts'

/**
 * A definition as it is found in a description: the word that makes it, noted before what it is handed, and its
 * options as they are written.
 */
function found(w: Writing, d: Description, name: string): { word: string; entries: Doc[] } {
  const at = <Part>(part: Record<string, Part>): Part | undefined =>
    Object.hasOwn(part, name) ? part[name] : undefined
  if (d.app.name === name) return { word: ours(w, 'project'), entries: projectEntries(w, d.project) }
  const table = at(d.tables)
  if (table) return { word: ours(w, 'table'), entries: tableEntries(w, table) }
  const fn = at(d.functions)
  if (fn) return { word: ours(w, String(fn.kind)), entries: functionEntries(w, name, fn) }
  const flow = at(d.flows)
  if (flow) return { word: ours(w, isStored(flow.agent) ? 'agent' : 'flow'), entries: flowEntries(w, name, flow) }
  // The view of a screen and of a component is code, which has no text of this kind.
  if (at(d.screens) || at(d.components)) throw noText(`The view of \`${name}\``)
  const service = at(d.services)
  if (service) return { word: ours(w, 'service'), entries: serviceEntries(w, service) }
  const model = at(d.models)
  if (model) return { word: ours(w, 'model'), entries: modelEntries(w, model) }
  const incoming = at(d.incoming)
  if (incoming) return { word: ours(w, 'incoming'), entries: incomingEntries(w, incoming) }
  if (at(d.routes)) throw noText(`The route \`${name}\``)
  if (at(d.commands)) throw noText(`The command \`${name}\``)
  if (at(d.backfills ?? {})) throw noText(`The backfill \`${name}\``)
  throw new TentError('T0001', `The description holds no definition named \`${name}\`.`, {
    fix: 'Name a definition of the description.',
  })
}

/**
 * Takes what is known while a text is written, a description, and the name of a definition in it. Answers the definition as it is laid
 * out: `export const name = <word>('name', { ... })`, with its options one to a line.
 */
export function definitionDoc(w: Writing, description: Description, name: string): Doc {
  const { word, entries } = found(w, description, name)
  const options = entries.length ? group('{', entries, '}', { broken: true }) : '{}'
  return [`export const ${name} = ${word}(${quoted(name)}, `, options, ')']
}
