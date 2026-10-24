import type { Description } from './description.ts'
import { definitionDoc } from './source/definition.ts'
import { layOut } from './source/doc.ts'
import { writingOf } from './source/writing.ts'

/**
 * Takes a description and the name of a definition in it. Answers the text of that definition, written from its
 * stored record: `export const name = <word>('name', { ... })`, its options one to a line in their fixed order, a
 * type as its call, a reference as its helper, a plan as a chain from its table, a rule as its word, a length of
 * time and a size in words, and a body as the arrow it was read from. A value that the file
 * names is written back as its name. Reading the text gives the same record. Throws T0001 for a name that the
 * description does not hold, and T0013 for a definition that is code: code has no text of this kind.
 */
export function definitionSource(description: Description, name: string): string {
  return layOut(definitionDoc(writingOf(description.app.name), description, name))
}
