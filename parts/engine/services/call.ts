import type { Answered } from '../../connect/index.ts'
import { TentError } from '../../core/index.ts'
import { checkOfJob, isStored } from '../../core/internal.ts'
import type { CallContext } from '../context.ts'
import { readOnly } from '../door/call.ts'
import { heldToLeave } from '../flows/leave.ts'
import { hasFullAccess } from '../full.ts'
import { valuesOf } from '../values/ofApp.ts'
import { scrubbed } from '../values/scrub.ts'
import { servicesOf, withOnce } from './env.ts'
import { touch } from '../counts/cpu.ts'
import { gather } from '../counts/gather.ts'
import { asServiceCall } from '../counts/services.ts'
import { spanned } from '../trace/span.ts'

/** The person's answer to a question of an outside server, which the driver hands beside the input after an ask. */
function answeredOf(how: unknown): { answered?: Answered } {
  const given: unknown = isStored(how) ? how.answered : undefined
  if (!isStored(given) || typeof given.state !== 'string' || !isStored(given.response)) return {}
  const key = typeof given.key === 'string' ? { key: given.key } : {}
  return { answered: { state: given.state, ...key, response: given.response } }
}

/** What a model over a service call is told of the whole answer, before it is filtered: a function it handed. */
const seenOf =
  (told: object) =>
  (whole: unknown): void =>
    void Reflect.apply(Object(told), undefined, [whole])

/** The record of a call of a service of the version a call runs on, by the name `<service>.<call>`. */
export function serviceCallOf(cx: CallContext, definition: string): Record<string, unknown> | undefined {
  const dot = definition.indexOf('.')
  if (dot < 0) return undefined
  const service = definition.slice(0, dot)
  const { services } = cx.app.description
  const stored = Object.hasOwn(services, service) ? services[service] : undefined
  const calls = isStored(stored?.calls) ? stored.calls : undefined
  const call = calls && Object.hasOwn(calls, definition.slice(dot + 1)) ? calls[definition.slice(dot + 1)] : undefined
  return isStored(call) ? call : undefined
}

/** A value with every secret that the engine holds taken out of each text in it. */
function cleaned(value: unknown, forms: string[]): unknown {
  if (typeof value === 'string') return scrubbed(value, forms)
  if (Array.isArray(value)) return value.map((one) => cleaned(one, forms))
  if (isStored(value))
    return Object.fromEntries(Object.entries(value).map(([name, one]) => [name, cleaned(one, forms)]))
  return value
}

/** The signal of a service call: it ends with the time of the work it is made in, with T0008, and with the call itself. */
function signalOf(cx: CallContext): { signal: AbortSignal; done(): void } {
  const left = cx.work.ends - performance.now()
  if (!Number.isFinite(left)) return { signal: cx.signal, done: () => undefined }
  const time = new AbortController()
  const timer = setTimeout(
    () =>
      time.abort(
        new TentError('T0008', `The time of ${cx.work.name} ended while a service call waited.`, {
          fix: 'Give the work more time in its `limits`, or call the service in a step of a flow.',
        }),
      ),
    Math.max(0, left),
  )
  return { signal: AbortSignal.any([cx.signal, time.signal]), done: () => clearTimeout(timer) }
}

/**
 * Takes the call context of the code that calls, the name of a service call, and what it was handed: the input and
 * `{ account, for }`. Makes the call through `connect`, which is loaded at the first one: in a query, a change and
 * the arrow of a rule it is T0013, and in a call that only reads it must state `changes: false` or be a `get`
 * (T0013). Inside a step it carries the once-only key of its place. A T7115 leaves with every secret taken out of
 * what the service answered. With `onWorker` the work on a worker makes it, which is handed the call once it may
 * be made, to make with the once-only key it worked out. Answers a promise of what the call answers.
 */
