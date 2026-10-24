import type { Description } from '../../core/internal.ts'
import { screenAt } from './find.ts'

/**
 * Takes the path of an address and the languages of the project. Answers the language of the address, the code
 * that leads its path, and the path without it: the default language has no code, and every other its code first.
 */
export function spokenAt(path: string, languages: string[]): { language: string; lead: string; rest: string } {
  const first = path.slice(1).split('/')[0]
  const coded = first !== '' && languages.slice(1).includes(first)
  if (!coded) return { language: languages[0] ?? 'en', lead: '', rest: path }
  return { language: first, lead: `/${first}`, rest: path.slice(first.length + 1) || '/' }
}

/**
 * Takes the description and the path of an address without the code of its language. Answers the path that its
 * screen is found at: with no slash at its end where the project keeps one, as every address of a screen then has.
 */
export function unslashed(description: Description, rest: string): string {
  const keeps = description.project.trailingSlash === 'keep'
  return keeps && rest !== '/' && rest.endsWith('/') ? rest.slice(0, -1) : rest
}

/**
 * Takes the description and the path of an address. Answers the name of the screen that the address names: the
 * code of a language that leads it is left out, and a slash at its end where the project keeps one. Answers nothing
 * where it names no screen.
 */
export function screenNamedAt(description: Description, path: string): string | undefined {
  const languages = Array.isArray(description.project.languages) ? description.project.languages.map(String) : []
  return screenAt(description, unslashed(description, spokenAt(path, languages).rest))?.name
}
