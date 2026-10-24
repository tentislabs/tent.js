import type { Told } from '../../flows/index.ts'
import { roundSaved, toldPart, writingsOf, writtenAt } from '../ai/told.ts'
import { said, saidTold, sayingsOf } from '../flows/said.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'

/** What the writer holds of the text or the reasoning of one `model` step that waits to cross: where it began, and what was added. */
interface Waiting {
  run: string
  step: string
  kind: 'text' | 'reasoning'
  at: number
  text: string
  timer?: NodeJS.Timeout
}

/**
 * Takes an app that writes and what sends one message to every reader. Answers what is told the parts of its runs:
 * the text and the reasoning of a `model` step as `run-text` and `run-reasoning`, from character `at`, held to
 * `limits.textPerSecond` for each, with `at: 0` where the step began again; what a step said as `run-said`; and
 * a spoken sentence as `run-audio`. `soFar` is what a reader that joins is told of the runs at work.
 */
export function runsOut(o: Opened, send: (message: object) => void) {
  // How much of each step's text and reasoning the readers were told, and what waits to cross.
  const told = new Map<string, number>()
  const waiting = new Map<string, Waiting>()
  const every = (): number => 1000 / Math.max(1, storedLimit(o.description, 'textPerSecond'))
  const flush = (key: string): void => {
    const one = waiting.get(key)
    if (!one) return
    waiting.delete(key)
    if (one.timer) clearTimeout(one.timer)
    send({
      t: one.kind === 'text' ? 'run-text' : 'run-reasoning',
      run: one.run,
      step: one.step,
      at: one.at,
      text: one.text,
    })
  }
  const grow = (run: string, step: string, kind: 'text' | 'reasoning', text: string, anew: boolean): void => {
    const key = `${run}\n${step}\n${kind}`
    if (anew) {
      waiting.delete(key)
      told.set(key, 0)
    }
    const at = told.get(key) ?? 0
    told.set(key, at + text.length)
    const held = waiting.get(key)
    if (held && !anew) {
      held.text += text
      return
    }
    const one: Waiting = { run, step, kind, at, text }
    waiting.set(key, one)
    one.timer = setTimeout(() => flush(key), every())
  }
  return {
    part(run: string, part: Record<string, unknown>): void {
      const step = String(part.step ?? '')
      if (part.kind === 'text') grow(run, step, 'text', String(part.text ?? ''), false)
      else if (part.kind === 'reasoning') grow(run, step, 'reasoning', String(part.text ?? ''), part.anew === true)
      else if (part.kind === 'again') {
        grow(run, step, 'text', '', true)
        grow(run, step, 'reasoning', '', true)
      } else if (part.kind === 'said') send({ t: 'run-said', run, step, repeat: part.repeat, value: part.value })
      else if (part.kind === 'audio') send({ t: 'run-audio', run, step, file: part.file })
    },
    // What waits is sent before what the runner tells, which comes after it. A run that ended is told of no more.
    flush(what?: unknown): void {
      for (const key of [...waiting.keys()]) flush(key)
      const state: unknown = Reflect.get(Object(what), 'state')
      if (Reflect.get(Object(what), 'kind') !== 'run' || !['done', 'failed', 'stopped'].includes(String(state))) return
      const run = String(Reflect.get(Object(what), 'run'))
      for (const key of [...told.keys()]) if (key.startsWith(`${run}\n`)) told.delete(key)
    },
    soFar(): object[] {
      return [
        ...writingsOf(o).flatMap(([run, writing]) => [
          { t: 'run-text', run, step: writing.step, at: 0, text: writing.text },
          { t: 'run-reasoning', run, step: writing.step, at: 0, text: writing.reasoning },
        ]),
        ...sayingsOf(o).map((one) => ({ t: 'run-said', ...one })),
      ]
    },
    close(): void {
      for (const one of waiting.values()) if (one.timer) clearTimeout(one.timer)
      waiting.clear()
    },
  }
}

/**
 * On a reader: takes a message of the runs that its writer sent. Keeps what it tells as the writer's own engine
 * does, so the hub of this machine serves a page that follows the run here: what the runner told, the text and
 * the reasoning of a `model` step, what a step said, and a spoken sentence.
 */
export function runOnReader(o: Opened, message: Record<string, unknown>): void {
  const run = String(message.run ?? '')
  const step = String(message.step ?? '')
  if (message.t === 'run') {
    const what: unknown = message.told
    if (typeof what !== 'object' || what === null) return
    const told: Told = Object(what)
    saidTold(o, told)
    if (told.kind === 'step' && told.state === 'done') roundSaved(o, told.run, told.name)
    o.hub?.told(told)
    return
  }
  if (message.t === 'run-text' || message.t === 'run-reasoning') {
    writtenAt(
      o,
      run,
      step,
      message.t === 'run-text' ? 'text' : 'reasoning',
      Number(message.at ?? 0),
      String(message.text ?? ''),
    )
    return
  }
  if (message.t === 'run-said') {
    try {
      said(o, { run, step: { name: step, repeat: Number(message.repeat ?? 1) } }, message.value)
    } catch {
      // A value that passes the limits of this machine is not shown here: its writer took it.
    }
    return
  }
  if (message.t === 'run-audio') toldPart(o, run, { kind: 'audio', step, file: message.file })
}
