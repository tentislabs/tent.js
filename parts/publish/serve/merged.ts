import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Finding } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { History } from '../../history/index.ts'
import { pathsChanged, touchedByBoth } from './paths.ts'

/** Who writes the point of a merge that a server made by itself. */
const server = { kind: 'server' } as const

/** The failure of a push that the server does not merge: T9103, with what refused it. */
export const refusedPush = (words: string, fields: Record<string, string>, fix: string): TentError =>
  new TentError('T9103', words, { fields, fix })

/** Describes the files of a folder and holds our own rules over them: no bundle is built and no model is asked. Answers the errors. */
async function checked(folder: string): Promise<Finding[]> {
  const [{ describeProject }, { rulesOver }] = await Promise.all([
    import('../../build/index.ts'),
    import('../../check/index.ts'),
  ])
  const described = await describeProject(folder)
  const found = [...described.findings, ...(await rulesOver(described))]
  return found.filter((one) => one.level === 'error')
}

/**
 * Takes the history of a server, the pointer that was pushed to, where the pusher last saw it, where it stands now,
 * and the point that was pushed. Merges the two by itself, with no model: where no path that one side changed since
 * the pusher saw it is a path of the other, or inside it, the merged project is described and held to the rules
 * of the check, and where they pass a point of the kind `merge` with both as its parents is recorded, marked
 * `checked` by the server, and the pointer moved to it. Answers that point. Throws T9103, with nothing moved, where
 * both touched one path, where the merge clashes, and where the merged project does not pass the check. Merges
 * are made one at a time on a server, whatever pointer each is to: each moves `now` and `on` while it works.
 */
export function mergedOnServer(
  history: History,
  pointer: string,
  was: string | undefined,
  standing: string,
  pushed: string,
): Promise<string> {
  const next = (merging.get(history) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => mergedNow(history, pointer, was, standing, pushed))
  merging.set(history, next)
  return next
}

// The merge that works on each history, which the next one waits for.
const merging = new WeakMap<History, Promise<unknown>>()

/** Makes one merge on a server, as `mergedOnServer` says. */
async function mergedNow(
  history: History,
  pointer: string,
  was: string | undefined,
  standing: string,
  pushed: string,
): Promise<string> {
  const both = touchedByBoth(pathsChanged(history, was, pushed), pathsChanged(history, was, standing))
  if (both)
    throw refusedPush(
      `Someone else pushed to ${pointer} since, and both changed ${both.join(' ')}.`,
      { reason: 'pointer-moved', path: both.join('.') },
      'Pull with `tent pull`, which writes what clashes into `tent.clash.ts`, settle it, and push again.',
    )
  const kept = { now: history.pointer('now'), on: history.pointer('on') }
  const folder = mkdtempSync(join(tmpdir(), 'tent-merge-'))
  try {
    history.write(standing, folder)
    history.move('now', standing)
    // The merge follows no branch: the branch is moved once the merged project passed, so that a server that is
    // stopped meanwhile keeps it where it stood.
    history.move('on', 'now')
    const dry = history.merge(folder, pushed, server, { dry: true })
    if (dry.clashes.length)
      throw refusedPush(
        `Someone else pushed to ${pointer} since, and the two do not merge: ${dry.clashes.map((one) => `${one.what} ${one.name}`).join(', ')}.`,
        { reason: 'pointer-moved', count: String(dry.clashes.length) },
        'Pull with `tent pull`, settle what clashes, and push again.',
      )
    const merged = history.merge(folder, pushed, server)
    const point = merged.point?.id ?? pushed
    const found = await checked(folder)
    if (found.length)
      throw refusedPush(
        `Someone else pushed to ${pointer} since, and the merged project does not pass the check: ${found.map((one) => `${one.code} ${one.message}`).join(' ')}`,
        { reason: 'check', count: String(found.length) },
        'Pull with `tent pull`, mend what the check finds, and push again.',
      )
    history.mark(point, { checked: true })
    history.move(pointer, point)
    return point
  } finally {
    if (kept.now !== undefined) history.move('now', kept.now)
    if (kept.on !== undefined) history.move('on', kept.on)
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}
