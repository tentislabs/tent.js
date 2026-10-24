import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { checkOfJob, isStored, matches, ProviderFailure } from '../../core/internal.ts'
import type { AiEnv, Base, Provider, Result, Units } from '../face.ts'
import { kindOfStatus, numberAt } from './sent.ts'

type Filter = Parameters<typeof matches>[0]

// A filter as the description stores it: a record, which `matches` reads.
const isFilter = (value: unknown): value is Filter => isStored(value)

/** The name a stored call of a service is called under: `<service>.<call>`. */
export function callName(stored: unknown, model: string): string {
  const call = isStored(stored) ? stored : {}
  if (typeof call.service !== 'string' || typeof call.call !== 'string')
    throw new TentError('T0013', `The model ${model} of the provider service names no call of a service.`, {
      fix: 'Name the call in `call`, as `call: decisions.decide`.',
    })
  return `${call.service}.${call.call}`
}

/** The record of a call of a service, by the name `<service>.<call>`. */
export function callRecordOf(description: Description, name: string): Record<string, unknown> {
  const [service, call] = name.split('.')
  const stored = Object.hasOwn(description.services, service) ? description.services[service] : undefined
  const calls = isStored(stored?.calls) ? stored.calls : {}
  const record = Object.hasOwn(calls, call) ? calls[call] : undefined
  return isStored(record) ? record : {}
}

/** What a model over a service call states in `units`, read from the whole answer: a path, or a fixed number. */
function unitsOf(model: Record<string, unknown>, whole: unknown): Units {
  const units: Units = {}
  for (const [unit, at] of Object.entries(isStored(model.units) ? model.units : {})) {
    const value = typeof at === 'number' ? at : typeof at === 'string' ? numberAt(whole, at) : undefined
    if (value !== undefined) units[unit] = value
  }
  return units
}

/** Reads the value at a dotted path of a value. */
function valueAt(value: unknown, path: string): unknown {
  let at: unknown = value
  for (const name of path.split('.')) at = isStored(at) ? at[name] : undefined
  return at
}

/**
 * Makes the service call with `call` of the engine, and hands it `seen`, which is told the whole answer before it
 * is filtered through the output: so `units` and `with` read what the server said. Answers the output, what was
 * used, and the whole answer.
 */
async function called(
  env: AiEnv,
  o: Base,
  name: string,
  input: unknown,
  check = false,
): Promise<Result & { whole: unknown }> {
  let whole: unknown
  let output: unknown
  try {
    output = await env.call(name, [
      input,
      {
        seen: (read: unknown) => {
          whole = read
        },
        ...(check ? { [checkOfJob]: true } : {}),
      },
    ])
  } catch (error) {
    // How the call failed is read from its status, by the table of the providers.
    if (!(error instanceof TentError) || error.code !== 'T7115') throw error
    const status = error.service?.status
    throw new ProviderFailure(status === undefined ? 'unreachable' : kindOfStatus(status), error.message)
  }
  return { output, units: unitsOf(o.model, whole), raw: whole, whole }
}

/**
 * Takes what the engine hands `ai`, the version that is called, and a model of the provider `service`. Answers its
 * provider: one call of a service, as a model. A model that states `job` starts its work with `begin`, whose job is
 * the input of its check, and `check` makes the second call until `done` or `failed` fits what it answered:
 * `failed` is T7104.
 */
export function serviceProvider(env: AiEnv, version: string, model: Record<string, unknown>): Provider {
  const name = String(model.name)
  if (!isStored(model.job))
    return {
      async call(o) {
        const { output, units, raw } = await called(env, o, callName(o.model.call, name), o.input)
        return { output, ...(units ? { units } : {}), raw }
      },
    }
  const job = model.job
  return {
    async begin(o) {
      const { whole } = await called(env, o, callName(o.model.call, name), o.input)
      const check = callName(job.check, name)
      // Each input field of the check is read from the start's whole answer, by `with`, or from the field of its name.
      const paths: Record<string, unknown> = isStored(job.with) ? job.with : {}
      const fields = Object.keys(Object(callRecordOf(env.description(version), check).input))
      const input = Object.fromEntries(
        fields.map((field) => [field, valueAt(whole, typeof paths[field] === 'string' ? String(paths[field]) : field)]),
      )
      return { job: JSON.stringify({ check, input }) }
    },
    async check(o) {
      const held: unknown = JSON.parse(o.job)
      const named = isStored(held) ? held : {}
      const { output, units, raw, whole } = await called(env, o, String(named.check), named.input, true)
      if (isFilter(job.failed) && matches(job.failed, whole))
        throw new TentError('T7104', `The job of the model ${name} failed, as its \`failed\` says.`, {
          fix: 'Read what its check answered in the log of the model calls.',
        })
      if (isFilter(job.done) && matches(job.done, whole)) return { output, ...(units ? { units } : {}), raw }
      return { wait: typeof job.every === 'number' ? job.every : 5000 }
    },
  }
}
