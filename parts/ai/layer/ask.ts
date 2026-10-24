import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { AiEnv, Base, CallAt, Method, Provider, Units } from '../face.ts'
import type { ProviderFailure } from '../../core/internal.ts'
import { failureOf } from '../../core/internal.ts'
import { providerOf } from './providers.ts'
import type { ModelOf } from './record.ts'
import { canDo, cannot, modelOf } from './record.ts'
import type { Bytes } from './bytes.ts'
import { countingFetch } from './bytes.ts'

/** What one model call is: the model that was asked, the call, its caller, its version, where it is made, and what ends it. */
export interface Asking {
  env: AiEnv
  model: string
  method: Method
  caller: Caller
  version: string
  at?: CallAt
  signal: AbortSignal
  // Abilities the call needs beside that of its method: `images`, `tools`.
  also?: string[]
  // Whether a fall-back can take the call, beside its abilities: for a call as a function, its own input.
  fits?(model: ModelOf): boolean
  // The call is not given to a second model: `embed`, whose vectors cannot be mixed.
  alone?: true
  // The one model that is asked, in place of the asked one and its fall-backs: the one that began a long job.
  only?: string
}

/** What one try fills while it works: what it used, which units the layer counted, and the provider's record. */
export interface Tally {
  units: Units
  counted: string[]
  raw?: unknown
  // A part of the answer was handed to the caller, or a long job was begun: no second model is asked.
  given?: true
  begun?: true
}

/** One try of the call on one model. `first` says that the first part of an answer came. */
export type Attempt<T> = (o: {
  provider: Provider
  model: ModelOf
  base: Base
  tally: Tally
  first(): void
}) => Promise<T>

const codeOf: Partial<Record<ProviderFailure['kind'], { code: string; words: string }>> = {
  notAccepted: { code: 'T7110', words: 'did not accept the request' },
  refused: { code: 'T7106', words: 'refused for what was asked' },
  cutOff: { code: 'T7107', words: 'gave an answer that was cut off' },
}

/** The error of a failure that no second model is asked for. */
function finalOf(model: string, failure: ProviderFailure): TentError {
  const known = codeOf[failure.kind]
  if (known)
    return new TentError(known.code, `The model ${model} ${known.words}: ${failure.message}`, {
      fix:
        known.code === 'T7110'
          ? 'Check the key of the model, its name, and what the request holds.'
          : known.code === 'T7107'
            ? 'Ask for a shorter answer, or give the model more room in its options.'
            : 'Ask for something else.',
    })
  return allFailed([{ model, reason: failure.kind, message: failure.message }])
}

/** The error of a call that every model failed, naming each and its reason. */
function allFailed(reasons: { model: string; reason: string; message?: string }[]): TentError {
  const named = reasons.map(
    (one) => `${one.model}: ${one.reason}${one.message ? ` (${one.message.slice(0, 200)})` : ''}`,
  )
  return new TentError('T7104', `Every model that could answer failed. ${named.join('; ')}.`, {
    fix: 'Try again later, or list another model in `fallback`.',
  })
}

/** Whether a failure is one that the same model is tried again for. */
const again = (failure: ProviderFailure): boolean => failure.kind === 'server' || failure.kind === 'busy'

/** Whether a failure is one that the next model is asked for. */
const onward = (failure: ProviderFailure): boolean =>
  again(failure) || failure.kind === 'unreachable' || failure.kind === 'slow'

/**
 * Takes a model call and what one try of it does. Asks the model, and where it fails as the table of a second
 * provider says, tries it again and then the next model in its `fallback`, each held to its ability, its limits and
 * its time. Tells `used` of every try. Answers what the try that worked answered. Throws T7001 for a call the asked
 * model cannot do, T7102 for a limit of the asked model, T7104 when every model failed, and T7106, T7107 and T7110
 * as the failure says.
 */
