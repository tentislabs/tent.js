import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { later, TentError } from '../../core/index.ts'
import type { Clock } from '../../core/internal.ts'
import { rowIds } from '../../data/index.ts'
import type { Frame, Link } from '../copy/link.ts'
import { messageOf, tell } from '../copy/link.ts'
import type { Reach, Reached } from '../copy/reach.ts'
import { reachedBy } from '../copy/reach.ts'
import type { ToldVersion } from '../copy/versions.ts'
import { storedLimit } from '../limits.ts'
import type { Makers } from '../makers.ts'
import type { Opened } from '../opened.ts'
import { wireError } from '../wire.ts'
import { bytesOf } from '../words.ts'
import { carryBatch } from './carryBatch.ts'
import { carryTask, HandBack } from './carryTask.ts'
import { fetchedIn } from './fetched.ts'
import { loadedOn } from './loadedOn.ts'
import { gatheredLog } from './logLines.ts'
import { memoryKills } from './memoryKills.ts'
import type { Remote } from './remote.ts'
import { outsideOf, remoteOf } from './remote.ts'
import { servedOn } from './served.ts'
import { sayingOf } from './saying.ts'
import type { Provider } from '../../ai/index.ts'
import { keepProviders } from '../ai/opening.ts'
import { threadShares } from './threadShares.ts'
import { workerFiles } from './workerFiles.ts'
import { valuesOf } from '../values/ofApp.ts'
import { scrubbed } from '../values/scrub.ts'
import { placeOfSent, workPlaced } from './placed.ts'
import { readParent } from '../trace/ids.ts'
import { spansAway } from '../trace/keeping.ts'
import { spanned } from '../trace/span.ts'

/** What `engine.work` takes. */
export interface WorkOptions {
  from: string
  key: string
  kinds: string[]
  folder: string
  atOnce?: number
  load?: string[]
  fetched?: string
  insecure?: boolean
  reach?: Reach
  // Counts the programs that the system ended for want of memory in this program's group, where it can be known.
  memory?: () => number | undefined
}

/** A worker as `engine.work` answers it. */
export interface Worker {
  at(): {
    id: string
    joined: boolean
    writer?: string
    epoch?: string
    kinds: string[]
    atOnce: number
    working: { task: string; run: string; step: string; repeat: number; try: number; since: number }[]
    loaded: string[]
    going?: number
    released?: true
    folder: { fetched: number; disk: number }
  }
  going(o: { within: string }): void
  close(o?: { now?: boolean }): Promise<void>
}

/** A task that a worker holds: what it was handed, what ends its work, and the end it keeps until the writer saved it. */
interface Held {
  task: Record<string, unknown>
  abort: AbortController
  since: number
  ended?: object
  // How many progresses the work kept, and each that the writer did not save yet, by its `n`.
  progressed: number
  unsaved: Map<number, object>
}

/** The engine of this program, by the major version that a writer holds it to. */
const engine = '1.0.0'

/** Reads the file of a worker's folder that holds its id, the newest epoch it was told, and whether it was released. */
function ownFile(folder: string): { id: string; epoch?: string; released?: true } {
  const file = join(folder, 'worker.json')
  try {
    const held = Object(JSON.parse(readFileSync(file, 'utf8')))
    if (typeof held.id === 'string' && held.id.length === 26) return held
  } catch {
    // A folder that holds no such file is new: the worker makes its id now.
  }
  const made = { id: rowIds.next() }
  writeFileSync(file, JSON.stringify(made))
  return made
}

/**
 * Reads `held.json` of a worker's folder: the tasks that its program held when it last stopped, and the count of
 * programs ended for want of memory that it kept then.
 */
