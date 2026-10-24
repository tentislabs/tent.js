import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { TentError } from '../core/index.ts'

// The files that the framework writes itself, which no tool writes, by their paths in lowercase.
const ours = ['tent.clash.ts', 'tent.d.ts', 'mcp.lock.json']

/** The error of a path that is no path of the workspace's own project, with the rule it broke. */
const outside = (path: string, rule: string): TentError =>
  new TentError(
    'T9105',
    `The path ${JSON.stringify(path).slice(0, 120)} is no path of this workspace's project: ${rule}.`,
    {
      fields: { rule },
      fix: 'Name a file of the project by its path inside it, with forward slashes, as `screens/orders.tsx`.',
    },
  )

/** The real place of a path, through every link of the folders above it that stand, for one that is not there yet. */
function realOf(place: string): string {
  let at = place
  const below: string[] = []
  while (!existsSync(at)) {
    const up = dirname(at)
    if (up === at) return place
    below.unshift(at.slice(up.length + 1))
    at = up
  }
  return join(realpathSync.native(at), ...below)
}

/**
 * Takes the folder of a workspace's project, a path that a tool was handed, and whether the tool writes. Answers
 * where the file lies, which `pathOf` names as the rules know it. Throws T9105 for a path that is not a plain path
 * inside the project, also after every link is followed and whatever its capitals, for a colon and for a name that
 * ends in a dot or a space, for one inside `.tent/`, and for a file the framework writes itself where
 * the tool writes: `tent.clash.ts`, `tent.d.ts`, `mcp.lock.json`; `engine.ts` is written only where `engine` says so.
 */
export function pathIn(project: string, path: unknown, o: { writes: boolean; engine?: boolean }): string {
  if (typeof path !== 'string' || path === '' || path.includes('\0') || path.includes('\\'))
    throw outside(String(path), 'a path is written with forward slashes')
  if (isAbsolute(path) || /^[A-Za-z]:/.test(path) || path.startsWith('/'))
    throw outside(path, 'a path is written from the folder of the project')
  // A colon names a stream of a file on Windows, and a name that ends in a dot or a space is read there without it:
  // each is another way to write a file, which no rule would know by its name.
  if (path.includes(':')) throw outside(path, 'a path holds no colon')
  if (path.split('/').some((part) => part !== '.' && part !== '..' && /[. ]$/.test(part)))
    throw outside(path, 'a name of a path ends in no dot and no space')
  const root = realpathSync.native(project)
  const place = resolve(root, path)
  const real = realOf(place)
  const from = relative(root, real)
  if (from === '' || from.startsWith('..') || isAbsolute(from)) throw outside(path, 'it leads out of the project')
  const [first = ''] = from.split(sep)
  const lower = from.split(sep).join('/').toLowerCase()
  if (first.toLowerCase() === '.tent') throw outside(path, "the folder of the engine is the framework's own")
  if (o.writes && ours.includes(lower)) throw outside(path, 'the framework writes this file itself')
  if (o.writes && lower === 'engine.ts' && !o.engine)
    throw outside(path, '`engine.ts` is written only where the policy names `engine` in `also`')
  if (existsSync(real) && lstatSync(real).isSymbolicLink()) throw outside(path, 'a link is no file of the project')
  return real
}

/** A path of the project as a tool names it, with forward slashes, of a place inside it. */
export const pathOf = (project: string, place: string): string =>
  relative(realpathSync.native(project), place).split(sep).join('/')