export async function ask<T>(asking: Asking, attempt: Attempt<T>): Promise<T> {
  const { env, method, caller } = asking
  const description = env.description(asking.version)
  const asked = modelOf(description, asking.model)
  if (!canDo(asked, method, asking.also)) throw cannot(asked.name, method)
  const run = asking.at?.run
  await env.allow({ model: asked.name, call: method, caller, ...(run ? { run } : {}) })
  const models = asking.only
    ? [modelOf(description, asking.only)]
    : [asked, ...(asking.alone ? [] : asked.fallback.map((name) => modelOf(description, name)))]
  const reasons: { model: string; reason: string; message?: string }[] = []
  for (const model of models) {
    if (model !== asked && !asking.only) {
      if (!canDo(model, method, asking.also) || (asking.fits && !asking.fits(model))) continue
      try {
        await env.allow({ model: model.name, call: method, caller, ...(run ? { run } : {}) })
      } catch (error) {
        if (error instanceof TentError && error.code === 'T7102') continue
        throw error
      }
    }
    const provider = providerOf(env, model, asking.version)
    for (let tryNumber = 1; ; tryNumber++) {
      const tally: Tally = { units: {}, counted: [] }
      // What the requests of this try send and read, which the engine counts for the model.
      const bytes: Bytes = { in: 0, out: 0 }
      const began = env.now()
      const timer = new AbortController()
      const timed = setTimeout(() => timer.abort(), model.time)
      const signal = AbortSignal.any([asking.signal, timer.signal])
      // A stand-in of a test takes the place of the provider: it needs no key, which a test's data may not hold.
      const key = env.standIn?.(model.name) ? undefined : keyOf(env, model)
      const base: Base = {
        model: model.stored,
        ...(key === undefined ? {} : { key }),
        fetch: countingFetch(env.fetch, bytes),
        signal,
        ...(asking.at ? { at: asking.at } : {}),
      }
      const told = (ok: boolean, code?: string, message?: string): void =>
        env.used({
          name: asked.name,
          answeredBy: model.name,
          ...(model !== asked && reasons.length ? { reason: reasons[0].reason } : {}),
          kind: method,
          caller,
          ...(run ? { run } : {}),
          units: tally.units,
          ...(tally.counted.length ? { counted: tally.counted } : {}),
          ...(tally.raw === undefined ? {} : { raw: tally.raw }),
          ms: env.now() - began,
          bytes,
          ok,
          ...(code ? { code } : {}),
          ...(message === undefined ? {} : { message }),
        })
      try {
        const answer = await attempt({
          provider,
          model,
          base,
          tally,
          first: () => clearTimeout(timed),
        })
        told(true)
        return answer
      } catch (error) {
        if (asking.signal.aborted) {
          told(false, 'stopped')
          throw asking.signal.reason ?? error
        }
        if (error instanceof TentError) {
          told(false, error.code)
          throw error
        }
        const failure = failureOf(error)
        if (timer.signal.aborted) failure.kind = 'slow'
        told(false, failure.kind, failure.message)
        if (!onward(failure)) throw finalOf(model.name, failure)
        if (tally.given || tally.begun)
          throw allFailed([{ model: model.name, reason: failure.kind, message: failure.message }])
        const wait = failure.retryAfter ?? 0
        if (again(failure) && tryNumber < model.tries && wait <= model.wait) {
          if (wait > 0) await env.sleep(wait)
          continue
        }
        reasons.push({ model: model.name, reason: failure.kind, message: failure.message })
        break
      } finally {
        clearTimeout(timed)
      }
    }
  }
  throw allFailed(reasons)
}

/** The value of the key of a model, where it names one. */
function keyOf(env: AiEnv, model: ModelOf): string | undefined {
  const key: unknown = model.stored.key
  const name: unknown = typeof key === 'object' && key !== null ? Reflect.get(key, 'secret') : undefined
  return typeof name === 'string' ? env.secret(name) : undefined
}
