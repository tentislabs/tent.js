import type { Opened } from '../opened.ts'

/** What a `model` step of a run has written so far, which the engine keeps in memory while the step runs. */
export interface Writing {
  step: string
  text: string
  reasoning: string
}

// What each run of an app writes now, by the handles of the app and the id of the run.
const writings = new WeakMap<object, Map<string, Writing>>()

// Whoever is told the parts of a run as they arrive: the live connections that follow it.
const listeners = new WeakMap<object, (run: string, part: Record<string, unknown>) => void>()

const ofApp = (o: Opened): Map<string, Writing> => {
  const held = writings.get(o.handles) ?? new Map<string, Writing>()
  writings.set(o.handles, held)
  return held
}

/** The text and the reasoning that a run writes now, where a `model` step of it runs. */
export const writingOf = (o: Opened, run: string): Writing | undefined => writings.get(o.handles)?.get(run)

// Whoever hands the parts of the runs of a writer on to its readers.
const copies = new WeakMap<object, (run: string, part: Record<string, unknown>) => void>()

/** Has the parts of every run of a writer told to what hands them on to its readers. */
export const copyParts = (o: Opened, listen: (run: string, part: Record<string, unknown>) => void): void =>
  void copies.set(o.handles, listen)

/** Every run of an app whose `model` step writes now, with what it wrote so far. */
export const writingsOf = (o: Opened): [string, Writing][] => [...(writings.get(o.handles) ?? new Map()).entries()]

/**
 * On a reader: the text or the reasoning of a `model` step of a run as its writer told it, from character `at` on.
 * `at: 0` drops what this machine held of that step first. Keeps what the step wrote so far, and tells whoever
 * follows the run here what was added.
 */
export function writtenAt(
  o: Opened,
  run: string,
  step: string,
  kind: 'text' | 'reasoning',
  at: number,
  text: string,
): void {
  const held = ofApp(o)
  const was = held.get(run)
  const writing = was && was.step === step ? was : { step, text: '', reasoning: '' }
  const tell = (part: Record<string, unknown>): void => listeners.get(o.handles)?.(run, part)
  if (at === 0 && writing[kind]) {
    if (kind === 'text') tell({ kind: 'again', step, repeat: 1 })
    else tell({ kind: 'reasoning', step, text: '', anew: true })
    if (kind === 'text') writing.reasoning = ''
  }
  writing[kind] = writing[kind].slice(0, Math.max(0, at)) + text
  held.set(run, writing)
  if (text) tell({ kind, step, text })
}

/** Has the parts of every run of an app told to one listener, the hub of its live connections. */
export const hearParts = (o: Opened, listen: (run: string, part: Record<string, unknown>) => void): void =>
  void listeners.set(o.handles, listen)

/**
 * Takes a part that the driver of a run tells: the next part of the text or of the reasoning of a `model` step, or that
 * a step begins again. Keeps what the step wrote so far, and tells whoever follows the run.
 */
export function toldPart(o: Opened, run: string, part: Record<string, unknown>): void {
  const kind = part.kind
  // The readers of a writer are told every part too, so that a page that follows the run there is sent it.
  copies.get(o.handles)?.(run, part)
  // What a step says is no part of what a `model` step writes: it is told as it is.
  if (kind === 'said') return void listeners.get(o.handles)?.(run, part)
  const step = String(part.step ?? '')
  const held = ofApp(o)
  const was = held.get(run)
  const writing = was && was.step === step ? was : { step, text: '', reasoning: '' }
  if (kind === 'text') writing.text += String(part.text ?? '')
  else if (kind === 'reasoning')
    writing.reasoning = part.anew === true ? '' : writing.reasoning + String(part.text ?? '')
  else if (kind === 'again') {
    writing.text = ''
    writing.reasoning = ''
  }
  held.set(run, writing)
  listeners.get(o.handles)?.(run, part)
}

/**
 * A step of a run ended. Where it saved a round - `remember N` of an agent that keeps a conversation, and
 * the `model` step of one that keeps none - the text that was kept in memory is gone: it stands in what was saved.
 */
export function roundSaved(o: Opened, run: string, step: string): void {
  const writing = writings.get(o.handles)?.get(run)
  if (!writing) return
  const remembered = /^remember \d+$/.test(step)
  const flow = o.flows?.runner.read(run)?.flow
  const record = flow !== undefined && Object.hasOwn(o.description.flows, flow) ? o.description.flows[flow] : undefined
  const keeps = Reflect.get(Object(record?.agent), 'memory') !== undefined
  if (remembered || (!keeps && step === writing.step)) writings.get(o.handles)?.delete(run)
}
