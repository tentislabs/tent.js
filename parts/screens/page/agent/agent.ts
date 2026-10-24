import type { WireError } from '../../../core/index.ts'
import type { AskShown, FollowedRun, FollowedRuns, SaidShown, StepShown } from '../followed.ts'
import { holdPart } from '../parts.ts'
import { isStored } from '../../../core/internal.ts'

const listOf = <T>(value: unknown, keep: (one: unknown) => one is T): T[] =>
  Array.isArray(value) ? value.filter(keep) : []

const isStep = (one: unknown): one is StepShown => isStored(one) && typeof one.name === 'string'
const isAsk = (one: unknown): one is AskShown => isStored(one) && typeof one.run === 'string'
const isSaid = (one: unknown): one is SaidShown => isStored(one) && typeof one.step === 'string'

const usedOf = (value: unknown): Record<string, number> =>
  isStored(value)
    ? Object.fromEntries(Object.entries(value).filter((one): one is [string, number] => typeof one[1] === 'number'))
    : {}

/**
 * Takes what sends a message over the live connection. Answers the runs that the page follows: a `run-watch` for
 * each, under an id of its own, and what each message of the engine about it changes. A `run` message is the whole
 * state of the run, and takes the place of what the page held.
 */
function followedRuns(send: (message: object) => boolean): FollowedRuns {
  const runs = new Map<string, { state: FollowedRun; heard: Set<() => void> }>()
  const idOf = (run: string): string => `run:${run}`
  const fresh = (run: string): FollowedRun => ({
    run,
    state: 'unknown',
    steps: [],
    asks: [],
    said: [],
    text: '',
    reasoning: '',
    sounds: [],
    used: {},
  })

  /** What one part of a run changes in what the page holds. */
  function applied(held: FollowedRun, part: Record<string, unknown>): FollowedRun {
    const kind = part.kind
    const step = typeof part.step === 'string' ? part.step : undefined
    if (kind === 'state') return { ...held, state: String(part.state) }
    if (kind === 'text')
      return {
        ...held,
        text: (held.step === step ? held.text : '') + String(part.text ?? ''),
        ...(step ? { step } : {}),
      }
    if (kind === 'reasoning')
      return {
        ...held,
        reasoning: (part.anew === true || held.step !== step ? '' : held.reasoning) + String(part.text ?? ''),
        ...(step ? { step } : {}),
      }
    if (kind === 'said') {
      const said = { step: String(step), repeat: Number(part.repeat ?? 1), value: part.value }
      const others = held.said.filter((one) => one.step !== said.step || one.repeat !== said.repeat)
      return { ...held, said: [...others, said] }
    }
    if (kind === 'again')
      return {
        ...held,
        ...(held.step === step ? { text: '', reasoning: '' } : {}),
        said: held.said.filter((one) => one.step !== step || one.repeat !== Number(part.repeat ?? 1)),
      }
    if (kind === 'step' && isStep(part.step)) {
      const shown = part.step
      const others = held.steps.filter((one) => one.name !== shown.name || one.repeat !== shown.repeat)
      return { ...held, steps: [...others, shown], used: usedOf(part.used) }
    }
    if (kind === 'ask' && isAsk(part.ask)) return { ...held, asks: [...held.asks, part.ask] }
    if (kind === 'answered')
      return {
        ...held,
        asks: held.asks.filter(
          (one) => !(one.run === part.run && one.step === part.step && one.repeat === part.repeat && one.n === part.n),
        ),
      }
    if (kind === 'audio' && typeof part.file === 'string') return { ...held, sounds: [...held.sounds, part.file] }
    if (kind === 'done')
      return {
        ...held,
        state: 'done',
        ...(typeof part.text === 'string' ? { text: part.text } : {}),
        ...('answer' in part ? { answer: part.answer } : {}),
        used: usedOf(part.used),
      }
    if (kind === 'failed')
      return { ...held, state: 'failed', ...(isStored(part.error) ? { error: errorOf(part.error) } : {}) }
    if (kind === 'stopped') return { ...held, state: 'stopped' }
    return held
  }

  const errorOf = (value: Record<string, unknown>): WireError => ({
    code: String(value.code ?? 'T0009'),
    name: String(value.name ?? ''),
    message: String(value.message ?? ''),
  })

  /** The whole state of a run, from a `run` message. */
  function whole(run: string, message: Record<string, unknown>): FollowedRun {
    const text = isStored(message.text) ? message.text : undefined
    const reasoning = isStored(message.reasoning) ? message.reasoning : undefined
    return {
      ...fresh(run),
      state: String(message.state),
      steps: listOf(message.steps, isStep),
      asks: listOf(message.asks, isAsk),
      said: listOf(message.said, isSaid),
      text: typeof text?.text === 'string' ? text.text : '',
      reasoning: typeof reasoning?.text === 'string' ? reasoning.text : '',
      ...(typeof text?.step === 'string' ? { step: text.step } : {}),
      used: usedOf(message.used),
      ...(typeof message.agent === 'string' ? { agent: message.agent } : {}),
      ...(typeof message.flow === 'string' ? { flow: message.flow } : {}),
      ...('answer' in message ? { answer: message.answer } : {}),
      ...(isStored(message.error) ? { error: errorOf(message.error) } : {}),
    }
  }

  return {
    follow(run, heard) {
      const held = runs.get(run) ?? { state: fresh(run), heard: new Set<() => void>() }
      const first = !runs.has(run)
      runs.set(run, held)
      held.heard.add(heard)
      if (first) send({ t: 'run-watch', id: idOf(run), run })
      return () => {
        held.heard.delete(heard)
        if (held.heard.size) return
        runs.delete(run)
        send({ t: 'unwatch', id: idOf(run) })
      }
    },
    held: (run) => runs.get(run)?.state,
    told(message) {
      const id = typeof message.id === 'string' ? message.id : ''
      if (!id.startsWith('run:')) return false
      const run = id.slice(4)
      const held = runs.get(run)
      if (!held) return true
      if (message.t === 'run') held.state = whole(run, message)
      else if (message.t === 'run-part') held.state = applied(held.state, message)
      else if (message.t === 'failed')
        held.state = {
          ...held.state,
          state: 'failed',
          ...(isStored(message.error) ? { error: errorOf(message.error) } : {}),
        }
      else return false
      for (const heard of [...held.heard]) heard()
      return true
    },
    again() {
      for (const run of runs.keys()) send({ t: 'run-watch', id: idOf(run), run })
    },
  }
}

// A page loads this part at the first run it follows; a server holds it from its start.
holdPart('agent', { followedRuns })
