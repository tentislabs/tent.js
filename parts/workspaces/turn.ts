import type { Caller, Finding } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { finding, wordsOf } from '../core/internal.ts'
import { rowIds } from '../engine/index.ts'
import type { App } from '../engine/index.ts'
import type { TurnRow, Writer } from '../history/index.ts'
import type { Turn, TurnOptions } from './face.ts'
import { checkedWorkspace, runWorkspace } from './opening.ts'
import { keepSnapshots, snapshotFor } from './snapshots.ts'
import type { Held, One } from './state.ts'
import { historyOf, oneOf } from './state.ts'

/** What a turn was asked, as its row keeps it, so that it is taken up the same after a start of the program. */
interface Asked {
  agent: string
  message: string
  thread: string
  caller: Caller
  budget?: Record<string, number>
  rounds: number
  // The runs of the turn, oldest first, and those whose use was counted into the row.
  runs: string[]
  counted: string[]
}

/** A turn that works on a workspace in this program: its id, and what ends and stops it. */
export interface Turning {
  id: string
  // Kept once the first run started, or once the turn ended before one could.
  started: Promise<void>
  ended: Promise<void>
  stop(): Promise<void>
}

// How many rounds of build and mend a turn makes where it is given no number.
const roundsLeftOut = 3

// How many turns keep their snapshots of the data where the workspaces were given no number.
const keptLeftOut = 20

/** The writer of the points of a turn: the AI, which works for the person who asked. */
const ai: Writer = { kind: 'ai' }

/** A turn as the members answer it: without what the history keeps of it for itself. */
export const shownOf = (row: TurnRow): Turn => ({
  id: row.id,
  state: row.state,
  ...(row.run === undefined ? {} : { run: row.run }),
  changes: row.changes,
  findings: row.findings,
  used: row.used,
  rounds: row.rounds,
  ...(row.stopped === undefined ? {} : { stopped: row.stopped }),
})

/** The record of an agent of the product's app: T0001 where the app holds none of that name. */
export function agentOf(app: App, name: string): object {
  const record: unknown = Object.hasOwn(app.description.flows, name) ? app.description.flows[name] : undefined
  if (typeof record !== 'object' || record === null || Reflect.get(record, 'agent') === undefined)
    throw new TentError('T0001', `The product's app holds no agent ${JSON.stringify(name).slice(0, 60)}.`)
  return record
}

/** A failure as a finding, an error with its code and its message, which the turn keeps among its findings. */
function failureOf(error: unknown): Finding {
  const [code, fix] = [Reflect.get(Object(error), 'code'), Reflect.get(Object(error), 'fix')]
  return finding(
    typeof code === 'string' ? code : 'T0009',
    error instanceof Error ? error.message : String(error),
    typeof fix === 'string' ? { fix } : {},
  )
}

const kinds: unknown[] = ['user', 'key', 'mcp', 'system', 'nobody']

/** Whether a value that a row kept is a caller: one of the kinds, and a user with an id where it names one. */
function isCaller(value: unknown): value is Caller {
  if (typeof value !== 'object' || value === null || !kinds.includes(Reflect.get(value, 'kind'))) return false
  const user: unknown = Reflect.get(value, 'user')
  return user === undefined || typeof Reflect.get(Object(user), 'id') === 'string'
}

/** What was asked of a turn, from its row: nothing for a row that keeps none. */
function askedOf(row: TurnRow): Asked | undefined {
  const asked: unknown = row.asked
  if (typeof asked !== 'object' || asked === null) return undefined
  const of = (name: string): unknown => Reflect.get(asked, name)
  const list = (name: string): string[] => {
    const listed = of(name)
    return Array.isArray(listed) ? listed.map(String) : []
  }
  const budget = of('budget')
  const caller = of('caller')
  return {
    agent: String(of('agent')),
    message: String(of('message')),
    thread: String(of('thread')),
    // A caller that the row does not keep as one is nobody: the turn is carried on with no rights.
    caller: isCaller(caller) ? caller : { kind: 'nobody' },
    ...(typeof budget === 'object' && budget !== null
      ? {
          budget: Object.fromEntries(
            Object.entries(budget).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
          ),
        }
      : {}),
    rounds: Number(of('rounds') ?? roundsLeftOut),
    runs: list('runs'),
    counted: list('counted'),
  }
}

/** The message of the first round: the person's words, and the place they pointed at in the engine's own words. */
function firstMessage(record: object, message: string, at: TurnOptions['at']): string {
  if (!at) return message
  const words: Record<string, string> = Object(Reflect.get(Object(Reflect.get(record, 'agent')), 'words') ?? {})
  const place = at.place
  const line =
    place === undefined
      ? wordsOf(words, 'pointedAt', at.screen)
      : wordsOf(words, 'pointedAtPlace', `${place.file}:${place.from}-${place.to}`).replace('{}', at.screen)
  return `${message}\n\n${line}`
}

