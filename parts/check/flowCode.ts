import type { Node } from '../build/index.ts'
import { walk } from '../build/index.ts'
import type { Call } from './code.ts'
import { callsIn } from './code.ts'
import { handedAs } from './handed.ts'
import type { Written } from './rule.ts'
import { arrowOf } from './rule.ts'

/** The step tools that answer a promise: each begins or reads a step of its own. */
export const stepTools = [
  'step',
  'step.wait',
  'step.waitFor',
  'step.all',
  'step.first',
  'step.many',
  'step.done',
  'step.again',
]

/** The arrows of a flow that are its code: its `run`, and its own `onFail`. */
export function arrowsOfFlow(flow: Written): Node[] {
  return [arrowOf(flow, 'run'), arrowOf(flow, 'onFail')].flatMap((arrow) => (arrow ? [arrow] : []))
}

/**
 * Takes the code of a flow and the words its file imports. Answers its calls, each by the name of what it stands
 * for: the step tool by `step` under whatever name the code holds it, and a word of tentjs by its own name under
 * whatever name it was imported.
 */
export function flowCalls(code: Node, words: Map<string, string> = new Map()): Call[] {
  const step = handedAs(code, 'step')
  return callsIn(code).map((call) => {
    if (step !== undefined && (call.name === step || call.name.startsWith(`${step}.`)))
      return { ...call, name: `step${call.name.slice(step.length)}` }
    const [head, ...rest] = call.name.split('.')
    const word = words.get(head)
    return word === undefined ? call : { ...call, name: [word, ...rest].join('.') }
  })
}

/**
 * Takes the code of a flow and the words its file imports. Answers its calls in two parts: those that stand inside
 * the work of a step, which is the arrow that `step` is handed, and those that stand between the steps, where the
 * code runs again on every pass.
 */
export function callsOfFlow(code: Node, words?: Map<string, string>): { inside: Call[]; between: Call[] } {
  const calls = flowCalls(code, words)
  const inStep = new Set<Node>()
  for (const call of calls) {
    const work = call.name === 'step' ? call.args[1] : undefined
    if (work) walk(work, (node) => void inStep.add(node))
  }
  return {
    inside: calls.filter((call) => inStep.has(call.node)),
    between: calls.filter((call) => !inStep.has(call.node)),
  }
}
