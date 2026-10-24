import { isMark } from './entries.ts'

/** What one line of a lock does not hold to its form, by its number from 1, and why. */
interface LockLineFound {
  line: number
  why: string
}

/** A lock as it was read: the Python it was made for, the entries it was made from, its packages, and what does not fit. */
export interface LockRead {
  version?: string
  entries?: string[]
  packages: string[]
  found: LockLineFound[]
}

const versionLine = /^# python (\d+\.\d+)$/
const entriesLine = /^# packages (\[.*\])$/
// A package with its exact version, the mark of a system where it has one, and a `\` where a fingerprint follows.
const packageLine =
  /^([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)(?:\[[A-Za-z0-9._, -]+\])?==[A-Za-z0-9.+!_-]+(?:[ \t]*;([^\\]*?))?([ \t]*\\)?$/
const hashLine = /^\s+--hash=sha256:[0-9a-f]{64}(\s*\\)?$/

/** Why a line is no line of a lock: an option, an address, a file, or another form. */
function whyNot(line: string): string {
  const text = line.trim()
  if (text.startsWith('-')) return 'it is an option'
  if (/:\/\/|\s@\s|^[a-z]+\+/.test(text)) return 'it is an address'
  if (/^(\.{1,2}[\\/]|[\\/]|[A-Za-z]:[\\/])|\.(whl|zip|tar\.gz|tgz)$/i.test(text)) return 'it is a file'
  return 'it has another form than a line of the lock'
}

/**
 * Takes the text of a lock. Answers what it holds: the Python of its first line, the entries of its second, the
 * names of its packages, and each line that has another form than its own: a package with its exact version and the
 * mark of a system, or a line that continues a package with a fingerprint.
 */
export function readLock(text: string): LockRead {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const read: LockRead = { packages: [], found: [] }
  const version = lines[0]?.match(versionLine)?.[1]
  if (version) read.version = version
  else read.found.push({ line: 1, why: 'it is not `# python <version>`' })
  const entries = lines[1]?.match(entriesLine)?.[1]
  try {
    const list: unknown = entries ? JSON.parse(entries) : undefined
    if (Array.isArray(list) && list.every((one) => typeof one === 'string')) read.entries = list
  } catch {
    // A second line that does not read is told below.
  }
  if (!read.entries) read.found.push({ line: 2, why: 'it is not `# packages` and a list of entries' })
  let continues = false
  for (const [at, line] of lines.entries()) {
    if (at < 2 || line.trim() === '') {
      continues = false
      continue
    }
    const matched: RegExpMatchArray | null | undefined = continues ? undefined : line.match(packageLine)
    // The mark after the semicolon is held whole: an option or an address behind it makes no line of a lock.
    const named: RegExpMatchArray | undefined =
      matched && (matched[2] === undefined || isMark(matched[2])) ? matched : undefined
    const hashed: RegExpMatchArray | null | undefined = continues ? line.match(hashLine) : undefined
    if (named?.[1]) read.packages.push(named[1])
    else if (!hashed) read.found.push({ line: at + 1, why: whyNot(line) })
    continues = (named?.[3] ?? hashed?.[1]) !== undefined
  }
  return read
}
