import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../core/index.ts'
import type { SqliteFile } from '../data/index.ts'
import { list } from './find.ts'
import { writeInto } from './lay.ts'
import type { Kind, Point } from './point.ts'

// The kinds of point that an export writes where none are named.
const written: Kind[] = ['named', 'published', 'merge']

// The settings of each call: the bytes of a file are held as they are, a commit is signed by nobody, since its
// author is the writer of its point, and no hook is carried out: the folder that is named for them holds none.
// https://git-scm.com/docs/git-config
const settings = [
  ...['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'commit.gpgsign=false'],
  ...['-c', 'core.hooksPath=.git/tent-no-hooks'],
]

/** Carries one call of the `git` program of the computer out in a folder. Throws T0013 where there is none, and T0009 where the call fails. */
function git(folder: string, words: string[], env: Record<string, string> = {}): string {
  const ended = spawnSync('git', [...settings, ...words], {
    cwd: folder,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, ...env },
  })
  if (ended.error)
    throw new TentError('T0013', 'This computer has no `git` program, which an export of the history writes with.', {
      fix: 'Install git, or copy the files of a point with `tent history back`.',
    })
  if (ended.status !== 0) throw new TentError('T0009', `git ${words[0]} failed: ${ended.stderr.trim()}`)
  return ended.stdout
}

/** The writer of a point as the author of a commit: its kind and its id. */
const authorOf = (point: Point): string =>
  point.by.id === undefined ? point.by.kind : `${point.by.kind} ${point.by.id}`

/**
 * Takes a folder, and the kinds of point to write, which are the named, the published and the merge points where
 * none are given. Writes each such point along `now` as a commit there, oldest first, with the `git` program of
 * the computer: the files of the point, its name or its kind as the message, its writer as the author and its
 * moment as the date. The folder is empty, or holds what an earlier export wrote, to which the points that came
 * after its newest one are added. Git is written to and never read from: what was written is kept in a list of
 * the export's own inside the folder. Answers the number of commits. Throws T0013 where the computer has no `git`,
 * and where the folder holds what no export wrote.
 */
export function exportGit(file: SqliteFile, folder: string, o: { kinds?: Kind[] } = {}): { commits: number } {
  const kinds = o.kinds ?? written
  mkdirSync(folder, { recursive: true })
  const kept = join(folder, '.git', 'tent-points')
  if (!existsSync(kept)) {
    if (readdirSync(folder).length)
      throw new TentError('T0013', `The folder ${folder} holds files that no export of the history wrote.`, {
        fix: 'Name an empty folder, or the folder of an earlier export.',
      })
    git(folder, ['init', '--quiet'])
    appendFileSync(kept, '')
  }
  const before = readFileSync(kept, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split(' '))
  const done = new Set(before.map(([id]) => id))
  const newest = Math.max(-1, ...before.map(([, at]) => Number(at)))
  const points = list(file)
    .filter((point) => kinds.includes(point.kind) && point.files && !done.has(point.id) && point.at > newest)
    .reverse()
  for (const point of points) {
    for (const name of readdirSync(folder)) if (name !== '.git') rmSync(join(folder, name), { recursive: true })
    writeInto(file, point, folder)
    const author = authorOf(point)
    const date = `@${Math.floor(point.at / 1000)} +0000`
    const message = [point.name ?? point.kind, '', `Point ${point.id}`, ...(point.note ? ['', point.note] : [])]
    git(folder, ['add', '--all'])
    git(folder, ['commit', '--quiet', '--allow-empty', '--no-verify', '-m', message.join('\n')], {
      GIT_AUTHOR_NAME: author,
      GIT_AUTHOR_EMAIL: '',
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: author,
      GIT_COMMITTER_EMAIL: '',
      GIT_COMMITTER_DATE: date,
    })
    appendFileSync(kept, `${point.id} ${point.at}\n`)
  }
  return { commits: points.length }
}