/** The message of a round that mends: the errors the check found, one on each line. */
function mendingMessage(record: object, findings: Finding[]): string {
  const words: Record<string, string> = Object(Reflect.get(Object(Reflect.get(record, 'agent')), 'words') ?? {})
  const lines = findings
    .filter((one) => one.level === 'error')
    .map((one) => {
      const where = one.where === undefined ? '' : ` (${one.where.file}:${one.where.line})`
      return `${one.code} ${one.message}${where}`
    })
  return [wordsOf(words, 'findings'), ...lines].join('\n')
}

/** What a budget leaves after what the turn used, unit by unit. */
const leftOf = (budget: Record<string, number>, used: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(budget).map(([unit, most]) => [unit, most - (used[unit] ?? 0)]))

/** What a run used by itself, unit by unit, as its entries hold it. */
function usedBy(app: App, run: string): Record<string, number> {
  const sums: Record<string, number> = {}
  for (const entry of app.runs.read(run)?.used ?? []) {
    const units: unknown = Reflect.get(Object(entry), 'units')
    for (const [unit, amount] of Object.entries(Object(units ?? {})))
      if (typeof amount === 'number') sums[unit] = (sums[unit] ?? 0) + amount
  }
  return sums
}

/** How the run of a round ended, for the turn: on, or the reason the turn stops. */
async function endOf(app: App, run: string): Promise<TurnRow['stopped'] | 'on' | 'failed'> {
  try {
    await app.runs.wait(run)
    return 'on'
  } catch (error) {
    const code: unknown = Reflect.get(Object(error), 'code')
    if (code === 'T5106') return 'person'
    if (code === 'T7102') return 'budget'
    if (code === 'T7111') return 'refused'
    return 'failed'
  }
}

/**
 * Carries a turn out from where its row stands: starts a round where none was started, waits for the run of a
 * round, and builds and checks after it, with a round that mends while errors are left and rounds remain. Ends it
 * with its second point, a snapshot of the data, and its row as done or stopped.
 */
async function carried(
  held: Held,
  one: One,
  row: TurnRow,
  asked: Asked,
  said: { started(): void; stopping: boolean },
): Promise<void> {
  const product = held.o.app
  const history = historyOf(one)
  const record = agentOf(product, asked.agent)
  const write = (): void => history.turn(row)
  const newest = asked.runs.at(-1)
  let phase: 'start' | 'wait' | 'check' =
    newest === undefined ? 'start' : asked.counted.includes(newest) ? 'check' : 'wait'
  let message = row.rounds === 0 ? asked.message : mendingMessage(record, row.findings)
  let ending: TurnRow['stopped'] | 'failed' | undefined
  // The rows changed once the newest run ended, and whether a hand wrote while the turn built after it: the page
  // shows no working run then, and such a row is the person's, which an undo keeps.
  let ran: number | undefined
  let byHand = false
  const heldCount = (): void => {
    if (ran !== undefined && (one.rowsChanged ?? 0) !== ran) byHand = true
  }
  for (;;) {
    if (said.stopping) ending = 'person'
    if (ending) break
    if (phase === 'start') {
      // A round is started with what is left of the budget, and a budget that is spent stops the turn first.
      const left = asked.budget ? leftOf(asked.budget, row.used) : undefined
      if (left && Object.values(left).some((amount) => amount <= 0)) {
        ending = 'budget'
        continue
      }
      const started = await product.start(
        asked.agent,
        { message, thread: asked.thread },
        {
          as: asked.caller,
          ...(left ? { limits: { perRun: left } } : {}),
          sources: [{ name: 'project', context: { workspace: one.workspace.id } }],
        },
      )
      // A start that the pace of the agent dropped made no run, and ends the turn.
      if (!('run' in started)) {
        ending = 'failed'
        continue
      }
      const { run } = started
      asked.runs.push(run)
      row.run = run
      row.rounds += 1
      write()
      phase = 'wait'
    }
    said.started()
    if (phase === 'wait') {
      const run = String(asked.runs.at(-1))
      const end = await endOf(product, run)
      for (const [unit, amount] of Object.entries(usedBy(product, run))) row.used[unit] = (row.used[unit] ?? 0) + amount
      asked.counted.push(run)
      write()
      ran = one.rowsChanged ?? 0
      if (end !== 'on') ending = end
      phase = 'check'
      continue
    }
    const checked = await checkedWorkspace(held, one.workspace.id, heldCount).catch((error: unknown) => ({
      findings: [failureOf(error)],
    }))
    row.findings = checked.findings
    write()
    if (!row.findings.some((found) => found.level === 'error')) break
    if (row.rounds >= asked.rounds) ending = 'rounds'
    message = mendingMessage(record, row.findings)
    phase = 'start'
  }
  said.started()
  const app = await runWorkspace(held, one.workspace.id)
  // The snapshot is taken first, so that a row the person adds once the new version shows is no change of the turn.
  const snapshot = await snapshotFor(one, app, `${row.id}-after`)
  const after = history.record(one.folders.project, {
    by: ai,
    kind: 'turn',
    checked: !row.findings.some((found) => found.level === 'error'),
    description: app.description,
  })
  row.after = after.id
  row.dataAfter = snapshot.file
  // A turn that a hand wrote into keeps no count of its end: an undo over it keeps the data.
  if (!byHand) row.dataEnd = snapshot.count
  row.state = ending ? 'stopped' : 'done'
  if (ending && ending !== 'failed') row.stopped = ending
  write()
  keepSnapshots(one, held.o.turnsKept ?? keptLeftOut)
}

