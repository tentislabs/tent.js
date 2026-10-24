import { TentError } from '../../core/index.ts'
import type { Ended } from '../../flows/index.ts'
import type { Frame, Link } from '../copy/link.ts'
import { messageOf, tell } from '../copy/link.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import type { WorkHub } from './hub.ts'
import { workTimes } from './hub.ts'
import type { WorkerKey } from './keys.ts'
import { pastMinute } from './perMinute.ts'
import { keyGone } from './rowKeys.ts'
import { settledNow } from './settled.ts'
import type { Joined } from './state.ts'
import { carried, forgetMade, holdsFiles, keptOfTask, keptUndone } from './taskFiles.ts'
import { freePlaces } from './counted.ts'
import { freeTime } from './machineTime.ts'
import { TasksOut, taskLeft } from './shares.ts'
import { placeOfSent } from './placed.ts'
import { spansFrom } from '../trace/away.ts'
import { failureOf } from '../door/failure.ts'

// The major version of the engine that a worker must run: its code and its messages are those of this one.
const major = '1'

const textsOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])

/** An error as a worker sends it in the wire form, read back as one. */
function errorOf(sent: unknown): TentError {
  const held = Object(sent)
  const place = placeOfSent(sent)
  return new TentError(
    typeof held.code === 'string' ? held.code : 'T0009',
    typeof held.message === 'string' ? held.message : 'The work failed.',
    { ...(typeof held.fix === 'string' ? { fix: held.fix } : {}), ...(place ? { place } : {}) },
  )
}

/**
 * Takes the app, its hub, the key that the opening of a link carried, and the writer's end of that link. Takes
 * every message of the worker on it: `here` joins it, `ready` makes a version its own, `alive` keeps it joined and
 * is answered with the tasks to stop, and the end of each task is saved and confirmed. A message of a task that is
 * not out to that worker is refused with T5108, and nothing of it is taken.
 */