function heldBefore(folder: string): { tasks: string[]; memory?: number } {
  try {
    const held: unknown = JSON.parse(readFileSync(join(folder, 'held.json'), 'utf8'))
    const tasks: unknown = Reflect.get(Object(held), 'tasks')
    const memory: unknown = Reflect.get(Object(held), 'memory')
    return {
      tasks: Array.isArray(tasks) ? tasks.map(String) : [],
      ...(typeof memory === 'number' ? { memory } : {}),
    }
  } catch {
    return { tasks: [] }
  }
}

/**
 * The lines of the log of a task with the secrets of this worker's own machine taken out, as the engine takes its
 * own out of every line: its writer knows none of them, so the worker does it before a line leaves.
 */
function ownSecretsOut<Line extends { message: string; data?: unknown }>(served: Opened, lines: Line[]): Line[] {
  const forms = valuesOf(served).forms()
  if (!forms.length) return lines
  return lines.map((line) => {
    const data = line.data === undefined ? undefined : JSON.parse(scrubbed(JSON.stringify(line.data), forms))
    return { ...line, message: scrubbed(line.message, forms), ...(data === undefined ? {} : { data }) }
  })
}

/**
 * Takes what `engine.work` takes, the clock of the program, the mode, its providers and its maker of a room.
 * Answers a worker: it dials its writer, joins with
 * its kinds, fetches and loads every version it is told, and carries out each task it is handed, saying that it
 * is alive every beat and keeping the end of each task until the writer saved it.
 */
