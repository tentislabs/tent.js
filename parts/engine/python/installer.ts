import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isStored, normalName } from '../../core/internal.ts'
import type { AppProgram, ProgramStart } from '../rooms/room.ts'
import { namedEnvironment } from '../namedEnvironment.ts'

/** What the installer of packages is started with for one of its commands: its words, and its environment. */
export interface InstallerStarted {
  args: string[]
  env: Record<string, string>
}

// The name of the empty .netrc of the engine's own, in the cache of the installer.
const netrcName = 'tent-empty.netrc'

/** The name of a secret that a stored value names, or nothing for a value that names none. */
const secretOf = (value: unknown): string | undefined =>
  isStored(value) && typeof value.secret === 'string' ? value.secret : undefined

/**
 * Takes the words of one command of the installer, the Python program it works with, the folder of its cache, the
 * address of the usual package index, what `python` of `project` states, the names of the packages of a lock that is
 * laid where it is one, and how a secret is opened. Answers what the installer is started with: told to fetch no
 * Python, to read no settings of the person's own and to write into its cache alone, with each index of `index`
 * beside the usual one, its name and password in the environment of that index, and every package but those that
 * `build` names held to ready-built files.
 */
export function startedWith(o: {
  words: string[]
  python: string
  cache: string
  usual: string
  project: Record<string, unknown>
  packages?: string[]
  secret(name: string): string
}): InstallerStarted {
  // `--no-config` leaves the person's `.netrc` read: an empty one of the engine's stands in its place.
  const env: Record<string, string> = { ...namedEnvironment(), NETRC: join(o.cache, netrcName) }
  const args = [...o.words, '--python', o.python, '--no-config', '--no-python-downloads', '--cache-dir', o.cache]
  args.push('--color', 'never', '--default-index', o.usual)
  const index: unknown = o.project.index
  for (const [at, entry] of (Array.isArray(index) ? index : []).entries()) {
    const url: unknown = isStored(entry) ? entry.url : entry
    if (typeof url !== 'string') continue
    args.push('--index', `tent${at}=${url}`)
    if (!isStored(entry)) continue
    const [user, password] = [secretOf(entry.user), secretOf(entry.password)]
    if (user !== undefined) env[`UV_INDEX_TENT${at}_USERNAME`] = o.secret(user)
    if (password !== undefined) env[`UV_INDEX_TENT${at}_PASSWORD`] = o.secret(password)
  }
  if (o.packages) {
    const built = Array.isArray(o.project.build) ? o.project.build.filter((one) => typeof one === 'string') : []
    const held = o.packages.filter((one) => !built.some((name) => normalName(name) === normalName(one)))
    if (!built.length) args.push('--only-binary', ':all:')
    else for (const one of held) args.push('--only-binary', one)
  }
  return { args, env }
}

/** The end of a stream that is read to its end: kept once it ended, or broke. */
const endOf = (stream: NodeJS.ReadableStream): Promise<void> =>
  new Promise((done) => {
    stream.once('end', done)
    stream.once('error', () => done())
  })

/**
 * Takes what starts a program, the program of the installer, what it is started with, what its input holds, and
 * how long it may take, in milliseconds. Starts it as a program of its own, and answers the number it ended with
 * and what it printed. A program that passes its time is ended with what it started, and answers 124.
 */
export async function runInstaller(
  start: (o: ProgramStart) => AppProgram,
  installer: string,
  started: InstallerStarted,
  o: { input?: string; time: number },
): Promise<{ code: number; out: string; err: string }> {
  const netrc = started.env.NETRC
  if (netrc !== undefined) {
    mkdirSync(dirname(netrc), { recursive: true })
    writeFileSync(netrc, '')
  }
  let child: AppProgram
  try {
    child = start({ for: 'install', command: installer, args: started.args, folder: process.cwd(), env: started.env })
  } catch (error) {
    return { code: 1, out: '', err: error instanceof Error ? error.message : String(error) }
  }
  const [out, err]: [Buffer[], Buffer[]] = [[], []]
  child.stdout.on('data', (data: Buffer) => out.push(data))
  child.stderr.on('data', (data: Buffer) => err.push(data))
  let late = false
  const timer = setTimeout(() => {
    late = true
    child.end()
  }, o.time)
  // A program that ends before it has read its input closes the pipe: what it said is still answered.
  child.stdin.on('error', () => {})
  child.stdin.end(o.input ?? '')
  try {
    const [code] = await Promise.all([child.ended, endOf(child.stdout), endOf(child.stderr)])
    return {
      code: late ? 124 : (code ?? 1),
      out: Buffer.concat(out).toString('utf8'),
      err: Buffer.concat(err).toString('utf8'),
    }
  } catch (error) {
    return {
      code: late ? 124 : 1,
      out: Buffer.concat(out).toString('utf8'),
      err: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}