export function takeWorker(o: Opened, hub: WorkHub, key: WorkerKey, link: Link): void {
  let joined: Joined | undefined
  // The messages of this worker in the minute that is running.
  const minute = { since: o.clock.now(), n: 0 }
  const no = (code: string): void => {
    tell(link, { t: 'no', code })
    link.close()
  }
  const outTo = (task: unknown): boolean => joined?.out.has(String(task)) === true
  // What this worker was last told of the machines that may take over.
  let toldMachines = ''
  /** Tells the worker where the machines that may take over are reached, after `go` and whenever that changes: it dials those, and no other, when its writer goes. */
  const tellMachines = (j: Joined): void => {
    const own = o.machine
      .machines()
      .filter((one) => one.role === 'reader' && one.take && one.own !== undefined)
      .map((one) => String(one.own))
    const text = JSON.stringify(own)
    if (text === toldMachines) return
    toldMachines = text
    tell(j.link, { t: 'machines', own })
  }

  /** Saves the end of a task and confirms it, or refuses it where the task is not out to this worker. */
  const end = (task: unknown, what: string, ends: Ended[]): void => {
    const id = String(task)
    const j = joined
    if (!j || !outTo(id)) {
      tell(link, { t: 'refused', task: id, what, code: 'T5108' })
      return
    }
    const out = j.out.get(id)
    j.out.delete(id)
    freePlaces(o, id)
    if (j.out.size === 0) j.freeSince = o.clock.now()
    void forgetMade(o, out)
    hub
      .runnerEnded(id, out?.steps.length ? out.steps.map((_, i) => ends[i] ?? ends[0]) : ends)
      .then(() => settledNow(o))
      .then(
        () => tell(link, { t: 'saved', task: id, what }),
        (error: unknown) =>
          tell(link, { t: 'refused', task: id, what, code: error instanceof TentError ? error.code : 'T0009' }),
      )
      .finally(() => {
        if (j.released && j.out.size === 0) o.raise('worker.empty', { app: o.app, worker: j.id })
        hub.pump()
      })
  }

  const take = (frame: Frame): void => {
    // A frame that is no text, or one past `taskSize`, closes the link: an engine never sends such a frame.
    if (typeof frame !== 'string' || frame.length > storedLimit(o.description, 'taskSize')) {
      link.close()
      return
    }
    const message = messageOf(frame)
    // What arrives after the app was closed is taken no more: its data is closed.
    if (!message || o.closed) {
      link.close()
      return
    }
    const now = o.clock.now()
    if (joined) joined.heard = now
    if (message.t === 'here') {
      const kinds = textsOf(message.kinds)
      const id = String(message.id ?? '')
      const atOnce = typeof message.atOnce === 'number' ? message.atOnce : 1
      const stated = Object.keys(Object(o.description.project.workers))
      const engine = String(message.engine ?? '')
      // A worker of another major version, of a kind that the project or its key does not hold, or one that asks for more than its key allows, is not taken.
      if (
        engine.split('.')[0] !== major ||
        !kinds.length ||
        kinds.some((kind) => kind !== 'any' && !stated.includes(kind)) ||
        (key.kinds && kinds.some((kind) => !key.kinds?.includes(kind))) ||
        (key.atOnce !== undefined && atOnce > key.atOnce) ||
        [...hub.all.values()].filter((one) => one.joined && one.key.id === key.id && one.id !== id).length >=
          key.workers
      ) {
        no('T5109')
        return
      }
      const before = hub.joinedOf(id)
      // A second worker under the id of one whose link is alive is a folder that was copied: it makes itself a new id.
      if (before?.joined && before.link !== link && now - before.heard <= workTimes(o).beat) {
        tell(link, { t: 'other-id' })
        return
      }
      if (before && before.link !== link) before.link.close()
      const j: Joined = {
        id,
        kinds,
        atOnce,
        key,
        link,
        engine,
        ready: new Set(),
        loaded: [],
        out: before?.out ?? new TasksOut(o.clock, (gone) => taskLeft(o, gone)),
        released: before?.released === true || message.released === true,
        heard: now,
        alive: now,
        since: now,
        freeSince: now,
        joined: true,
        open: true,
        inARow: before?.inARow ?? { failed: 0, lost: 0 },
        stopping: new Set(),
      }
      joined = j
      // The time in which it holds no task is counted as its machine stands: idle, or not yet ready.
      j.out.free = (ms) => freeTime(o, j, ms)
      const named = new Set(
        (Array.isArray(message.working) ? message.working : []).map((one) => String(Object(one).task)),
      )
      // What its program held when it was started again, and holds no more.
      const lost = new Map(
        (Array.isArray(message.lost) ? message.lost : []).map((one) => [
          String(Object(one).task),
          Object(one).cause === 'memory',
        ]),
      )
      // The tasks that were out to it when this writer opened, and that it still works on or lost, are its again.
      for (const out of hub.claim(id, new Set([...named, ...lost.keys()]))) j.out.set(out.task, out)
      const resend: object[] = []
      for (const out of [...j.out.values()]) {
        if (named.has(out.task)) continue
        // A `work` that was sent and that nothing of the worker ever named never arrived: it is sent again, as it was.
        if (!lost.has(out.task) && out.sent && !out.seen && !out.started && out.work) {
          resend.push(out.work)
          continue
        }
        j.out.delete(out.task)
        freePlaces(o, out.task)
        const memory = lost.get(out.task)
        const ended: Ended =
          memory === undefined
            ? { lost: 'said' }
            : memory
              ? {
                  failed: new TentError('T5110', 'The system of the worker ended the work for want of memory.', {
                    fix: 'Give the work a kind of worker with more memory, with `next` after `memory`.',
                  }),
                  cause: 'memory',
                }
              : { lost: 'silent', beside: lost.size > 1 }
        if (!('failed' in ended)) j.inARow = { ...j.inARow, lost: j.inARow.lost + 1 }
        void hub
          .runnerEnded(
            out.task,
            out.steps.map(() => ended),
          )
          .catch(() => undefined)
      }
      const { beat, behind, dial } = workTimes(o)
      tell(link, {
        t: 'go',
        mode: o.mode,
        epoch: o.machine.at().epoch,
        beat,
        behind,
        dial,
        still: [...j.out.keys()],
        ...(j.released ? { released: true } : {}),
      })
      tellMachines(j)
      void import('../copy/versions.ts').then(({ versionsTold }) =>
        tell(link, {
          t: 'versions',
          list: versionsTold(o).map((one) => ({ version: one.version, running: one.running, files: one.files })),
        }),
      )
      for (const work of resend) tell(link, work)
      hub.join(j)
      return
    }
    const j = joined
    if (!j) {
      link.close()
      return
    }
    if (pastMinute(o, minute, link, message)) return
    switch (message.t) {
      case 'ready':
        j.out.advance()
        j.ready.add(String(message.version))
        hub.pump()
        return
      case 'loaded':
        j.loaded = textsOf(message.names)
        return
      case 'alive': {
        // A worker whose key was removed is let go alone, and its tasks are lost to it at once.
        if (keyGone(o, key)) {
          hub.left(j, 'silent')
          link.close()
          return
        }
        j.alive = now
        if (!j.joined) {
          j.out.advance()
          j.joined = true
          o.raise('worker.joined', { app: o.app, worker: j.id, kinds: j.kinds })
        }
        for (const task of textsOf(message.tasks)) {
          const out = j.out.get(task)
          if (out) out.seen = true
        }
        const stop = textsOf(message.tasks).filter((task) => !j.out.has(task))
        for (const task of j.stopping) if (!stop.includes(task)) stop.push(task)
        j.stopping.clear()
        tell(link, { t: 'alive', epoch: o.machine.at().epoch, stop })
        tellMachines(j)
        hub.pump()
        return
      }
      case 'started': {
        const out = j.out.get(String(message.task))
        if (!out) return
        out.started = true
        hub.runnerStarted(out.task)
        return
      }
      case 'done': {
        j.inARow = { failed: 0, lost: 0 }
        const out = j.out.get(String(message.task))
        if (out && typeof message.cpuMs === 'number') out.cpuMs = message.cpuMs
        const batch = out?.work !== undefined && Reflect.get(Object(Reflect.get(out.work, 'task')), 'batch') === true
        // A batch is answered an answer for each entry: what it ended with, or the error of that entry alone.
        const ends = (value: unknown): Ended[] =>
          batch && Array.isArray(value)
            ? value.map((one) =>
                Object(one).ok === true ? { done: Object(one).value } : { failed: errorOf(Object(one).error) },
              )
            : [{ done: value }]
        if (out && message.file !== undefined) {
          // A result past `inFrame` was posted with `carry`: it is read back, and its file removed.
          void carried(o, out, message.file).then(
            (result) => end(message.task, 'done', ends(result)),
            (error: unknown) =>
              tell(link, {
                t: 'refused',
                task: String(message.task),
                what: 'done',
                code: error instanceof TentError ? error.code : 'T0009',
              }),
          )
          return
        }
        end(message.task, 'done', ends(batch ? message.results : message.result))
        return
      }
      case 'failed': {
        j.inARow = { ...j.inARow, failed: j.inARow.failed + 1 }
        const out = j.out.get(String(message.task))
        if (out && typeof message.cpuMs === 'number') out.cpuMs = message.cpuMs
        end(message.task, 'failed', [
          { failed: errorOf(message.error), ...(message.cause === 'memory' ? { cause: 'memory' as const } : {}) },
        ])
        return
      }
      case 'back':
        for (const task of textsOf(message.tasks)) {
          const out = j.out.get(task)
          // The processor time of a task that is handed back is reported by its id.
          const cpu: unknown = Reflect.get(Object(message.cpuMs), task)
          if (out && typeof cpu === 'number') out.cpuMs = cpu
          if (outTo(task)) j.inARow = { ...j.inARow, lost: j.inARow.lost + 1 }
          end(task, 'back', [{ lost: 'said' }])
        }
        return
      case 'progress': {
        const id = String(message.task)
        if (!outTo(id)) {
          tell(link, { t: 'refused', task: id, what: 'progress', n: message.n, code: 'T5108' })
          return
        }
        // A progress may name the files that its task posted, and those its caller may download: any other is T2104.
        const out = j.out.get(id)
        const run = out?.steps[0] ? o.flows?.runner.read(out.steps[0].run) : undefined
        if (out && run && !holdsFiles(o, out, hub.callerOfRun(run), textsOf(message.files))) {
          tell(link, { t: 'refused', task: id, what: 'progress', n: message.n, code: 'T2104' })
          return
        }
        const kept = out && run ? keptOfTask(o, out, run.id, message.value) : undefined
        // A progress that the runner does not take, as of a task that is out no more, is refused with its code.
        void hub
          .runnerProgress(id, { value: kept?.value ?? message.value, files: textsOf(message.files) })
          .then(() => settledNow(o))
          .then(
            () => tell(link, { t: 'saved', task: id, what: 'progress', n: message.n }),
            (error: unknown) => {
              if (out && kept) keptUndone(o, out, kept)
              tell(link, {
                t: 'refused',
                task: id,
                what: 'progress',
                n: message.n,
                code: error instanceof TentError ? error.code : failureOf(o, 'a progress of work', error).code,
              })
            },
          )
        return
      }
      case 'log': {
        // The lines that the work of a task wrote, under the definition and the run of that task; a line that names
        // no task is the worker's own, as a version it could not take away, and is written under its id.
        const id = message.task === undefined ? undefined : String(message.task)
        const out = id === undefined ? undefined : j.out.get(id)
        if (id !== undefined && !out) {
          tell(link, { t: 'refused', task: id, what: 'log', code: 'T5108' })
          return
        }
        const [first] = out?.steps ?? []
        const run = first ? o.flows?.runner.read(first.run) : undefined
        for (const line of Array.isArray(message.lines) ? message.lines.slice(0, 1000) : []) {
          const held = Object(line)
          o.log.write('lines', {
            at: typeof held.at === 'number' ? held.at : now,
            level: ['info', 'warn', 'error'].includes(held.level) ? held.level : 'info',
            message: String(held.message ?? '').slice(0, 10_000),
            ...(id === undefined
              ? { data: JSON.stringify({ worker: j.id }) }
              : held.data === undefined
                ? {}
                : { data: JSON.stringify(held.data).slice(0, 10_000) }),
            ...(run ? { name: run.flow, run: run.id } : {}),
          })
        }
        return
      }
      case 'spans':
        // The spans that the work of the tasks made on the worker, kept in this log under the worker's id.
        spansFrom(o, j.id, message)
        return
      case 'going':
        j.going = now + Number(message.within ?? 0)
        o.raise('worker.going', { app: o.app, worker: j.id, within: Number(message.within ?? 0) })
        return
      case 'call':
        hub.answer(j, link, message)
        return
      default:
        // A message that the table does not give to a worker closes the link.
        link.close()
    }
  }
  link.each(take, () => {
    if (joined && hub.joinedOf(joined.id)?.link === link) hub.left(joined, 'closed')
  })
}