/**
 * Follows a turn in this program: carries it out from its row and keeps what ends and stops it on the workspace.
 * What fails in the turn ends it as stopped, with its second point where one can be recorded.
 */
function follow(held: Held, one: One, row: TurnRow, asked: Asked): Turning {
  let started = (): void => {}
  const said = { started: () => started(), stopping: false }
  const startedNow = new Promise<void>((done) => {
    started = done
  })
  const ended = carried(held, one, row, asked, said)
    .catch((error: unknown) => {
      if (held.closed) return
      row.state = 'stopped'
      row.findings = [...row.findings, failureOf(error)]
      historyOf(one).turn(row)
    })
    .finally(() => {
      said.started()
      if (one.turning?.id === row.id) one.turning = undefined
    })
  const turning: Turning = {
    id: row.id,
    started: startedNow,
    ended,
    async stop() {
      said.stopping = true
      const run = asked.runs.at(-1)
      if (run !== undefined) {
        try {
          held.o.app.runs.stop(run)
        } catch {
          // A run that ended already stops nothing: the turn ends as it stands.
        }
      }
      await ended
    },
  }
  one.turning = turning
  return turning
}

/**
 * Takes what the workspaces hold, the workspace, the agent of the product, the person's message and the options.
 * Starts a turn: records a point of the kind `turn`, takes a snapshot of the test data, writes the row, starts the
 * agent with the project tools, and builds and checks until it passes. One turn works on a
 * workspace at a time: a second waits, is refused with T7103, or stops the first, as `then` says. Answers the turn
 * once it ended, or with `wait: false` once its run started.
 */
export async function turnOn(held: Held, id: string, agent: string, message: string, o: TurnOptions): Promise<Turn> {
  const one = oneOf(held, id)
  const record = agentOf(held.o.app, agent)
  while (one.turning) {
    if (o.then === 'refuse')
      throw new TentError('T7103', `A turn works on the workspace ${id} already.`, {
        fix: 'Wait for the turn that works, or start this one with `then: "wait"` or `"stop"`.',
      })
    if (o.then === 'stop') await one.turning.stop()
    else await one.turning.ended
  }
  const history = historyOf(one)
  const turnId = rowIds.next()
  // The place is held at once, so that a second turn that arrives meanwhile waits for this one.
  let begun = (): void => {}
  const placeholder: Turning = {
    id: turnId,
    started: Promise.resolve(),
    ended: new Promise<void>((done) => {
      begun = done
    }),
    stop: async () => undefined,
  }
  one.turning = placeholder
  let row: TurnRow
  let turning: Turning
  try {
    const app = await runWorkspace(held, id)
    const before = history.record(one.folders.project, { by: ai, kind: 'turn', description: app.description })
    const snapshot = await snapshotFor(one, app, `${turnId}-before`)
    const asked: Asked = {
      agent,
      message: firstMessage(record, message, o.at),
      thread: o.thread ?? turnId,
      caller: o.caller,
      ...(o.budget ? { budget: o.budget } : {}),
      rounds: o.rounds ?? roundsLeftOut,
      runs: [],
      counted: [],
    }
    row = {
      id: turnId,
      state: 'working',
      before: before.id,
      dataBefore: snapshot.file,
      dataCount: snapshot.count,
      rounds: 0,
      findings: [],
      by: o.caller.kind === 'user' && o.caller.user ? { kind: 'person', id: o.caller.user.id } : { kind: 'tool' },
      at: Date.now(),
      used: {},
      asked,
      changes: [],
    }
    history.turn(row)
    turning = follow(held, one, row, asked)
  } catch (error) {
    if (one.turning === placeholder) one.turning = undefined
    throw error
  } finally {
    begun()
  }
  await (o.wait === false ? turning.started : turning.ended)
  const [read] = history.turns().filter((one) => one.id === row.id)
  return shownOf(read ?? row)
}

/**
 * Takes up each turn of a workspace that its row says still works, after a start of the program: it waits for its
 * run again, or goes on with the build and the rounds that mend.
 */
export function takeUpTurns(held: Held, one: One): void {
  if (one.turning) return
  const [row] = historyOf(one).turns({ unfinished: true })
  const asked = row ? askedOf(row) : undefined
  if (!row || !asked) return
  // The row keeps the same record of what was asked that the turn writes into, round by round.
  follow(held, one, { ...row, asked }, asked)
}
