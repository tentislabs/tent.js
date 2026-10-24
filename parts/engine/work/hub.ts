import type { Caller } from '../../core/index.ts'
import { rowIds } from '../../data/index.ts'
import type { By, Carried, Ended, Runner, StepAt, Waiting } from '../../flows/index.ts'
import type { Link } from '../copy/link.ts'
import { storedLimit } from '../limits.ts'
import { noLink } from '../noLink.ts'
import type { Opened } from '../opened.ts'
import type { About } from '../web/proxy.ts'
import { aloneKeeper } from './alone.ts'
import type { KeptAnswers } from './answers.ts'
import { awaitedAt } from './awaited.ts'
import { batchOf, gathered } from './batches.ts'
import type { HandingOut } from './handOut.ts'
import { handOut } from './handOut.ts'
import { failureOf } from '../door/failure.ts'
import type { WorkerKey } from './keys.ts'
import { bearerOf } from '../bearer.ts'
import { workerKeyIn } from './keys.ts'
import { rowWorkerKey } from './rowKeys.ts'
import type { Linking } from './linking.ts'
import { couldTake, hasPlace, inOrder, kindStated, picked } from './order.ts'
import type { InQueue, Joined, OutTask } from './state.ts'
import { queueKey } from './state.ts'
import { needWatch } from './need.ts'
import { workersOf, workOf } from './views.ts'
import { freePlaces } from './counted.ts'
import { countedLink } from '../counts/links.ts'
import type { Tx } from '../../data/index.ts'
import type { Settled } from './machineTime.ts'
import { bookTry } from './machineTime.ts'
import { beforeWriting } from '../counts/gather.ts'
import { holdingOf } from './holding.ts'
import { leftTask, tasksLeft } from './shares.ts'
import type { Reserve } from './usage.ts'
import { reserveOf } from './usage.ts'

/** A step that the engine carries out on a thread of this program, for work whose kind lets it run here. */
type Here = (task: { task: string; run: string; step: StepAt; version: string; kind: string; carried: Carried }) => void

/** The writer's side of the work that goes to workers: the queue, the workers that joined, and the hand-out. */
export interface WorkHub {
  // The runner's side.
  queue(w: Waiting): void
  unqueue(run: string, step: StepAt): void
  take(task: string): void
  // The workers' side: what takes a worker that joined, and what tells the hub that it heard from one.
  joinedOf(id: string): Joined | undefined
  // The tasks that the rows said were out to a worker when the writer opened, which that worker names in its `here`: they are its again.
  claim(worker: string, named: Set<string>): OutTask[]
  join(j: Joined): void
  left(j: Joined, why: 'closed' | 'silent'): void
  pump(): void
  // What the link of a worker hands on to the runner, and a call that a worker makes.
  runnerEnded(task: string, ends: Ended[]): Promise<void>
  runnerStarted(task: string): void
  runnerProgress(task: string, kept: { value: unknown; files: string[] }): Promise<void>
  // The runner settles the try of one entry of a task, in the write it hands: its machine time is booked there.
  settled(tx: Tx, s: Settled): void
  answer(j: Joined, link: Link, message: Record<string, unknown>): void
  // Opens the link of a worker at `/_t/work`: not found without a key of `workers` or of the right `work`, and over a connection that is not secure without `insecure`.
  link(request: Request, about: About): Link
  // Loads what the link needs, once a key of the right `work` is made in an app that loaded none.
  linkable(): Promise<void>
  // What `app.workers`, `app.work` and `app.release` answer.
  workers(): object[]
  work(): object[]
  release(id: string): boolean
  // The bytes of those files were removed here: every joined worker is told, and one that joins later is told too.
  gone(fingerprints: string[]): void
  // The caller of a run, as a task of it is carried out: its starter where it runs as its starter, and else the system.
  callerOfRun(run: { as: string; startedBy: By }): Caller
  // Whether a task of that run is out, to a worker or here.
  handedOut(run: string): boolean
  readonly keys: WorkerKey[]
  readonly all: Map<string, Joined>
  close(): void
}

