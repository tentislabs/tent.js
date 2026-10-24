import { isStored } from '../../core/internal.ts'
import type { Change } from './change.ts'
import { textOf } from './records.ts'

/** A stored call of `step` whose first value is a text written in place: the name of the step, or nothing for any other value. */
function stepName(value: unknown): string | undefined {
  if (!isStored(value) || value.fn !== 'step' || !Array.isArray(value.args)) return undefined
  const [name] = value.args
  return typeof name === 'string' ? name : undefined
}

/**
 * Takes a stored body. Answers its steps by their names, each as its stored call, and the body around them, with
 * the name of each step in its place. A step inside the arrow of another step is part of that step, and a name
 * that the body writes more than once names no step.
 */
export function taken(body: unknown): { steps: Map<string, unknown>; around: unknown } {
  const counts = new Map<string, number>()
  const count = (value: unknown): void => {
    const name = stepName(value)
    if (name !== undefined) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
      return
    }
    if (Array.isArray(value)) for (const one of value) count(one)
    else if (isStored(value)) for (const one of Object.values(value)) count(one)
  }
  count(body)
  const steps = new Map<string, unknown>()
  const around = (value: unknown): unknown => {
    const name = stepName(value)
    if (name !== undefined && counts.get(name) === 1) {
      steps.set(name, value)
      return { step: name }
    }
    if (name !== undefined) return value
    if (Array.isArray(value)) return value.map(around)
    if (isStored(value)) return Object.fromEntries(Object.entries(value).map(([key, one]) => [key, around(one)]))
    return value
  }
  return { steps, around: around(body) }
}

/**
 * Compares the two bodies of one option of a flow, `body` or `onFail`. Each step is one value under its name: one
 * that differs is changed, and one that a side lacks is added or removed. What is left, the body around its
 * steps, is one value too, and its change holds the path of the option and neither value.
 */
export function stepChanges(changes: Change[], flow: string, option: 'body' | 'onFail', a: unknown, b: unknown): void {
  const [before, after] = [taken(a), taken(b)]
  const front = option === 'onFail' ? 'onFail.' : ''
  for (const name of new Set([...before.steps.keys(), ...after.steps.keys()])) {
    const [was, is] = [before.steps.get(name), after.steps.get(name)]
    if (was !== undefined && is !== undefined && textOf(was) === textOf(is)) continue
    changes.push({
      change: was === undefined ? 'added' : is === undefined ? 'removed' : 'changed',
      what: 'step',
      name: `${flow}.${front}${name}`,
    })
  }
  if (textOf(before.around) !== textOf(after.around))
    changes.push({ change: 'changed', what: 'flow', name: flow, path: [option] })
}
