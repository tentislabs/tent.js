import type { Told } from './shared.ts'
import { handedName, report } from './shared.ts'

/**
 * The one place where an option that names a definition is stored as the name. Takes the option as its author
 * wrote it, what was handed, and the place of it where it stands inside the option. Answers the name, or nothing
 * for what is neither a name nor a definition, which is T1014 by its place: the option is then left out.
 */
export function nameAt(told: Told, option: string, handed: unknown, place = option): string | undefined {
  const name = handedName(handed)
  if (name) return name
  report(
    told,
    'T1014',
    `\`${place}\` is neither a name nor a definition, ${place === option ? 'and' : `and \`${option}\``} is left out.`,
    'Write the name of the definition as text, or hand the definition itself.',
  )
  return undefined
}

/**
 * The name of an option that may be left out. Nothing where nothing was written, which is no finding: what is left
 * out is asked first, and is never turned into a name.
 */
export const nameIf = (told: Told, option: string, handed: unknown): string | undefined =>
  handed === undefined ? undefined : nameAt(told, option, handed)

/** The names of an option that is a list of definitions. Nothing where it is no list, or where an entry of it is no name. */
export function namesAt(told: Told, option: string, handed: unknown): string[] | undefined {
  if (!Array.isArray(handed)) return undefined
  const names: string[] = []
  // A list need not hold an entry at each place, and a place that holds none is no name.
  for (let at = 0; at < handed.length; at++) {
    const name = nameAt(told, option, handed[at], `${option}.${at}`)
    if (name !== undefined) names.push(name)
  }
  return names.length === handed.length ? names : undefined
}
