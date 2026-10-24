import type { Type } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { checkValue, isStored } from '../../core/internal.ts'
import type { AiEnv, Base, Provider, Result } from '../face.ts'
import { ProviderFailure } from '../../core/internal.ts'
import { callName, callRecordOf } from '../providers/service.ts'
import type { Asking, Tally } from './ask.ts'
import { ask } from './ask.ts'
import type { ModelOf } from './record.ts'
import { cannot, modelOf } from './record.ts'
import { isType } from '../isType.ts'

/** The input and the output of a model that is a function: its own, or those of the service call it is made of. */
function typesOf(env: AiEnv, version: string, model: ModelOf): { input: Type; output?: Type } {
  const call =
    model.stored.provider === 'service' && model.stored.call !== undefined
      ? callRecordOf(env.description(version), callName(model.stored.call, model.name))
      : undefined
  const fields = call ? call.input : model.stored.input
  // With `job`, what the model gives is what its check gives.
  const job = isStored(model.stored.job) ? model.stored.job : undefined
  const check = call && job ? callRecordOf(env.description(version), callName(job.check, model.name)) : undefined
  const output = check ? check.output : call ? call.output : model.stored.output
  const shape: Record<string, Type> = {}
  for (const [name, type] of Object.entries(Object(fields))) if (isType(type)) shape[name] = type
  return { input: { kind: 'object', shape }, ...(isType(output) ? { output } : {}) }
}

/** Whether a value fits a type. */
const fits = (type: Type, value: unknown): boolean => checkValue(type, value).length === 0

/** The input with each `file` of it as `{ bytes, kind, name }`, read as the caller may download it. */
async function withBytes(env: AiEnv, asking: Asking, type: Type, value: unknown): Promise<unknown> {
  if (type.kind === 'file' && typeof value === 'string') {
    const info = env.files.info(value, asking.caller)
    return { bytes: await env.files.bytes(value, asking.caller), kind: info.kind, name: info.name }
  }
  if (type.kind === 'list' && Array.isArray(value) && isType(Reflect.get(type, 'of')))
    return Promise.all(value.map((one) => withBytes(env, asking, Object(Reflect.get(type, 'of')), one)))
  const shape: unknown = Reflect.get(type, 'shape')
  if (type.kind === 'object' && isStored(value) && isStored(shape)) {
    const made: Record<string, unknown> = {}
    for (const [name, one] of Object.entries(value))
      made[name] = isType(shape[name]) ? await withBytes(env, asking, shape[name], one) : one
    return made
  }
  return value
}

/** The output with each `file` that the provider gave as bytes or as an address stored, and its id in its place. */
async function withFiles(env: AiEnv, asking: Asking, type: Type, value: unknown): Promise<unknown> {
  if (type.kind === 'file' && isStored(value)) {
    const run = asking.at?.run
    const by = { caller: asking.caller, ...(run ? { run } : {}) }
    if (value.bytes instanceof Uint8Array) {
      const kind = typeof value.kind === 'string' ? value.kind : 'application/octet-stream'
      return env.files.put(value.bytes, { name: typeof value.name === 'string' ? value.name : 'made', kind }, by)
    }
    if (typeof value.url === 'string') {
      const answer = await env.fetch(value.url, { signal: asking.signal })
      if (!answer.ok) throw new ProviderFailure('server', `The file at ${value.url} could not be fetched.`)
      const kind = (answer.headers.get('content-type') ?? 'application/octet-stream').split(';')[0]
      return env.files.put(new Uint8Array(await answer.arrayBuffer()), { name: 'made', kind }, by)
    }
    return value
  }
  if (type.kind === 'list' && Array.isArray(value) && isType(Reflect.get(type, 'of')))
    return Promise.all(value.map((one) => withFiles(env, asking, Object(Reflect.get(type, 'of')), one)))
  const shape: unknown = Reflect.get(type, 'shape')
  if (type.kind === 'object' && isStored(value) && isStored(shape)) {
    const made: Record<string, unknown> = {}
    for (const [name, one] of Object.entries(value))
      made[name] = isType(shape[name]) ? await withFiles(env, asking, shape[name], one) : one
    return made
  }
  return value
}

