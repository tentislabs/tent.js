import { TentError } from '../core/index.ts'
import type { Change, Clash, History } from '../history/index.ts'
import { lineOf } from '../history/index.ts'
import { pull } from '../publish/index.ts'
import { person, shown } from './historyWork.ts'
import { serverFetch, targetOf } from './targets.ts'

/** Whether the words of a command write the files of the project: a merge that is no dry one, a switch, a settle. */
export const writes = (args: object): boolean => {
  const what: unknown = Reflect.get(args, 'what')
  return (
    (what === 'switch' || what === 'merge' || what === 'settle' || what === 'pull') && Reflect.get(args, 'dry') !== true
  )
}

/** A text word of a command, which must hold something. Throws T0002 where it does not. */
function nameOf(args: object, name: string): string {
  const word: unknown = Reflect.get(args, name)
  if (typeof word !== 'string' || word === '')
    throw new TentError('T0002', `The command takes a text as \`${name}\`.`, { fields: { [name]: 'type' } })
  return word
}

/** The branches of a history, each with the point it stands on, and the one that `now` follows. */
function branchesOf(history: History): { on: string; branches: Record<string, string> } {
  const all = history.pointers()
  const branches = Object.fromEntries(
    Object.entries(all).filter(([name]) => name !== 'now' && name !== 'on' && !name.includes(':')),
  )
  const now = all.now
  if (all.on === undefined && now !== undefined) branches.main = now
  return { on: all.on ?? 'main', branches }
}

/** What a merge says of itself: its changes and its clashes, each also as the line that is printed. */
const mergeShown = (merged: { changes: Change[]; clashes: Clash[] }): object => ({
  changes: merged.changes,
  lines: merged.changes.map(lineOf),
  clashes: merged.clashes,
})

/**
 * Takes an open history and the words of `tent history branch` or of a dry merge. Lists the branches, makes one at
 * `now`, or answers what a merge would do with nothing changed. Throws what the history throws.
 */
export function branchWork(history: History, folder: string, args: object): unknown {
  if (Reflect.get(args, 'what') === 'merge')
    return { ...mergeShown(history.merge(folder, nameOf(args, 'from'), person, { dry: true })), merged: false }
  const name: unknown = Reflect.get(args, 'name')
  if (typeof name !== 'string' || name === '') return branchesOf(history)
  history.branch(name)
  return { branch: name, point: history.pointer(name) ?? null, ...branchesOf(history) }
}

/**
 * Takes an open history, the folder of its project, and the words of a command that writes the files: `switch`,
 * which makes the branch first where it is not there, `merge` and `settle`. Carries it out, and answers its value.
 * The command builds and checks what was written afterwards, and marks the point with what it found.
 */
export async function historyWritten(history: History, folder: string, args: object): Promise<Record<string, unknown>> {
  const what: unknown = Reflect.get(args, 'what')
  if (what === 'switch') {
    const name = nameOf(args, 'name')
    if (history.pointer(name) === undefined) history.branch(name)
    return { point: shown(history.switch(folder, name, person)), on: name }
  }
  if (what === 'settle') return { point: shown(history.settle(folder, person)) }
  if (what === 'pull') {
    // A head that did not pass the check here is not merged into, unless it is shared on purpose.
    const head = history.find('now')
    if (head?.checked === false && Reflect.get(args, 'unchecked') !== true)
      throw new TentError(
        'T9101',
        `The point ${head.id} did not pass the check on this computer, and is not pulled into.`,
        {
          fields: { point: head.id },
          fix: 'Mend what the check finds and save, or pull with `--unchecked`.',
        },
      )
    const target = targetOf(Reflect.get(args, 'to'))
    const merged = await pull({
      project: folder,
      history,
      from: target,
      fetch: serverFetch(Reflect.get(args, 'insecure')),
      by: person,
    })
    return {
      ...(merged.point ? { point: shown(merged.point) } : {}),
      ...mergeShown(merged),
      from: target.name,
      ...(merged.clashes.length ? { clashFile: 'tent.clash.ts' } : {}),
    }
  }
  const from = nameOf(args, 'from')
  for (const [side, point] of [
    ['ours', history.find('now')],
    ['theirs', history.find(from)],
  ] as const)
    if (point?.checked === false && Reflect.get(args, 'unchecked') !== true)
      throw new TentError(
        'T9101',
        `The point ${point.id}, ${side}, did not pass the check on this computer, and is not merged.`,
        {
          fields: { point: point.id },
          fix: 'Mend what the check finds and save, or merge with `--unchecked` to share work that does not pass yet.',
        },
      )
  const merged = history.merge(folder, from, person)
  return {
    ...(merged.point ? { point: shown(merged.point) } : {}),
    ...mergeShown(merged),
    merged: true,
    ...(merged.clashes.length ? { clashFile: 'tent.clash.ts' } : {}),
  }
}
