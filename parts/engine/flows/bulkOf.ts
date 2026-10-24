import { TentError } from '../../core/index.ts'
import type { Bulk, RunState } from '../../flows/index.ts'

const states: RunState[] = ['queued', 'running', 'waiting', 'done', 'failed', 'stopped']

const unfit = (field: string, what: string): TentError =>
  new TentError('T0002', `\`${field}\` of work on many runs is ${what}.`, {
    fields: { [field]: 'type' },
    fix: 'Name the runs by `{ flow, key?, state?, since?, before? }`: a state of a run, and a moment as a date, its text or its milliseconds.',
  })

/** A moment as code or a command writes it - a `Date`, its text in the standard form, or milliseconds - in milliseconds. */
function momentOf(field: string, written: unknown): number | undefined {
  if (written === undefined || written === null) return undefined
  const ms =
    written instanceof Date ? written.getTime() : typeof written === 'string' ? Date.parse(written) : Number(written)
  if (typeof written === 'boolean' || !Number.isFinite(ms)) throw unfit(field, 'no moment')
  return ms
}

/**
 * Takes what code or a command names the runs of work on many runs by. Answers it as the runner takes it: the flow,
 * the key, the states and the two moments in milliseconds. Throws T0002 for no flow, a state that is none, and a
 * moment that does not read.
 */
export function bulkOf(asked: unknown): Bulk {
  const given: Record<string, unknown> = Object(asked)
  if (typeof given.flow !== 'string' || given.flow === '') throw unfit('flow', 'not the name of a flow')
  const listed = given.state === undefined ? undefined : Array.isArray(given.state) ? given.state : [given.state]
  const state = listed?.map((one) => {
    const found = states.find((known) => known === one)
    if (!found) throw unfit('state', `${JSON.stringify(one)}, which is no state of a run`)
    return found
  })
  const [since, before] = [momentOf('since', given.since), momentOf('before', given.before)]
  return {
    flow: given.flow,
    ...(typeof given.key === 'string' ? { key: given.key } : {}),
    ...(state ? { state } : {}),
    ...(since === undefined ? {} : { since }),
    ...(before === undefined ? {} : { before }),
  }
}
