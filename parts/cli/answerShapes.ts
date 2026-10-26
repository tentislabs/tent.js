import type { Finding } from '../core/index.ts'
import type { Change } from '../history/index.ts'
import type { Impact } from '../publish/index.ts'
import type { Failure } from './testFailed.ts'

/**
 * Takes what an answer holds, as it came over the admin channel or out of a kept record. Answers its fields by name,
 * and no field for what is no record: so a command reads each field as what it is, and never as what it is said to be.
 */
export const fieldsOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {}

/** The texts of a list, and nothing of what is no text. */
export const textsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []

const isListOf = <T>(value: unknown, is: (one: unknown) => one is T): value is T[] =>
  Array.isArray(value) && value.every(is)

/** Whether a value is a change of the history, as the comparing of two points gives it. */
export function isChange(value: unknown): value is Change {
  const o = fieldsOf(value)
  return (
    ['added', 'removed', 'renamed', 'changed'].includes(String(o.change)) &&
    typeof o.what === 'string' &&
    typeof o.name === 'string' &&
    (o.was === undefined || typeof o.was === 'string') &&
    (o.lines === undefined || typeof o.lines === 'number') &&
    (o.path === undefined ||
      isListOf(o.path, (one): one is string | number => typeof one === 'string' || typeof one === 'number'))
  )
}

/** Whether a value is a finding, with its level, its code, its sentence and its page. */
export function isFinding(value: unknown): value is Finding {
  const o = fieldsOf(value)
  return (
    ['error', 'warning', 'note'].includes(String(o.level)) &&
    typeof o.code === 'string' &&
    typeof o.message === 'string' &&
    typeof o.name === 'string' &&
    typeof o.docs === 'string' &&
    (o.fix === undefined || typeof o.fix === 'string')
  )
}

/** Whether a value is a failure of a test, as the report of a run keeps it in `failures`. */
export function isTestFailure(value: unknown): value is Failure {
  const o = fieldsOf(value)
  return (
    typeof o.test === 'string' &&
    typeof o.file === 'string' &&
    typeof o.line === 'number' &&
    (o.call === undefined || (typeof o.call === 'object' && o.call !== null)) &&
    (o.fix === undefined || typeof o.fix === 'string') &&
    (o.randomSeed === undefined || typeof o.randomSeed === 'string')
  )
}

/** Whether a value is a tree of what a definition reaches, as the impact of a publish keeps it. */
function isReached(value: unknown): value is Impact['reaches'][number]['tree'][number] {
  const o = fieldsOf(value)
  return (
    typeof o.name === 'string' &&
    typeof o.kind === 'string' &&
    (o.offered === undefined || isListOf(o.offered, (one): one is string => typeof one === 'string')) &&
    (o.cached === undefined || o.cached === true) &&
    isListOf(o.under, isReached)
  )
}

/** Whether a value is the impact of a publish, as its point keeps it. */
export function isImpact(value: unknown): value is Impact {
  const o = fieldsOf(value)
  const isText = (one: unknown): one is string => typeof one === 'string'
  // One finding of an impact: a definition by its name and its file, its kind, and what changed of it.
  const isFound = (one: unknown): one is Impact['rights'][number] => {
    const found = fieldsOf(one)
    return (
      [found.name, found.kind, found.file, found.change].every(isText) &&
      [found.reaches, found.callers].every((count) => count === undefined || typeof count === 'number')
    )
  }
  return (
    typeof o.against === 'string' &&
    [o.rights, o.breaks, o.data, o.work, o.out].every((one) => isListOf(one, isFound)) &&
    isListOf(o.reaches, (one): one is Impact['reaches'][number] => {
      const reached = fieldsOf(one)
      return typeof reached.name === 'string' && isListOf(reached.tree, isReached)
    }) &&
    isListOf(o.tests, (one): one is Impact['tests'][number] => {
      const tested = fieldsOf(one)
      return typeof tested.name === 'string' && isListOf(tested.tests, isText)
    }) &&
    isListOf(o.untested, isText)
  )
}