export async function startWorker(
  o: WorkOptions,
  clock: Clock,
  mode: Opened['mode'] = 'live',
  providers: Record<string, Provider> = {},
  room?: Makers['room'],
): Promise<Worker> {
  mkdirSync(o.folder, { recursive: true })
  const own = ownFile(o.folder)
  const reached: (address: string) => Reached = reachedBy(o.reach, o.insecure === true)
  const atOnce = o.atOnce ?? 1
  const held = new Map<string, Held>()
  const threads = threadShares()
  // The tasks that the program held when it last stopped, which it holds no more: named in `lost` until a writer took it.
  const before = heldBefore(o.folder)
  const memoryOf = o.memory ?? memoryKills
  const memory = memoryOf()
  // Where the count of programs ended for want of memory rose since `held.json` was kept, that is what ended it.
  const cause =
    memory !== undefined && before.memory !== undefined && memory > before.memory ? { cause: 'memory' as const } : {}
  let lost = before.tasks
  /** Writes the ids of the tasks it holds, so that a program started again names those it lost. */
  const keepHeld = (): void => {
    const now = memoryOf()
    writeFileSync(
      join(o.folder, 'held.json'),
      JSON.stringify({ tasks: [...held.keys(), ...lost], ...(now === undefined ? {} : { memory: now }) }),
    )
  }
  const versions = new Map<string, Promise<Opened>>()
  const ready = new Set<string>()
  const python = loadedOn(o.kinds, o.load ?? [], (message) => send(message))
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: unknown): void; message: object }>()
  let link: Link | undefined
  let joined = false
  let closed = false
  let released = own.released === true
  let epoch = own.epoch
  let beat = 1000
  let wait = 0
  let going: number | undefined
  let appMode = mode
  let cancelAlive: (() => void) | undefined
  let cancelDial: (() => void) | undefined
  // The addresses it dials, in order: its `from`, and then those its writer last named in `machines`.
  let owns: string[] = []
  let at = 0
  const writer = (): string => [o.from, ...owns][at % (owns.length + 1)]
  /** Whether an epoch is older than the newest one this worker was told: its writer was taken over. */
  const older = (told: unknown): boolean =>
    typeof told === 'string' && epoch !== undefined && Number(told.split('.')[0]) < Number(epoch.split('.')[0])

  const save = (): void =>
    writeFileSync(
      join(o.folder, 'worker.json'),
      JSON.stringify({ id: own.id, ...(epoch ? { epoch } : {}), ...(released ? { released: true } : {}) }),
    )
  const send = (message: object): void => {
    if (link && joined) tell(link, message)
  }
  const headers = { authorization: `Bearer ${o.key}` }
  // The files of tasks it fetched are kept in `fetched/`, held to its size, but those that a task at work names.
  const named = (): Set<string> => {
    const found = new Set<string>()
    for (const one of held.values())
      for (const value of Object.values(Object(one.task.rows))) {
        const file: unknown = Reflect.get(Object(value), 'file')
        if (typeof file === 'string') found.add(file)
      }
    return found
  }
  const fetched = fetchedIn(o.folder, bytesOf('fetched', o.fetched, 10 * 1024 ** 3), named)
  const files = workerFiles(reached, writer, o.key, fetched)

  /** Fetches the files of a version that the writer told, and loads its code. */
  const versionOf = (told: ToldVersion): Promise<Opened> => {
    const loading = versions.get(told.version)
    if (loading) return loading
    const made = (async () => {
      const { fetchVersion } = await import('../copy/versions.ts')
      await fetchVersion(o.folder, told, async (fingerprint) => {
        const from = writer()
        const answer = await reached(from).request(new Request(`${from}/_t/work/blob/${fingerprint}`, { headers }))
        if (!answer.ok) throw new TentError('T0011', `The writer did not give the file ${fingerprint}.`)
        return new Uint8Array(await answer.arrayBuffer())
      })
      const served = await servedOn(o.folder, told.version, clock, appMode, room)
      keepProviders(served, providers)
      return served
    })()
    versions.set(told.version, made)
    made.catch(() => versions.delete(told.version))
    return made
  }

  /** Carries one task out, and keeps its end until the writer saved it. */
  const carry = async (task: Record<string, unknown>): Promise<void> => {
    const id = String(task.id)
    const one: Held = { task, abort: new AbortController(), since: clock.now(), progressed: 0, unsaved: new Map() }
    held.set(id, one)
    keepHeld()
    let served: Opened
    try {
      const told = versions.get(String(task.version))
      if (!told) throw new TentError('T0011', `This worker does not hold the version ${String(task.version)}.`)
      served = await told
    } catch (error) {
      one.ended = { t: 'failed', task: id, error: wireError(error, true).error, cpuMs: 0 }
      send(one.ended)
      return
    }
    // The rows that travelled as files are fetched before the work begins.
    let handed: Record<string, unknown>
    try {
      handed = { ...task, rows: await files.rows(task) }
    } catch (error) {
      one.ended = { t: 'failed', task: id, error: wireError(error, true).error, cpuMs: 0 }
      send(one.ended)
      return
    }
    // The definition of a `python` is loaded before the work begins: its loading counts on no try.
    try {
      await python.before(served, task)
    } catch (error) {
      one.ended = { t: 'failed', task: id, error: wireError(error, true, { command: true }).error, cpuMs: 0 }
      send(one.ended)
      return
    }
    send({ t: 'started', task: id })
    // What reaches the writer for the task, and for one entry of a batch, whose calls name that entry.
    const logged = gatheredLog(
      clock,
      () => beat,
      (lines) => send({ t: 'log', task: id, lines: ownSecretsOut(served, lines) }),
    )
    const remoteFor = (entry = -1): Remote =>
      remoteOf(
        (message) => {
          const callId = rowIds.next()
          return new Promise((resolve, reject) => {
            const full = { t: 'call', id: callId, task: id, ...(entry >= 0 ? { entry } : {}), ...message }
            pending.set(callId, { resolve, reject, message: full })
            send(full)
          })
        },
        logged.handle,
        outsideOf(served, String(task.kind)),
        files.of(id),
      )
    const remote = remoteFor()
    // The thread's time is shared among the tasks at work on it: its share is read once, at the end of the work.
    threads.begin(id)
    let spent: number | undefined
    const cpuMs = (): number => {
      spent ??= threads.end(id)
      return spent
    }
    // What the work says crosses as a call of its own, which the writer answers not: held to its rate here.
    const saying = sayingOf(
      (value) => send({ t: 'call', id: rowIds.next(), task: id, what: 'say', value }),
      storedLimit(served.description, 'saidPerSecond'),
      storedLimit(served.description, 'inFrame'),
    )
    const machine = {
      stopping: () => going !== undefined || one.abort.signal.aborted,
      // Each progress is counted for its task, and kept until the writer saved it: a new link is sent it again.
      progress: (value: unknown) => {
        one.progressed += 1
        const message = { t: 'progress', task: id, n: one.progressed, value, files: [] }
        one.unsaved.set(one.progressed, message)
        send(message)
      },
      say: (value: unknown) => saying.say(value),
    }
    try {
      if (task.batch === true) {
        const results = await carryBatch(served, handed, remoteFor, one.abort.signal, machine)
        if (one.abort.signal.aborted) return
        const large = JSON.stringify(results).length > storedLimit(served.description, 'inFrame')
        one.ended = large
          ? { t: 'done', task: id, file: await files.carry(id, results), cpuMs: cpuMs() }
          : { t: 'done', task: id, results, cpuMs: cpuMs() }
        logged.flush()
        saying.flush()
        send(one.ended)
        return
      }
      // The task is a span of the trace of the step it carries out, and its spans go to the writer.
      spansAway(served, (rows) => send({ t: 'spans', rows }))
      const under = readParent(String(task.traceparent ?? ''))
      const result = await spanned(
        served,
        {
          name: String(task.flow ?? task.definition ?? 'task'),
          kind: 'task',
          facts: { kind: String(task.kind) },
          ...(under ? { under } : {}),
        },
        () => carryTask(served, handed, remote, one.abort.signal, machine),
      )
      if (one.abort.signal.aborted) return
      // A result past `inFrame` is posted as a file with `carry`, and its id stands in the frame.
      const large = JSON.stringify(result ?? null).length > storedLimit(served.description, 'inFrame')
      one.ended = large
        ? { t: 'done', task: id, file: await files.carry(id, result), cpuMs: cpuMs() }
        : { t: 'done', task: id, result, cpuMs: cpuMs() }
    } catch (error) {
      if (one.abort.signal.aborted) return
      one.ended =
        error instanceof HandBack
          ? { t: 'back', tasks: [id], cpuMs: { [id]: cpuMs() } }
          : {
              t: 'failed',
              task: id,
              error: workPlaced(error, wireError(error, true, { command: true }).error),
              cpuMs: cpuMs(),
            }
    } finally {
      // Work that was ended from outside is booked its share too, and holds no place among those at work.
      cpuMs()
    }
    logged.flush()
    saying.flush()
    send(one.ended)
  }

  const alive = (): void => {
    cancelAlive = undefined
    if (closed || !joined) return
    send({ t: 'alive', tasks: [...held.keys()] })
    cancelAlive = clock.setTimer(clock.now() + beat, alive)
  }

  /**
   * Takes away each version that the writer no longer lists and that no task at work needs: what its code started,
   * its room and its files. A version that a task needs goes with a later list.
   */
  const unlisted = async (listed: Set<string>): Promise<void> => {
    const needed = new Set([...held.values()].map((one) => String(one.task.version)))
    const folder = join(o.folder, 'versions')
    for (const version of new Set([...versions.keys(), ...(existsSync(folder) ? readdirSync(folder) : [])])) {
      if (listed.has(version) || needed.has(version)) continue
      const loading = versions.get(version)
      versions.delete(version)
      ready.delete(version)
      const served = await loading?.catch(() => undefined)
      for (const one of served?.before ?? []) one.close()
      await served?.room.close()
      const { versionFolder } = await import('../copy/versions.ts')
      rmSync(versionFolder(o.folder, version), { recursive: true, force: true, maxRetries: 10, retryDelay: 20 })
    }
  }

  const take = (frame: Frame): void => {
    if (typeof frame !== 'string') return
    const message = messageOf(frame)
    if (!message || !link) return
    switch (message.t) {
      case 'go': {
        // A writer of an older epoch than one this worker was told is left: another machine took over.
        if (older(message.epoch)) {
          link.close()
          return
        }
        joined = true
        wait = 0
        // The writer took what was lost with the program before.
        lost = []
        keepHeld()
        beat = typeof message.beat === 'number' && message.beat > 0 ? message.beat : beat
        if (typeof message.mode === 'string' && ['development', 'test', 'live'].includes(message.mode))
          appMode = message.mode === 'live' ? 'live' : message.mode === 'test' ? 'test' : 'development'
        epoch = typeof message.epoch === 'string' ? message.epoch : epoch
        if (message.released === true) released = true
        save()
        const still = new Set(Array.isArray(message.still) ? message.still.map(String) : [])
        // The work of a task that the writer holds out to this worker no more is ended; the end of one that it does is sent again.
        for (const [id, one] of held) {
          if (!still.has(id)) {
            one.abort.abort()
            held.delete(id)
            continue
          }
          for (const progress of one.unsaved.values()) send(progress)
          if (one.ended) send(one.ended)
        }
        keepHeld()
        for (const version of ready) send({ t: 'ready', version })
        python.resend()
        for (const { message: call } of pending.values()) send(call)
        if (going !== undefined) send({ t: 'going', within: Math.max(0, going - clock.now()) })
        cancelAlive?.()
        cancelAlive = clock.setTimer(clock.now() + beat, alive)
        return
      }
      case 'no':
      case 'other-id':
        if (message.t === 'other-id') {
          own.id = rowIds.next()
          save()
          tell(link, here())
          return
        }
        // An address that a `no` names is not followed: the closing leaves this address for the next of its own.
        joined = false
        link.close()
        return
      case 'machines':
        owns = Array.isArray(message.own) ? message.own.map(String) : []
        return
      case 'versions':
        // A folder that a program of the version still holds, as Windows keeps one, is refused: the next list tries it again.
        unlisted(new Set((Array.isArray(message.list) ? message.list : []).map((one) => String(one.version)))).catch(
          (error: unknown) =>
            send({
              t: 'log',
              lines: [
                {
                  at: clock.now(),
                  level: 'warn',
                  message: `A version that the writer lists no more was not taken away: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
            }),
        )
        for (const told of Array.isArray(message.list) ? message.list : [])
          void versionOf(told)
            // A version is loadable once the environments of its `python` definitions stand, with those named loaded.
            .then((served) => python.ready(served))
            .then(
              () => {
                ready.add(String(told.version))
                send({ t: 'ready', version: told.version })
              },
              () => undefined,
            )
        return
      case 'work':
        if (typeof message.task === 'object' && message.task !== null) void carry(Object(message.task))
        return
      case 'alive':
        if (older(message.epoch)) {
          at += 1
          link.close()
          return
        }
        for (const id of Array.isArray(message.stop) ? message.stop.map(String) : []) {
          held.get(id)?.abort.abort()
          held.delete(id)
        }
        keepHeld()
        return
      case 'saved':
      case 'refused':
        // An end that was refused for the count of a minute is sent again a beat later, and kept until it is saved.
        if (message.t === 'refused' && message.code === 'T0005') {
          const one = held.get(String(message.task))
          const again = message.what === 'progress' ? one?.unsaved.get(Number(message.n)) : one?.ended
          if (again) clock.setTimer(clock.now() + beat, () => send(again))
          return
        }
        if (message.t === 'refused' && message.code === 'T5108') held.get(String(message.task))?.abort.abort()
        // A progress that was saved, or refused for good, is sent again no more.
        if (message.what === 'progress') held.get(String(message.task))?.unsaved.delete(Number(message.n))
        if (message.what !== 'progress' || (message.t === 'refused' && message.code === 'T5108')) {
          held.delete(String(message.task))
          keepHeld()
        }
        return
      case 'release':
        released = true
        save()
        return
      case 'gone':
        fetched.drop(Array.isArray(message.files) ? message.files.map(String) : [])
        return
      case 'answer': {
        const call = pending.get(String(message.id))
        if (!call) return
        pending.delete(String(message.id))
        // An answer past `inFrame` stands in a file of the writer, which is fetched for the task of the call.
        if (message.ok === true && typeof message.file === 'string')
          void files.value(String(Object(call.message).task), message.file).then(call.resolve, call.reject)
        else if (message.ok === true) call.resolve(message.value ?? undefined)
        else {
          const error = Object(message.error)
          // A call that nobody agreed to is refused with its place, which makes the step wait for the person.
          const place = placeOfSent(error)
          call.reject(
            new TentError(
              String(error.code ?? 'T0009'),
              String(error.message ?? 'The writer refused the call.'),
              place ? { place } : {},
            ),
          )
        }
        return
      }
    }
  }

  const here = (): object => ({
    t: 'here',
    id: own.id,
    kinds: o.kinds,
    atOnce,
    engine,
    ...(epoch ? { epoch } : {}),
    working: [...held.keys()].map((task) => ({ task, run: String(held.get(task)?.task.run) })),
    lost: lost.map((task) => ({ task, ...cause })),
    ...(released ? { released: true } : {}),
  })

  /** Dials the writer: every beat while a task is held, and else after a wait that is drawn and doubles. */
  const dial = (): void => {
    cancelDial = undefined
    if (closed || link) return
    let opened: Link
    try {
      opened = reached(writer()).link(new Request(`${writer()}/_t/work`, { headers }))
    } catch {
      at += 1
      again()
      return
    }
    link = opened
    opened.each(take, () => {
      if (link === opened) {
        // A link that closed before it was taken leaves this address for the next.
        if (!joined) at += 1
        link = undefined
        joined = false
        cancelAlive?.()
        cancelAlive = undefined
      }
      again()
    })
    tell(opened, here())
  }
  const again = (): void => {
    if (closed) return
    cancelDial?.()
    wait = held.size ? beat : wait === 0 ? 500 + Math.floor(Math.random() * 1000) : Math.min(wait * 2, 30_000)
    cancelDial = clock.setTimer(clock.now() + wait, dial)
  }
  dial()

  return {
    at: () => ({
      id: own.id,
      joined,
      writer: writer(),
      ...(epoch ? { epoch } : {}),
      kinds: o.kinds,
      atOnce,
      working: [...held.entries()].map(([task, one]) => ({
        task,
        run: String(one.task.run ?? Object(Array.isArray(one.task.entries) ? one.task.entries[0] : {}).run),
        step: String(one.task.step ?? 'call'),
        repeat: Number(one.task.repeat),
        try: Number(one.task.try),
        since: one.since,
      })),
      loaded: python.names(),
      ...(going === undefined ? {} : { going }),
      ...(released ? { released: true as const } : {}),
      folder: { fetched: fetched.size(), disk: existsSync(join(o.folder, 'disk')) ? 1 : 0 },
    }),
    going({ within }) {
      going = clock.now() + later(new Date(0), within).getTime()
      send({ t: 'going', within: going - clock.now() })
    },
    async close(how = {}) {
      closed = true
      cancelDial?.()
      cancelAlive?.()
      // Without `now` the tasks under way end first; with it they are handed back.
      if (how.now) send({ t: 'back', tasks: [...held.keys()], cpuMs: {} })
      for (const one of held.values()) one.abort.abort()
      link?.close()
      // What the code of a version started beside its tasks, as its Python programs, ends with the worker, and so
      // does the room that holds its code, as every made thing.
      for (const loading of versions.values()) {
        const served = await loading.catch(() => undefined)
        for (const one of served?.before ?? []) one.close()
        await served?.room.close()
      }
    },
  }
}
