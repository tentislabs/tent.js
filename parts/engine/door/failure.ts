import { randomBytes } from 'node:crypto'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { codes } from '../../core/internal.ts'
import type { Opened } from '../opened.ts'
import { callerOf } from './rule.ts'

// The ref of each error that a caller is not shown, so that an error which passes several functions is kept once.
const refs = new WeakMap<object, string>()

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'

/** Eight characters that find an error in the log. */
export const newRef = (): string => Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join('')

/** Keeps the ref under which an error was written into the log elsewhere, as on a query thread, so that it is kept once. */
export function keepRef(error: object, ref: string): void {
  refs.set(error, ref)
}

/** The status that the registry gives a code of the framework, or nothing for a code that has none or is no code of ours. */
export function statusOf(code: string): number | undefined {
  const row: unknown = Object.hasOwn(codes, code) ? Reflect.get(codes, code) : undefined
  const status: unknown = Reflect.get(Object(row), 'status')
  return typeof status === 'number' ? status : undefined
}

/**
 * Whether an error is the caller's to see as it is: a code of the framework that has a status, but for T0009
 * itself, or an own `fail` of the app, whose code is no code of ours.
 */
export const isShown = (error: unknown): error is TentError =>
  error instanceof TentError &&
  error.code !== 'T0009' &&
  (!Object.hasOwn(codes, error.code) || statusOf(error.code) !== undefined)

/**
 * The name that the log writes for what was asked: the name of a function of the app as it is, and of anything
 * else, which a caller may have sent at any length, its first 64 characters.
 */
export const logName = (o: Opened, name: string): string =>
  Object.hasOwn(o.description.functions, name) ? name : name.slice(0, 64)

/**
 * Takes an app, the name of what failed, and the error. Answers what the log holds of the failure: its code, and
 * for an error that is not the caller's to see a ref, under which the error is written into `errors` with its
 * trace, once.
 */
export function failureOf(o: Opened, name: string, error: unknown): { code: string; ref?: string } {
  const code = error instanceof TentError ? error.code : 'T0009'
  if (isShown(error)) return { code }
  const held = typeof error === 'object' && error !== null ? refs.get(error) : undefined
  if (held) return { code, ref: held }
  const ref = newRef()
  if (typeof error === 'object' && error !== null) refs.set(error, ref)
  const [message, stack] = error instanceof Error ? [error.message, error.stack] : [String(error), undefined]
  o.log.write('errors', { ref, at: o.clock.now(), name: logName(o, name), message, stack })
  // In development a failure while running is shown on the open pages too, by the place in the project's source.
  if (o.mode === 'development')
    void import('../failed/shown.ts').then((one) => one.failedHere(o, logName(o, name), error)).catch(() => undefined)
  return { code, ref }
}

/**
 * Writes a call into the log, which is step 10 of the door: its name, its kind where a function was found, its
 * caller, the time it took, whether it worked, and for a failure its code and its ref. Answers the row it wrote.
 */
export function logCall(
  o: Opened,
  call: { name: string; kind?: string; caller: Caller; began: number; error?: unknown },
): { at: number; ms: number } {
  const failure = call.error === undefined ? {} : failureOf(o, call.name, call.error)
  const ms = Math.round(performance.now() - call.began)
  const at = o.clock.now()
  const row = { at, app: o.name, name: logName(o, call.name), kind: call.kind, ...callerOf(call.caller), ms }
  // A request that a reader handed on is written under the ref of the reader's own line, so that both logs find it.
  const handed = o.machine.asked()?.ref
  o.log.write('calls', { ...row, ok: call.error === undefined, ...failure, ...(handed ? { ref: handed } : {}) })
  return { at, ms }
}

/** Tells a failed call to the log and to whoever listens: what the door does for a call it refused before a function was found. */
export function refusedCall(o: Opened, name: string, caller: Caller, began: number, error: unknown): void {
  logCall(o, { name, caller, began, error })
  o.raise('call.failed', { app: o.app, name, caller, error })
}
