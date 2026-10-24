import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { RunView, Told } from '../../flows/index.ts'
import type { RunsReading } from '../ai/working.ts'
import { asksOf, isAgentRun, toolOfStep } from '../ai/working.ts'
import { writingOf } from '../ai/told.ts'
import { saidOf } from '../flows/said.ts'
import { usedOf } from '../counts/perRun.ts'
import { failureOf } from '../door/failure.ts'
import type { Opened } from '../opened.ts'
import { wireError } from '../wire.ts'
import { mayFollow } from '../flows/follow.ts'
import type { Connected } from './held.ts'
import { storedLimit } from '../limits.ts'

/** What a page asks for with a `run-watch`: its own name for the watch, and the run. */
interface RunWatching {
  id: string
  run: string
}

/** One page that follows one run. */
interface Following {
  id: string
  on: Connected
  run: string
}

/** What the hub does for the runs that pages follow. */
export interface Runs {
  /** Takes a `run-watch` of a connection: sends where the run stands, or `failed` with T0001. */
  watch(c: Connected, asked: RunWatching, caller: Caller): void
  /** Takes a watch away, where the connection follows a run under that id. */
  leave(c: Connected, id: string): boolean
  /** Takes every watch of a connection that closed. */
  closed(c: Connected): void
  /** Is told what the runner tells of a run. */
  told(what: Told): void
  /** Is told a part that the driver of a run tells: text, reasoning, or a step made again. */
  part(run: string, part: Record<string, unknown>): void
  close(): void
}

const ended = (state: string): boolean => state === 'done' || state === 'failed' || state === 'stopped'

/**
 * Takes an app, what sends a connection one message, and what builds the caller of a connection as they are now.
 * Answers what the hub does for the runs that pages follow: the checks of who may follow a run, made when the
 * watch opens and each time a step of the run ends, the message that says where the run stands, and its parts.
 */