/** What a long job keeps in a step: the job, the model that began it, and when it was begun, on the engine's clock. */
interface KeptJob {
  job: string
  model: string
  begunAt: number
}

const isKeptJob = (value: unknown): value is KeptJob =>
  isStored(value) &&
  typeof value.job === 'string' &&
  typeof value.model === 'string' &&
  typeof value.begunAt === 'number'

/**
 * A long job: `begin`, then `check` after the wait it names, until it gives the result. Inside a step the job is
 * handed to the engine to keep, so a step that runs again goes on with it. The whole job is held to the model's
 * time on the engine's clock: past it the call fails, and is given to no second model.
 */
async function jobDone(
  env: AiEnv,
  provider: Provider,
  model: ModelOf,
  base: Base,
  tally: Tally,
  input: unknown,
  kept?: KeptJob,
): Promise<Result> {
  if (!provider.begin || !provider.check) throw cannot(model.name, 'a long job')
  let held = kept
  if (!held) {
    const { job } = await provider.begin({ ...base, input })
    held = { job, model: model.name, begunAt: env.now() }
    tally.begun = true
    env.keep(held)
  }
  tally.begun = true
  for (;;) {
    if (env.now() - held.begunAt > model.time)
      throw new ProviderFailure('slow', `The job of the model ${model.name} passed its time after it was begun.`)
    const checked = await provider.check({ ...base, job: held.job })
    if ('output' in checked) return checked
    await env.sleep(Math.max(0, checked.wait))
  }
}

/**
 * Takes a model call and the input of a model that is a function. Checks the input against the model's `input`
 * (T0002), hands each file in it to the provider as its bytes, and asks the provider: through `begin` and `check`
 * where it has them, and through `call` otherwise. Stores each file of the answer, and checks the answer against
 * the model's `output` (T7108). Answers the output.
 */
export async function calledAsFunction(asking: Asking, given: unknown): Promise<unknown> {
  const { env, version } = asking
  const asked = modelOf(env.description(version), asking.model)
  if (!asked.isFunction) throw cannot(asked.name, 'a call as a function')
  const { input } = typesOf(env, version, asked)
  const found = checkValue(input, given)
  if (found.length)
    throw new TentError('T0002', `The input of the model ${asked.name} does not fit: ${found[0].message}`, {
      fields: Object.assign({}, ...found.map((one) => one.fields ?? {})),
      fix: 'Give each field of the input a value of its declared type, and no field that is not declared.',
    })
  const kept: unknown = env.kept()
  const goesOn = isKeptJob(kept) ? kept : undefined
  const handed = await withBytes(env, asking, input, given)
  const result = await ask(
    {
      ...asking,
      ...(goesOn ? { only: goesOn.model } : {}),
      fits: (model) => fits(typesOf(env, version, model).input, given),
    },
    async ({ provider, model, base, tally }) => {
      tally.units.calls = 1
      const own = typesOf(env, version, model)
      const long = provider.begin !== undefined && provider.check !== undefined
      if (!long && !provider.call) throw cannot(model.name, 'a call as a function')
      const result =
        long || !provider.call
          ? await jobDone(env, provider, model, base, tally, handed, goesOn)
          : await provider.call({ ...base, input: handed })
      Object.assign(tally.units, result.units ?? {})
      if (result.raw !== undefined) tally.raw = result.raw
      const output = own.output ? await withFiles(env, asking, own.output, result.output) : result.output
      if (own.output) {
        const missed = checkValue(own.output, output)
        if (missed.length)
          throw new TentError(
            'T7108',
            `The answer of the model ${model.name} does not fit its output: ${missed.map((one) => one.message).join(' ')}`,
            { fix: 'State an `output` that the answer fits, or ask a model that keeps to it.' },
          )
      }
      return output
    },
  )
  return result
}
