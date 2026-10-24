import { TentError } from '../../core/index.ts'
import type { Caller } from '../../core/index.ts'
import { project } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { describe } from '../../core/internal.ts'
import type { ConnectEnv, Signer, Stream } from '../env.ts'
import { guardedFetch } from '../guardedFetch.ts'
import { createServices } from '../services.ts'

/** A file that a test hands the services, or that a call stored: its name, its kind and its bytes. */
interface HeldFile {
  name: string
  kind: string
  bytes: Uint8Array<ArrayBuffer>
  // Who may download it: every caller where it is left out.
  of?: string
}

/** What the services of a test were handed and what they did: the rows of the log, the waits, the files. */
export interface Calling {
  call(service: string, call: string, input: unknown, o?: { caller?: Caller; signal?: AbortSignal }): Promise<unknown>
  logged: { service: string; call: string; status?: number; ms: number }[]
  slept: number[]
  files: Map<string, HeldFile>
  // The moment that the clock of the test stands at, which a wait moves on.
  at(): number
  description: Description
}

/** What a test says of the services it calls. */
export interface CallingOptions {
  secrets?: Record<string, string>
  signers?: Record<string, Signer>
  once?: () => string | undefined
  standIn?: (service: string) => object | undefined
  files?: Record<string, HeldFile>
  // Where waits pass at once and move the clock of the test; with `real`, a wait takes its time.
  real?: true
  // The settings of the app, by their names.
  settings?: Record<string, unknown>
}

const system: Caller = { kind: 'system' }

/** The bytes of a stream, read to its end. */
export async function bytesOf(stream: Stream): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * Describes the definitions of a test, held in memory with a project, and answers the services over that
 * description: on this computer, in the mode `development`, with the secrets, the signers and the files the
 * test names, and a clock that a wait moves on at once.
 */
export function calling(definitions: object[], o: CallingOptions = {}): Calling {
  const described = describe({
    definitions: [{ value: project('testedApp', {}) }, ...definitions.map((value) => ({ value }))],
  })
  const errors = described.findings.filter((one) => one.level === 'error')
  if (errors.length) throw new Error(`the definitions of the test do not describe: ${errors.map((one) => one.message)}`)
  const { description } = described
  const logged: Calling['logged'] = []
  const slept: number[] = []
  const files = new Map<string, HeldFile>(Object.entries(o.files ?? {}))
  let moment = Date.UTC(2032, 0, 1)
  const held = (id: string, caller: Caller): HeldFile => {
    const one = files.get(id)
    const user = caller.user?.id ?? caller.kind
    if (!one || (one.of !== undefined && one.of !== user && caller.kind !== 'system'))
      throw new TentError('T2104', `No file ${id} can be read by this caller.`)
    return one
  }
  const env: ConnectEnv = {
    description: () => description,
    fetch: guardedFetch({ mode: 'development', bodyTravels: true }),
    secret(name) {
      const value = o.secrets?.[name]
      if (value === undefined) throw new TentError('T0019', `The secret ${name} has no value.`)
      return value
    },
    tokens: { read: () => undefined, write: () => undefined },
    signers: o.signers ?? {},
    verifiers: {},
    setting: (name) => o.settings?.[name],
    ...(o.standIn ? { standIn: o.standIn } : {}),
    once: o.once ?? (() => undefined),
    files: {
      stream: async (id, caller) => new Blob([held(id, caller).bytes]).stream(),
      info: (id, caller) => {
        const one = held(id, caller)
        return { name: one.name, kind: one.kind, size: one.bytes.length }
      },
      async put(bytes, info, by) {
        const id = `f${files.size + 1}`
        const user = by.caller.user?.id ?? by.caller.kind
        files.set(id, { ...info, bytes: await bytesOf(bytes), of: user })
        return id
      },
    },
    logged: (row) => void logged.push(row),
    now: () => (o.real ? Date.now() : moment),
    sleep(ms) {
      slept.push(ms)
      if (o.real) return new Promise((done) => setTimeout(done, ms))
      moment += ms
      return Promise.resolve()
    },
  }
  const services = createServices(env)
  return {
    call: (service, call, input, at = {}) =>
      services.call(service, call, input, {
        caller: at.caller ?? system,
        version: 'v1',
        signal: at.signal ?? new AbortController().signal,
      }),
    logged,
    slept,
    files,
    at: () => moment,
    description,
  }
}

/** The code that a call failed with, or `ok` where it worked. */
export const codeOf = (call: Promise<unknown>): Promise<string> =>
  call.then(
    () => 'ok',
    (error) => String(Reflect.get(Object(error), 'code')),
  )
