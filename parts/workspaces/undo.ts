import { existsSync } from 'node:fs'
import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { Change, TurnRow, Writer } from '../history/index.ts'
import { runWorkspace } from './opening.ts'
import { sentSince } from './sent.ts'
import { countNow } from './snapshots.ts'
import type { Held, One } from './state.ts'
import { historyOf, oneOf } from './state.ts'

/**
 * Whether no hand changed the data since a turn began: the store's count at each turn's end is its count at the
 * next one's start, and the count now is that of the end of the last. `going` holds the turns, the oldest first.
 */
function untouched(going: TurnRow[], now: number): boolean {
  for (let n = 0; n < going.length; n++) {
    const end = going[n].dataEnd
    const next = n + 1 < going.length ? going[n + 1].dataCount : now
    if (end === undefined || end !== next) return false
  }
  return true
}

/** What an undo cannot take back, named plainly: what went live, what was sent out, and runs that went on. */
async function keptOf(one: One, from: number): Promise<string[]> {
  const kept: string[] = []
  const live = one.live?.versions().filter((version) => version.addedAt >= from) ?? []
  if (live.length || (one.workspace.live && !one.live))
    kept.push(
      `What was published stays live, at ${one.workspace.live?.address ?? 'its address'}: publish again to change it.`,
    )
  for (const name of sentSince(one, from))
    kept.push(`What ${name} sent out, to a service or by mail, was sent and stays sent.`)
  const runs: { state: string; flow: string }[] = one.app?.runs.find({}) ?? []
  // A run that has not ended is queued, running or waiting: each goes on, by the state it stands in.
  for (const state of ['running', 'waiting', 'queued']) {
    const going = runs.filter((run) => run.state === state)
    if (going.length)
      kept.push(`Runs of the app ${state} go on, and are not undone: ${going.map((run) => run.flow).join(', ')}.`)
  }
  return kept
}

/**
 * Takes what the workspaces hold, the workspace, the turn and who asks. Goes back to before that turn, and every
 * later turn goes with it: a turn that still works is stopped first. The files of the turn's first point are
 * written back, as going back does. The test data is put back to the turn's snapshot where it is still kept and no
 * hand changed the data since, or with `data: 'back'` where it is kept. Throws T0001 for a turn that is not there,
 * and T0002 for one that was undone. Answers what it changed, whether the data went back, and what it cannot undo.
 */
export async function undoTurn(
  held: Held,
  id: string,
  turn: string,
  o: { caller: Caller; data?: 'back' },
): Promise<{ changes: Change[]; data: 'back' | 'kept'; kept: string[] }> {
  const one = oneOf(held, id)
  const history = historyOf(one)
  const find = (): { all: TurnRow[]; at: number } => {
    const all = history.turns()
    return { all, at: all.findIndex((row) => row.id === turn) }
  }
  if (find().at < 0)
    throw new TentError('T0001', `No turn ${JSON.stringify(turn).slice(0, 60)} is in the workspace ${id}.`)
  if (one.turning) await one.turning.stop()
  const { all, at } = find()
  const target = all[at]
  if (target.state === 'undone')
    throw new TentError('T0002', `The turn ${turn} was undone already.`, {
      fix: 'Undo a turn that is not undone; the turns that went with an undo read `undone`.',
    })
  const going = all
    .slice(0, at + 1)
    .filter((row) => row.state !== 'undone')
    .reverse()
  const app = await runWorkspace(held, id)
  const snapshot = target.dataBefore !== undefined && existsSync(target.dataBefore) ? target.dataBefore : undefined
  const back = snapshot !== undefined && (o.data === 'back' || untouched(going, await countNow(one, app)))
  const by: Writer =
    o.caller.kind === 'user' && o.caller.user ? { kind: 'person', id: o.caller.user.id } : { kind: 'tool' }
  const point = history.back(one.folders.project, target.before, by)
  const present = point.parents[0]
  const changes = present === undefined ? [] : history.compare(present, target.before)
  const ran = await runWorkspace(held, id)
  if (back && snapshot) await ran.restore(snapshot)
  for (const row of going) history.turn({ ...row, state: 'undone' })
  return { changes, data: back ? 'back' : 'kept', kept: await keptOf(one, target.at) }
}