/** What the hub works with: the app, its runner, how a starter's caller is built, and what carries a step out here. */
export interface HubOf {
  o: Opened
  runner: Runner
  callerOf(by: By): Caller
  here: Here
  keys: WorkerKey[]
  insecure: boolean
  // What the link needs, loaded where workers may join.
  linking?: Linking
}

/** Sends one message on a link: a JSON object in a text frame. */
const send = (link: Link, message: object): void => link.send(JSON.stringify(message))

// The most fingerprints of removed bytes that a writer keeps for the workers that join after: the oldest go first.
const goneKept = 10_000

/** Tells a worker of fingerprints whose bytes were removed, in as many `gone` as keep each within `inFrame`. */
function tellGone(o: Opened, link: Link, fingerprints: string[]): void {
  // A fingerprint is 64 characters, with its quotes and its comma 67.
  const each = Math.max(1, Math.floor((storedLimit(o.description, 'inFrame') - 64) / 67))
  for (let i = 0; i < fingerprints.length; i += each) send(link, { t: 'gone', files: fingerprints.slice(i, i + each) })
}

/** The time between two beats of the link of a worker, and how long a worker may send nothing, of the running version. */
export const workTimes = (o: Opened): { beat: number; behind: number; fetch: number; dial: number } => {
  const limit = (name: string): number => storedLimit(o.description, name)
  return {
    beat: limit('workBeat') || limit('beat'),
    behind: limit('workBehind') || limit('behind'),
    fetch: limit('workFetch'),
    dial: limit('workDial'),
  }
}

/**
 * Takes what the hub works with. Answers the hub: it keeps the tries that wait, by their kind, hands each to a
 * worker of its kind that has a place, in the order that the kind states, carries work whose kind lets it run
 * here on a thread of this program where no worker could take it, fails work that waited `wait` for none, and
 * takes a worker that fell silent as gone, with its tasks lost.
 */