export function runsOf(
  o: Opened,
  tell: (c: Connected, text: string) => void,
  callerOf: (c: Connected) => Caller,
): Runs {
  const following = new Map<string, Set<Following>>()
  // The asks that wait in each run, and the steps of each run that began, so that what follows is told rightly.
  const waiting = new Map<string, Set<string>>()
  const began = new Map<string, Set<string>>()
  // The text that waits to be sent, by run and step, and the timers that send it.
  // A part that begins anew says so, however much was added to it before it was sent.
  const pending = new Map<string, { step: string; kind: string; text: string; anew?: true }>()
  const timers = new Map<string, NodeJS.Timeout>()
  const sentAt = new Map<string, number>()
  // On a reader the runs are read from its own data.
  const runner = (): RunsReading | undefined => o.flows?.runner ?? o.runsRead
  // The runs that were told to those who follow the run above them, once each.
  const announced = new Set<string>()

  /** Sends one message to every page that follows a run, and to those of the runs above it where `up` says so. */
  function send(run: string, message: (id: string) => string, up = false): void {
    const r = runner()
    for (let at: string | undefined = run; at; at = up ? r?.read(at)?.parent : undefined)
      for (const one of following.get(at) ?? []) tell(one.on, message(one.id))
  }

  const partOf = (id: string, part: Record<string, unknown>): string => JSON.stringify({ t: 'run-part', id, ...part })

  /** The steps of a run as a run message holds them: with the tool of a `tool` step and the runs each step called. */
  function stepsOf(run: RunView): Record<string, unknown>[] {
    const called = runner()?.find({ top: run.top }) ?? []
    return run.steps.map((step) => {
      const tool = toolOfStep(step.name)
      const runs = called
        .filter(
          (one) => one.parent === run.id && one.parentStep?.name === step.name && one.parentStep.repeat === step.repeat,
        )
        .map((one) => one.id)
      return {
        name: step.name,
        repeat: step.repeat,
        ...(tool ? { tool } : {}),
        state: step.state,
        ...(step.ms === undefined ? {} : { ms: step.ms }),
        ...(runs.length ? { runs } : {}),
      }
    })
  }

  /**
   * The flow or the action of a run whose definition a call of `{ run, stop: true }` stops it by: a flow that is
   * offered to callers, and an action that is a run of its own. Nothing for any other.
   */
  function stoppedBy(run: RunView): string | undefined {
    const { flows, functions } = o.description
    const flow: unknown = Object.hasOwn(flows, run.flow) ? flows[run.flow] : undefined
    if (flow !== undefined)
      return Reflect.get(Object(flow), 'agent') === undefined && Reflect.get(Object(flow), 'access') !== undefined
        ? run.flow
        : undefined
    const action: Record<string, unknown> = Object(Object.hasOwn(functions, run.flow) ? functions[run.flow] : undefined)
    const heavy = typeof action.worker === 'string' || action.background === true || action.background === 'here'
    return action.kind === 'action' && heavy ? run.flow : undefined
  }

  /** The end of a run as its part tells it: its text, or its answer, with what it used; its error; or that it stopped. */
  function endOf(run: RunView): Record<string, unknown> {
    if (run.state === 'failed')
      return {
        kind: 'failed',
        error: wireError(run.error ?? new TentError('T0009', 'The run failed.'), o.mode !== 'live').error,
      }
    if (run.state === 'stopped') return { kind: 'stopped' }
    const used = usedOf(o, run.id)
    return isAgentRun(o, run)
      ? { kind: 'done', text: String(Reflect.get(Object(run.answer), 'text') ?? ''), used }
      : { kind: 'done', answer: run.answer, used }
  }

  /** Sends the text that waits for a run, at most ten times a second. */
  function flush(key: string, run: string): void {
    timers.delete(key)
    const held = pending.get(key)
    if (!held) return
    pending.delete(key)
    send(run, (id) =>
      partOf(id, { kind: held.kind, step: held.step, text: held.text, ...(held.anew ? { anew: true } : {}) }),
    )
  }

  /**
   * A run was added under the step of another: the step part of that step is sent again to those who follow the
   * run above, with the runs it called, so that a page may follow the new one by itself.
   */
  function announce(run: RunView): void {
    announced.add(run.id)
    const above = run.parent ? runner()?.read(run.parent) : undefined
    const at = run.parentStep
    if (!above || !at) return
    const step = stepsOf(above).find((one) => one.name === at.name && one.repeat === at.repeat)
    if (step) send(above.id, (id) => partOf(id, { kind: 'step', step, used: usedOf(o, above.id) }))
  }

  /** Drops the watches of a run that a caller may no longer follow, each with `failed`. */
  function recheck(run: RunView): void {
    for (const one of [...(following.get(run.id) ?? [])])
      try {
        mayFollow(o, run, callerOf(one.on))
      } catch (error) {
        const { ref } = failureOf(o, 'run-watch', error)
        const seen = wireError(error, o.mode !== 'live', ref ? { ref } : {}).error
        tell(one.on, JSON.stringify({ t: 'failed', id: one.id, error: seen }))
        leave(one.on, one.id)
      }
  }

  function leave(c: Connected, id: string): boolean {
    for (const [run, set] of following)
      for (const one of set)
        if (one.on === c && one.id === id) {
          set.delete(one)
          if (!set.size) following.delete(run)
          return true
        }
    return false
  }

  return {
    watch(c, asked, caller) {
      leave(c, asked.id)
      const run = runner()?.read(asked.run)
      try {
        if (!run) throw new TentError('T0001', `No run ${JSON.stringify(asked.run).slice(0, 80)} is there.`)
        mayFollow(o, run, caller)
      } catch (error) {
        const seen = wireError(error, o.mode !== 'live').error
        tell(c, JSON.stringify({ t: 'failed', id: asked.id, error: seen }))
        return
      }
      const r = runner()
      const writing = writingOf(o, run.id)
      const said = saidOf(o, run.id)
      const top = r?.read(run.top)
      const agent = top && isAgentRun(o, top) ? top.flow : undefined
      tell(
        c,
        JSON.stringify({
          t: 'run',
          id: asked.id,
          state: run.state,
          steps: stepsOf(run),
          asks: r ? asksOf(o, r, run) : [],
          ...(writing?.text ? { text: { step: writing.step, text: writing.text } } : {}),
          ...(writing?.reasoning ? { reasoning: { step: writing.step, text: writing.reasoning } } : {}),
          ...(said.length ? { said } : {}),
          ...(ended(run.state) && !isAgentRun(o, run) ? { answer: run.answer } : {}),
          // A run of an agent that ended holds its answer as its text, and what a caller sees of its failure.
          ...(ended(run.state) && isAgentRun(o, run)
            ? { text: { step: '', text: String(Reflect.get(Object(run.answer), 'text') ?? '') } }
            : {}),
          ...(run.state === 'failed' && run.error ? { error: wireError(run.error, o.mode !== 'live').error } : {}),
          ...(agent ? { agent } : {}),
          ...(!agent && stoppedBy(run) ? { flow: stoppedBy(run) } : {}),
          used: usedOf(o, run.id),
        }),
      )
      const set = following.get(run.id) ?? new Set<Following>()
      following.set(run.id, set)
      set.add({ id: asked.id, on: c, run: run.id })
    },
    leave,
    closed(c) {
      for (const [run, set] of following) {
        for (const one of [...set]) if (one.on === c) set.delete(one)
        if (!set.size) following.delete(run)
      }
    },
    told(what) {
      const r = runner()
      const run = r?.read(what.run)
      if (!r || !run) return
      if (what.kind === 'run') {
        if (!announced.has(run.id) && !ended(what.state)) announce(run)
        if (ended(what.state)) {
          announced.delete(run.id)
          // The text that still waits is sent before the end.
          for (const [key, timer] of [...timers])
            if (key.startsWith(`${run.id}\n`)) {
              clearTimeout(timer)
              flush(key, run.id)
            }
          const end = endOf(run)
          send(run.id, (id) => partOf(id, end))
          waiting.delete(run.id)
          began.delete(run.id)
          // What was kept of the run for its text is let go of with it: nothing grows with the life of the program.
          for (const key of [...sentAt.keys()]) if (key.startsWith(`${run.id}\n`)) sentAt.delete(key)
        } else send(run.id, (id) => partOf(id, { kind: 'state', state: what.state }))
        return
      }
      const key = `${what.name}\n${what.repeat}`
      const asks = waiting.get(run.id) ?? new Set<string>()
      // An ask that waited and waits no more was answered, or its time ran out.
      for (const one of [...asks]) {
        const [step, repeat, n] = one.split('\n')
        if (step !== what.name || repeat !== String(what.repeat) || what.state === 'waiting') continue
        asks.delete(one)
        send(
          run.id,
          (id) => partOf(id, { kind: 'answered', run: run.id, step, repeat: Number(repeat), n: Number(n) }),
          true,
        )
      }
      const seen = began.get(run.id) ?? new Set<string>()
      began.set(run.id, seen)
      // A step that begins once more is made again: what it wrote and said is dropped first.
      if (what.state === 'started' && seen.has(key))
        send(run.id, (id) => partOf(id, { kind: 'again', step: what.name, repeat: what.repeat }))
      if (what.state === 'started') seen.add(key)
      const tool = toolOfStep(what.name)
      const step = {
        name: what.name,
        repeat: what.repeat,
        ...(tool ? { tool } : {}),
        state: what.state,
        ...(what.ms === undefined ? {} : { ms: what.ms }),
        ...(what.runs?.length ? { runs: what.runs } : {}),
      }
      send(run.id, (id) => partOf(id, { kind: 'step', step, used: usedOf(o, run.id) }))
      if (what.state === 'waiting')
        for (const ask of asksOf(o, r, run).filter((one) => one.run === run.id && one.step === what.name)) {
          asks.add(`${ask.step}\n${ask.repeat}\n${ask.n}`)
          waiting.set(run.id, asks)
          send(run.id, (id) => partOf(id, { kind: 'ask', ask }), true)
        }
      if (what.state === 'done' || what.state === 'failed') recheck(run)
    },
    part(run, part) {
      const kind = String(part.kind)
      if (kind === 'text' || kind === 'reasoning') {
        const step = String(part.step ?? '')
        const key = `${run}\n${step}\n${kind}`
        const held = pending.get(key)
        if (part.anew === true) pending.delete(key)
        const anew = part.anew === true || held?.anew === true
        pending.set(key, {
          step,
          kind,
          text: (part.anew === true ? '' : (held?.text ?? '')) + String(part.text ?? ''),
          ...(anew ? { anew: true as const } : {}),
        })
        if (timers.has(key)) return
        // The text that is sent as it grows: `limits.textPerSecond` parts a second at most for one step.
        const every = 1000 / Math.max(1, storedLimit(o.description, 'textPerSecond'))
        const wait = (sentAt.get(key) ?? Number.NEGATIVE_INFINITY) + every - performance.now()
        const sendNow = (): void => {
          flush(key, run)
          sentAt.set(key, performance.now())
        }
        if (wait <= 0) sendNow()
        else timers.set(key, setTimeout(sendNow, wait))
        return
      }
      if (kind === 'again') send(run, (id) => partOf(id, { kind: 'again', step: part.step, repeat: part.repeat ?? 1 }))
      if (kind === 'audio') send(run, (id) => partOf(id, { kind: 'audio', step: part.step, file: part.file }))
      // What a step said comes held to its rate already, by the engine where the work is.
      if (kind === 'said')
        send(run, (id) => partOf(id, { kind: 'said', step: part.step, repeat: part.repeat, value: part.value }))
    },
    close() {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      following.clear()
    },
  }
}
