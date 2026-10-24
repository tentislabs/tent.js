import { isMarked } from '../mark.ts'
import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import type { Told } from './shared.ts'
import { plainOf, report } from './shared.ts'

/** The three lines of the head, each with the names it takes. */
const lines: Record<string, string[]> = {
  meta: ['name', 'property', 'content', 'media'],
  link: ['rel', 'href', 'type', 'sizes', 'media', 'hreflang', 'title', 'as', 'crossorigin'],
  script: ['src', 'async', 'defer', 'type', 'load', 'consent'],
}

/** What `rel` of a `link` line may say. */
const rels = ['icon', 'apple-touch-icon', 'manifest', 'alternate', 'preconnect', 'dns-prefetch', 'preload']

const isAsset = (value: unknown): boolean => isMarked(value) && typeof value.asset === 'string'

/** Whether an address lies on one of the hosts that were opened for scripts: by its scheme and host, or by its host. */
function onHost(address: string, hosts: readonly unknown[]): boolean {
  if (!URL.canParse(address)) return false
  const { origin, host } = new URL(address)
  return hosts.some((one) => one === origin || one === host)
}

/** Answers what is wrong with one line of the head, or nothing for a line that is one of the three. */
function wrongWith(line: unknown, scripts: readonly unknown[]): string | undefined {
  const [kind, ...more] = isStored(line) ? Object.keys(line) : []
  const names = isStored(line) ? line[kind] : undefined
  if (kind === undefined || more.length || !Object.hasOwn(lines, kind) || !isStored(names))
    return 'is none of `{ meta }`, `{ link }` and `{ script }`'
  for (const [name, value] of Object.entries(names)) {
    if (!lines[kind].includes(name)) return `is a \`${kind}\` line, which takes no \`${name}\``
    const flag = kind === 'script' && (name === 'async' || name === 'defer')
    const address = name === 'href' || name === 'src'
    if (flag ? typeof value !== 'boolean' : typeof value !== 'string' && !(address && isAsset(value)))
      return `states \`${name}\` as what it does not take`
    if (kind === 'script' && name === 'src' && typeof value === 'string' && !onHost(value, scripts))
      return 'states a `src` on a host that `unlock.scripts` does not list'
    if (name === 'rel' && !rels.includes(String(value))) return `states a \`rel\` that a line of the head may not have`
    if (name === 'load' && !['now', 'alive', 'idle'].includes(String(value)))
      return "states a `load` that is none of `'now'`, `'alive'` and `'idle'`"
    if (name === 'consent' && !/^[A-Za-z_$][\w$]*$/.test(String(value))) return 'states a `consent` that names no state'
  }
  return undefined
}

/**
 * Takes the lines of `head` as they were written, and the hosts that `unlock.scripts` opens. Answers the lines as
 * they are stored. Reports each line that is none of the three, that states a name its kind does not take, or whose
 * script comes from a host that was not opened (T1014).
 */
export function headOf(told: Told, written: unknown, scripts: unknown): unknown {
  if (written === undefined) return undefined
  const list = Array.isArray(written) ? written : [written]
  for (const [at, line] of list.entries()) {
    const wrong = wrongWith(line, Array.isArray(scripts) ? scripts : [])
    if (wrong !== undefined)
      report(
        told,
        'T1014',
        `line ${at + 1} of \`head\` ${wrong}.`,
        'A line is `{ meta }`, `{ link }` or `{ script }` with the names of its kind, and a script comes from an asset or from a host of `unlock.scripts`. Any other line is added by `onRequest`.',
      )
  }
  const stored: Stored[] = list.filter(isStored).map((line) => Object(plainOf(line)))
  return stored
}