export function workHub(h: HubOf): WorkHub {
  const { o, runner } = h
  let linking = h.linking
  let loading: Promise<void> | undefined
  const linkable = (): Promise<void> => {
    loading ??= linking
      ? Promise.resolve()
      : import('./linking.ts').then((loaded) => {
          linking = loaded.linking
        })
    return loading
  }
  const queued = new Map<string, InQueue>()
  const all = new Map<string, Joined>()
  // The tasks that are carried out here, by their id, with the run and step of each.
  const hereTasks = new Map<string, { run: string; step: StepAt }>()
  // Since when no worker could take the work of a kind.
  const noneSince = new Map<string, number>()
  let seq = 0
  const alone = aloneKeeper()
  // When each caller was last handed a task, for a kind that gives each caller a turn.
  const turns = new Map<string, number>()
  let turn = 0
  let over = false
  let pumping = false
  let cancelBeat: (() => void) | undefined
  let cancelWait: (() => void) | undefined
  // The fingerprints whose bytes were removed since this writer opened, with when; and when each worker left.
  const removed: { fingerprint: string; at: number }[] = []
  const leftAt = new Map<string, number>()

  const times = (): ReturnType<typeof workTimes> => workTimes(o)
  const startedByOf = (run: string): string => {
    const by = runner.read(run)?.startedBy
    return by ? `${by.kind}:${by.id ?? ''}` : ''
  }
  const outOfCaller = (caller: string): number => {
    let count = 0
    for (const j of all.values())
      for (const one of j.out.values()) if (startedByOf(one.steps[0]?.run ?? '') === caller) count++
    return count
  }
  const outOfKind = (kind: string): number => {
    let count = 0
    for (const j of all.values()) for (const one of j.out.values()) if (one.kind === kind) count++
    return count
  }

  const handing: HandingOut = {
    o,
    runner,
    callerOf: h.callerOf,
    fetch: () => times().fetch,
    pump: () => pump(),
    over: () => over,
  }
  // When a batch that is not full may go: a timer for the first moment that one may.
  let cancelBatch: (() => void) | undefined

  /** Carries a task out on a thread of this program: the runner notes it under the worker `here`. */
  async function handHere(entry: InQueue): Promise<void> {
    const { w } = entry
    const task = rowIds.next()
    hereTasks.set(task, { run: w.run, step: w.step })
    const [carried] = await runner.out([{ run: w.run, step: w.step }], { task, worker: 'here', kind: w.kind })
    if (!carried) {
      hereTasks.delete(task)
      return
    }
    runner.started(task)
    h.here({ task, run: w.run, step: w.step, version: w.version, kind: w.kind, carried })
  }

  /** Fails, or sends to `next`, each try that waited `wait` with no worker of its kind that could take it. */
  function waitTimer(): void {
    cancelWait?.()
    cancelWait = undefined
    const now = o.clock.now()
    let next: number | undefined
    for (const [key, entry] of queued) {
      const since = noneSince.get(entry.w.kind)
      // The time of a try that a limit of use holds back does not run, and runs from the moment it was let go.
      if (since === undefined || holding.held(key)) continue
      const ends =
        Math.max(since, entry.w.since, holding.freedAt(key) ?? 0) + kindStated(o.description, entry.w.kind).wait
      if (ends <= now) {
        queued.delete(key)
        runner.none(entry.w.run, entry.w.step)
      } else if (next === undefined || ends < next) next = ends
    }
    if (next !== undefined) cancelWait = o.clock.setTimer(next, waitTimer)
  }

  function pump(): void {
    if (over || pumping) return
    pumping = true
    holding.begin()
    try {
      const now = o.clock.now()
      const { beat } = times()
      const kinds = new Set([...queued.values()].map((one) => one.w.kind))
      for (const kind of kinds) {
        const stated = kindStated(o.description, kind)
        const ofKind = [...queued.values()].filter((one) => one.w.kind === kind)
        // Where no worker of the kind has a free place, and none runs it here, nothing of a long queue is handed
        // out: it is not laid in order, and each try is held to its limits alone.
        if (!stated.orHere && ![...all.values()].some((j) => j.joined && j.kinds.includes(kind) && hasPlace(j))) {
          const versions = new Set(ofKind.map((one) => one.w.version))
          const able = [...versions].some((version) =>
            [...all.values()].some((j) => couldTake(j, kind, version, now, beat)),
          )
          if (!able && !noneSince.has(kind)) noneSince.set(kind, now)
          else if (able) noneSince.delete(kind)
          for (const entry of ofKind)
            if (holding.check(entry) === 'refused') queued.delete(queueKey(entry.w.run, entry.w.step))
          continue
        }
        const waiting = inOrder(
          ofKind,
          stated,
          (run) => runner.waited(run),
          outOfCaller,
          startedByOf,
          (caller) => turns.get(caller) ?? -1,
        )
        const goesAlone = (entry: InQueue): boolean => entry.w.alone === true && stated.alone !== false
        const kept = alone.keep(
          kind,
          stated.alone,
          [...all.values()].filter((j) => j.joined && j.kinds.includes(kind) && !j.released && j.going === undefined),
          waiting.filter(goesAlone).length,
        )
        for (const entry of waiting) {
          const verdict = holding.check(entry)
          if (verdict === 'refused') queued.delete(queueKey(entry.w.run, entry.w.step))
          if (verdict !== 'go') continue
          const able = [...all.values()].filter((j) => couldTake(j, kind, entry.w.version, now, beat))
          // A task that goes alone goes to a kept worker that holds nothing, and a kept worker is handed nothing else.
          const free = goesAlone(entry)
            ? able.filter((j) => kept.has(j.id) && j.out.size === 0)
            : able.filter((j) => hasPlace(j) && !kept.has(j.id))
          const full = stated.atOnce !== undefined && outOfKind(kind) >= stated.atOnce
          if (!able.length) {
            if (!noneSince.has(kind)) noneSince.set(kind, now)
          } else noneSince.delete(kind)
          const here = stated.orHere === true ? !able.length : stated.orHere === 'busy' ? !free.length : false
          if (here) {
            queued.delete(queueKey(entry.w.run, entry.w.step))
            // A hand-out that fails is written into the log of errors: it never ends the program.
            handHere(entry).catch((error: unknown) => void failureOf(o, 'a hand-out of work', error))
            continue
          }
          const worker = full ? undefined : picked(free, stated, entry.w.of === 'action' ? entry.w.flow : undefined)
          if (!worker || !queued.has(queueKey(entry.w.run, entry.w.step))) continue
          // The calls of a definition that states `batch`, which wait behind this one, go with it.
          const batch = entry.w.of === 'action' ? batchOf(o, entry.w.flow) : undefined
          const group = batch
            ? gathered(
                entry,
                waiting.filter((one) => queued.has(queueKey(one.w.run, one.w.step))),
                batch,
                (run) => runner.read(run)?.input,
                storedLimit(o.description, 'taskSize'),
              )
            : [entry]
          // A batch that is not full waits for `wait` from the moment its first call began to wait.
          if (batch?.wait !== undefined && group.length < batch.max && now < entry.w.since + batch.wait) {
            holdBatch(entry.w.since + batch.wait)
            continue
          }
          for (const one of group) queued.delete(queueKey(one.w.run, one.w.step))
          turns.set(startedByOf(entry.w.run), ++turn)
          handOut(handing, group, worker).catch((error: unknown) => void failureOf(o, 'a hand-out of work', error))
        }
      }
      holding.end()
      waitTimer()
    } finally {
      pumping = false
    }
    need.look()
  }

  /** Looks again at the queue when a batch that is not full may go. */
  function holdBatch(at: number): void {
    cancelBatch?.()
    cancelBatch = o.clock.setTimer(at, () => {
      cancelBatch = undefined
      pump()
    })
  }

  /** The beat runs while a worker is held: one that sent nothing for `workBehind` and one beat is gone, and its tasks are lost in silence. */
  function armBeat(): void {
    if (over || cancelBeat || !all.size) return
    cancelBeat = o.clock.setTimer(o.clock.now() + times().beat, onBeat)
  }

  function onBeat(): void {
    cancelBeat = undefined
    if (over) return
    const { beat, behind } = times()
    const now = o.clock.now()
    for (const j of [...all.values()]) {
      if (now - j.alive <= behind + beat) continue
      if (j.joined || j.out.size) left(j, 'silent')
      if (!j.open && !j.out.size) all.delete(j.id)
    }
    armBeat()
    pump()
  }

  /** The tasks that were out to a worker that is gone, lost in silence. */
  function lose(j: Joined): void {
    for (const out of [...j.out.values()]) {
      j.out.delete(out.task)
      freePlaces(o, out.task)
      j.inARow = { ...j.inARow, lost: j.inARow.lost + 1 }
      void runner
        .ended(
          out.task,
          out.steps.map(() => ({ lost: 'silent' as const, beside: out.beside })),
        )
        .catch(() => undefined)
    }
  }

  function left(j: Joined, why: 'closed' | 'silent'): void {
    j.out.advance()
    leftAt.set(j.id, o.clock.now())
    if (j.joined) {
      j.joined = false
      o.raise('worker.left', { app: o.app, worker: j.id, kinds: j.kinds })
    }
    // A link that closed keeps the tasks of its worker out for the window in which the worker may come back; silence loses them.
    if (why === 'closed') j.open = false
    else lose(j)
    pump()
  }

  const kept: KeptAnswers = new Map()
  // The host of the machines is told what waits and what is idle, and so are the handlers of the app's events.
  const need = needWatch(
    o,
    () => queued.values(),
    () => all,
    o.workersHost,
    { heldBack: (kind) => holding.heldBack(kind), shown: (kind) => holding.shown(kind) },
  )

  const awaited = awaitedAt(o, runner, times().behind + times().beat, () => pump())
  // What the tasks that are out reserve against the limits of use: those out to a worker, those whose try is being
  // settled, and those that the rows said were out when this writer opened.
  const reserves = (): Reserve[] =>
    [...[...all.values()].flatMap((j) => [...j.out.values()]), ...tasksLeft(o), ...awaited.out()].map((one) =>
      reserveOf(o, one),
    )
  const holding = holdingOf(o, runner, reserves, () => pump())
  // What the machines stood since the last change is counted before each write of the counts.
  beforeWriting(o, () => {
    for (const j of all.values()) j.out.advance()
  })

  const hub: WorkHub = {
    runnerEnded: async (task, ends) => {
      kept.delete(task)
      try {
        await runner.ended(task, ends)
      } finally {
        // What the task reserved is let go: a fill that a limit held back may go now.
        leftTask(o, task, true)
        o.filling?.poke()
      }
    },
    runnerStarted: (task) => runner.started(task),
    settled: (tx, s) => bookTry(o, tx, s),
    runnerProgress: (task, value) => runner.progress(task, value),
    answer: (j, link, message) => linking?.answerCall(o, runner, h.callerOf, kept, j, link, message),
    link(request, about) {
      const sent = bearerOf(request)
      const key = sent === '' ? undefined : (workerKeyIn(h.keys, sent) ?? rowWorkerKey(o, request))
      // An app that was closed takes no worker any more.
      if (over || o.closed || !key || (about.scheme !== 'https' && !h.insecure)) throw noLink()
      // A key that was made while the link was not loaded: it is loaded now, and the worker dials again.
      if (!linking) {
        void linkable()
        throw noLink()
      }
      const [writerEnd, workerEnd] = linking.linkPair()
      // What the link of a worker carries is counted under `work`, as its bytes.
      linking.takeWorker(o, hub, key, countedLink(o, 'work', writerEnd))
      return workerEnd
    },
    linkable,
    queue(w) {
      const key = queueKey(w.run, w.step)
      if (queued.has(key)) return
      queued.set(key, { w, seq: ++seq })
      // Work that waits, with nothing that could take it, is told.
      pump()
    },
    unqueue(run, step) {
      queued.delete(queueKey(run, step))
    },
    take(task) {
      for (const j of all.values())
        if (j.out.has(task)) {
          j.out.delete(task)
          freePlaces(o, task)
          j.stopping.add(task)
        }
      hereTasks.delete(task)
      pump()
    },
    joinedOf: (id) => all.get(id),
    claim: (worker, named) => awaited.claim(worker, named),
    join(j) {
      all.set(j.id, j)
      // A worker that joins is told what was removed since it left, or since this writer opened where it never was here.
      const since = leftAt.get(j.id) ?? Number.NEGATIVE_INFINITY
      tellGone(
        o,
        j.link,
        removed.filter((one) => one.at >= since).map((one) => one.fingerprint),
      )
      o.raise('worker.joined', { app: o.app, worker: j.id, kinds: j.kinds })
      armBeat()
      pump()
    },
    left,
    pump,
    workers: () => workersOf(all),
    work: () => workOf(o, queued.values(), all, holding),
    release(id) {
      const j = all.get(id)
      if (!j) return false
      if (!j.released) {
        j.released = true
        send(j.link, { t: 'release' })
      }
      return j.out.size === 0
    },
    gone(fingerprints) {
      const now = o.clock.now()
      removed.push(...fingerprints.map((fingerprint) => ({ fingerprint, at: now })))
      removed.splice(0, Math.max(0, removed.length - goneKept))
      for (const j of all.values()) if (j.open) tellGone(o, j.link, fingerprints)
    },
    callerOfRun: (run) => (run.as === 'starter' ? h.callerOf(run.startedBy) : { kind: 'system' }),
    handedOut: (run) =>
      [...all.values()].some((j) => [...j.out.values()].some((one) => one.steps.some((step) => step.run === run))) ||
      [...hereTasks.values()].some((one) => one.run === run),
    keys: h.keys,
    all,
    close() {
      for (const j of all.values()) j.out.advance()
      over = true
      need.close()
      cancelBatch?.()
      cancelBeat?.()
      cancelWait?.()
      holding.close()
      for (const j of all.values()) j.link.close()
      all.clear()
      queued.clear()
    },
  }
  return hub
}
