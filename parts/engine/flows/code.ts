import { runBody } from '../../core/internal.ts'
import type { FlowBody } from '../../flows/index.ts'
import { underWay } from '../context.ts'
import type { Opened } from '../opened.ts'
import { callIn } from '../rooms/calls.ts'

/** The name under which the arrow of a flow is kept beside the arrows of the functions: no function has a name of this form. */
export const flowKey = (flow: string, which?: string): string => `flow:${flow}${which ? `:${which}` : ''}`

/**
 * Takes the app as a version serves it, and the name of a flow. Answers its `run`, or with `onFail` its own
 * `onFail`, as the runner carries it out: its code through its room, or a function that carries out its stored
 * body, which asks the runner's `tick` before every statement. Nothing for a flow that has none.
 */
export function flowBodyOf(served: Opened, flow: string, which?: 'onFail' | 'onStop'): FlowBody | undefined {
  const record = Object.hasOwn(served.description.flows, flow) ? served.description.flows[flow] : undefined
  if (!record) return undefined
  const stored: unknown = which === undefined ? record.body : record[which]
  if (Array.isArray(stored)) return async ({ tick, ...handed }) => runBody(stored, handed, tick ? { tick } : {})
  const arrow = served.runs.get(flowKey(flow, which))
  return arrow ? async (handed) => callIn(underWay(), served.room, arrow, [handed], false, false) : undefined
}

/**
 * Takes the app as a version serves it, a flow and which of its arrows: the arrow that its record holds as code,
 * which answers at once, or nothing.
 */
export function arrowOf(served: Opened, flow: string, which: string): ((handed: object) => unknown) | undefined {
  const arrow = served.runs.get(flowKey(flow, which))
  return arrow && ((handed) => callIn(underWay(), served.room, arrow, [handed], true, false))
}
