import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { isStored, knownModel } from '../../core/internal.ts'
import type { Method } from '../face.ts'

/** What the model layer reads of a model: its record, what is known of it, its tries, its time and its fall-backs. */
export interface ModelOf {
  name: string
  stored: Record<string, unknown>
  // Unknown where neither the record nor the list says: such a model is held to what its provider has.
  abilities?: string[]
  takes?: number
  voices?: string[]
  tries: number
  // The longest wait a server may ask for, for the same model to be tried again.
  wait: number
  // In milliseconds: for a call that writes, until its first part; for any other, the whole call.
  time: number
  fallback: string[]
  isFunction: boolean
}

/** Takes a description and the name of a model. Answers what the layer reads of it. Throws T0001 for a name that is none. */
export function modelOf(description: Description, name: string): ModelOf {
  const stored = Object.hasOwn(description.models, name) ? description.models[name] : undefined
  if (!isStored(stored))
    throw new TentError('T0001', `No model named ${JSON.stringify(name).slice(0, 80)} can be reached.`, {
      fix: 'Call a model of the app by its name.',
    })
  const known = knownModel(stored)
  const tries = isStored(stored.tries) ? stored.tries : { max: stored.tries }
  const limits = isStored(stored.limits) ? stored.limits : {}
  return {
    name,
    stored,
    ...known,
    tries: typeof tries.max === 'number' && tries.max >= 1 ? Math.floor(tries.max) : 2,
    wait: typeof tries.wait === 'number' ? tries.wait : 5000,
    time: typeof limits.time === 'number' ? limits.time : 60_000,
    fallback: Array.isArray(stored.fallback) ? stored.fallback.map(String) : [],
    isFunction: stored.call !== undefined || (stored.input !== undefined && stored.output !== undefined),
  }
}

/** The ability each call needs. A model called as a function needs none, but to be one. */
const abilityOf: Record<Method, string | undefined> = {
  reply: 'reply',
  stream: 'reply',
  fill: 'typedAnswers',
  embed: 'embed',
  hear: 'hear',
  speak: 'speak',
  rank: 'rank',
  call: undefined,
}

/** Whether a model can be asked for a call: it has its ability, where what it has is known, or it is a function. */
export function canDo(model: ModelOf, method: Method, also: string[] = []): boolean {
  if (method === 'call') return model.isFunction
  const needed = [abilityOf[method], ...also].filter((one): one is string => one !== undefined)
  return !model.abilities || needed.every((one) => model.abilities?.includes(one))
}

/** The error of a call for what a model cannot do. */
export const cannot = (model: string, what: string): TentError =>
  new TentError('T7001', `The model ${model} is asked for ${what}, which it cannot do.`, {
    fix: `Give the model the ability in \`abilities\`, or ask a model that has it.`,
  })
