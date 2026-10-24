// The forms of the standard for an entry: a name, a part in square brackets, versions or ranges, and the mark of a
// system after a semicolon. No option, no address and no file fits them: `@`, `:` and `/` stand nowhere, and an
// entry with two hyphens in a row, the start of an option, is none.
const name = '[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?'
const part = `\\[[ \\t]*${name}(?:[ \\t]*,[ \\t]*${name})*[ \\t]*\\]`
const one = '(?:~=|===|==|!=|<=|>=|<|>)[ \\t]*[A-Za-z0-9*+!_][A-Za-z0-9.*+!_]*'
const versions = `${one}(?:[ \\t]*,[ \\t]*${one})*`
const entryForm = new RegExp(
  `^[ \\t]*${name}[ \\t]*(?:${part})?[ \\t]*(?:\\([ \\t]*${versions}[ \\t]*\\)|${versions})?[ \\t]*(?:;(.*))?$`,
)

/**
 * Whether a text is the mark of a system, as it stands after a semicolon: names, comparisons, parentheses, `and`,
 * `or` and quoted values, on one line. An option, an address and a path are none: outside the quotes no hyphen,
 * slash, colon or `@` stands.
 */
export function isMark(text: string): boolean {
  if (/[\r\n]/.test(text)) return false
  const bare = text.replace(/"[^"\r\n]*"|'[^'\r\n]*'/g, '""')
  return bare.trim() !== '' && /^[A-Za-z0-9_.<>=!~(), \t"']+$/.test(bare)
}

/** Whether an entry of `packages` is a name, with a version or a range, a part and the mark of a system where it has them. */
export function isPackageEntry(entry: unknown): boolean {
  if (typeof entry !== 'string' || /[\r\n]/.test(entry) || entry.includes('--')) return false
  const matched = entry.match(entryForm)
  return matched !== null && (matched[1] === undefined || isMark(matched[1]))
}

/** Whether an entry of `python.build` is one name of a package. */
export const isPackageName = (entry: unknown): boolean =>
  typeof entry === 'string' && new RegExp(`^${name}$`).test(entry)