export function callService(
  cx: CallContext,
  definition: string,
  args: unknown[],
  o: { onWorker?: OnWorker } = {},
): Promise<unknown> {
  const call = serviceCallOf(cx, definition)
  const { kind } = cx.work
  if (kind === 'query' || kind === 'change' || kind === 'rule')
    throw new TentError('T0013', `The service call ${definition} was made in the ${kind} ${cx.work.name}.`, {
      fix: 'Call a service from an action, a route or a step of a flow.',
    })
  const changes = call?.changes ?? call?.method !== 'GET'
  if (cx.reads && changes !== false) throw readOnly(`The service call ${definition}`)
  // Naming whose account a call uses is full access.
  const how = args[1]
  if (isStored(how) && how.for !== undefined && !hasFullAccess(cx))
    throw new TentError(
      'T0013',
      `${cx.work.name} names the account of another user for ${definition}, which is full access.`,
      {
        fix: "State `system: 'why'` on the definition, or call the service for the caller's own account.",
      },
    )
  // Every service call sends, a GET too, unless it states that it does not; the check of a job is asked about at its start.
  const free = call?.sends === false || (isStored(how) && Reflect.get(how, checkOfJob) === true)
  const { onWorker } = o
  return heldToLeave(cx, definition, free ? 'free' : 'sends', (held) =>
    onWorker
      ? onWorker(held, args[0], (key) => made(held, definition, args, { counted: true, key }))
      : made(held, definition, args, {}),
  )
}

/**
 * What makes a service call on a worker: handed the call context, the input, and the call itself, which it makes
 * with the once-only key it worked out once the writer let it, and answers what the call answers.
 */
export type OnWorker = (cx: CallContext, input: unknown, call: (key: string) => Promise<unknown>) => Promise<unknown>

/** The service call itself, once it may be made here. */
async function made(
  cx: CallContext,
  definition: string,
  args: unknown[],
  o: { counted?: true; key?: string },
): Promise<unknown> {
  const [input, how] = args
  // Which call of its step this is, is counted as the call is made, before anything is waited for.
  const inside = cx.run?.step ? await import('../flows/inside.ts') : undefined
  const place = inside?.atOf(cx)
  const key = o.key ?? (inside && place ? inside.onceKey(place, inside.whichCall(cx, definition, input)) : undefined)
  const services = await servicesOf(cx.app)
  const { signal, done } = signalOf(cx)
  const dot = definition.indexOf('.')
  // A model over a service call is counted under the model, and not as a call of its service too.
  const model = isStored(how) && typeof how.seen === 'function'
  const began = performance.now()
  let failed = false
  touch()
  try {
    // A call of a service is a span of its own, with the host, the status and the bytes its requests told; one that
    // a model makes is the model's.
    const traced = <Answer>(work: () => Promise<Answer>): Promise<Answer> =>
      model ? work() : spanned(cx.app, { name: definition, kind: 'service' }, work)
    return await withOnce(key, () =>
      asServiceCall({ name: definition, caller: cx.caller, model }, () =>
        traced(() =>
          services.call(definition.slice(0, dot), definition.slice(dot + 1), input, {
            caller: cx.caller,
            version: cx.version,
            signal,
            ...(o.counted ? { counted: true as const } : {}),
            ...(isStored(how) && typeof how.for === 'string' ? { for: how.for } : {}),
            ...(isStored(how) && typeof how.account === 'string' ? { account: how.account } : {}),
            ...(isStored(how) && typeof how.seen === 'function' ? { seen: seenOf(how.seen) } : {}),
            ...(isStored(how) && how.files === true ? { files: true as const } : {}),
            ...answeredOf(how),
            ...(isStored(how) && typeof how.run === 'string' ? { run: how.run } : {}),
          }),
        ),
      ),
    )
  } catch (error) {
    if (error instanceof TentError && error.code === 'T7115' && error.service) {
      const forms = valuesOf(cx.app).forms()
      const { status, body } = error.service
      error.service = {
        ...(status === undefined ? {} : { status }),
        ...(body === undefined ? {} : { body: cleaned(body, forms) }),
      }
      error.message = scrubbed(error.message, forms)
    }
    failed = true
    throw error
  } finally {
    done()
    touch()
    const units = { calls: 1, ms: performance.now() - began, ...(failed ? { failed: 1 } : {}) }
    if (!model) gather(cx.app, definition, units, { caller: cx.caller, definition })
  }
}
