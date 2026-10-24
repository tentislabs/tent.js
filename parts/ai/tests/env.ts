import { guardedFetch } from '../../connect/index.ts'
import type { Caller } from '../../core/index.ts'
import { project, TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { describe } from '../../core/internal.ts'
import type { AiEnv, Method, Provider, Used } from '../index.ts'
import { modelCall } from '../index.ts'

/** A file that a test hands the model layer, or that a call stored: its name, its kind, its bytes, and whose it is. */
interface HeldFile {
  name: string
  kind: string
  bytes: Uint8Array
  // Who may download it: every caller where it is left out.
  of?: string
}

/** What the model layer of a test was handed and did: each try it told, the waits, the files, the kept value. */
export interface Layer {
  env: AiEnv
  used: Used[]
  slept: number[]
  files: Map<string, HeldFile>
  kept: { value?: unknown }
  description: Description
  // Moves the clock of the test on.
  advance(ms: number): void
  /** A model call, as app code makes it: `writer.reply(...)` is `call('writer', 'reply', [...])`. */
  call(
    model: string,
    method: Method,
    args: unknown[],
    o?: { caller?: Caller; signal?: AbortSignal; at?: { run: string; step: string; repeat: number } },
  ): unknown
}

/** What a test says of the model layer it calls. */
export interface LayerOptions {
  secrets?: Record<string, string>
  providers?: Record<string, Provider>
  standIns?: Record<string, Provider>
  files?: Record<string, HeldFile>
  // What `allow` does before each call to a provider: it may throw T7102.
  allow?: (o: { model: string; caller: Caller }) => void
  // The answer of `call` of the env: the service calls of a model over one, by their names.
  calls?: Record<string, (input: unknown, how: unknown) => unknown>
  // Where waits pass at once and move the clock of the test; with `real`, a wait takes its time.
  real?: true
}

const system: Caller = { kind: 'system' }

/**
 * Describes the definitions of a test, held in memory with a project, and answers the model layer over that
 * description: on this computer, through the guarded fetch in the mode `development`, with the secrets, the
 * providers and the files the test names, a clock that a wait moves on at once, and what a step keeps in memory.
 */
export function layerOf(definitions: object[], o: LayerOptions = {}): Layer {
  const described = describe({
    definitions: [{ value: project('testedApp', {}) }, ...definitions.map((value) => ({ value }))],
  })
  const errors = described.findings.filter((one) => one.level === 'error')
  if (errors.length) throw new Error(`the definitions of the test do not describe: ${errors.map((one) => one.message)}`)
  const { description } = described
  const used: Used[] = []
  const slept: number[] = []
  const files = new Map<string, HeldFile>(Object.entries(o.files ?? {}))
  const kept: { value?: unknown } = {}
  let moment = Date.UTC(2032, 0, 1)
  const held = (id: string, caller: Caller): HeldFile => {
    const one = files.get(id)
    const user = caller.user?.id ?? caller.kind
    if (!one || (one.of !== undefined && one.of !== user && caller.kind !== 'system'))
      throw new TentError('T2104', `No file ${id} can be read by this caller.`)
    return one
  }
  const env: AiEnv = {
    description: () => description,
    fetch: guardedFetch({ mode: 'development', bodyTravels: true }),
    secret(name) {
      const value = o.secrets?.[name]
      if (value === undefined) throw new TentError('T0019', `The secret ${name} has no value.`)
      return value
    },
    allow: (asked) => o.allow?.(asked),
    used: (one) => void used.push(one),
    call(name, args) {
      const call = o.calls?.[name]
      if (!call) throw new TentError('T0001', `The test answers no call ${name}.`)
      return call(args[0], args[1])
    },
    tell: () => undefined,
    files: {
      text: async (id, caller) => new TextDecoder().decode(held(id, caller).bytes),
      bytes: async (id, caller) => held(id, caller).bytes,
      async put(bytes, info, by) {
        const id = `f${files.size + 1}`
        files.set(id, { ...info, bytes, of: by.caller.user?.id ?? by.caller.kind })
        return id
      },
      info(id, caller) {
        const one = held(id, caller)
        return { name: one.name, kind: one.kind, size: one.bytes.length }
      },
    },
    providers: o.providers ?? {},
    standIn: (model) => o.standIns?.[model],
    sources: {},
    now: () => (o.real ? Date.now() : moment),
    sleep(ms) {
      slept.push(ms)
      if (o.real) return new Promise((done) => setTimeout(done, ms))
      moment += ms
      return Promise.resolve()
    },
    kept: () => kept.value,
    keep(value) {
      kept.value = value
    },
    may: () => undefined,
  }
  return {
    env,
    used,
    slept,
    files,
    kept,
    description,
    advance(ms) {
      moment += ms
    },
    call: (model, method, args, at = {}) =>
      modelCall(env, {
        model,
        method,
        args,
        caller: at.caller ?? system,
        version: 'v1',
        signal: at.signal ?? new AbortController().signal,
        ...(at.at ? { at: at.at } : {}),
      }),
  }
}

/** The code that a call failed with, or `ok` where it worked. */
export const codeOf = (call: unknown): Promise<string> =>
  Promise.resolve(call).then(
    () => 'ok',
    (error) => String(Reflect.get(Object(error), 'code')),
  )
