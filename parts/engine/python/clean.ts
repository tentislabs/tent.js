import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { runnerFolder } from '../fetchPart.ts'
import { msOf } from '../words.ts'
import { wholeMark } from './environment.ts'

// An environment that nothing used for this long is removed, where `--older` names no time of its own.
const thirtyDays = 30 * 86_400_000

/** The moment an environment was last used, or a folder that was being made was last written. */
function usedAt(folder: string): number {
  const mark = join(folder, wholeMark)
  return statSync(existsSync(mark) ? mark : folder).mtimeMs
}

/**
 * Takes how long an environment may stand unused, in words, 30 days where none is given, and the runner's folder,
 * that of this person where none is given. Removes each environment of `fetched/python-envs/` that was not used for
 * that long, and a folder that a making left half for as long: each by renaming its folder away first, so that none
 * is left half. Answers the folders it removed and those it kept, each in the order of its path.
 */
export function cleanEnvironments(o: { older?: string; folder?: string } = {}): { removed: string[]; kept: string[] } {
  const after = msOf('older', o.older, thirtyDays)
  const envs = join(o.folder ?? runnerFolder(), 'fetched', 'python-envs')
  const done: { removed: string[]; kept: string[] } = { removed: [], kept: [] }
  if (!existsSync(envs)) return done
  const now = Date.now()
  for (const name of readdirSync(envs).sort()) {
    const folder = join(envs, name)
    const half = name.startsWith('.')
    if (now - usedAt(folder) <= after) {
      if (!half) done.kept.push(folder)
      continue
    }
    // The folder goes out of its place before it is removed: an engine that starts now finds it whole or not at all.
    const away = join(envs, `.${name.replace(/^\./, '')}.gone.${randomBytes(4).toString('hex')}`)
    try {
      renameSync(folder, away)
    } catch {
      // A program uses a file of it on a system that keeps such a folder in its place: it stays, and is kept.
      if (!half) done.kept.push(folder)
      continue
    }
    rmSync(away, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    if (!half) done.removed.push(folder)
  }
  return done
}
