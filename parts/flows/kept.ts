import { TentError } from '../core/index.ts'
import type { CodeRow } from '../core/internal.ts'
import { codes, isWritten } from '../core/internal.ts'

const registry: Record<string, CodeRow> = codes

/**
 * Takes what a step answered. Answers it as it is saved, plain data in which a moment is text in the standard
 * form, with its size in bytes as it is stored. Nothing is saved as nothing.
 */
export function asSaved(value: unknown): { value: unknown; size: number } {
  const text = value === undefined ? undefined : JSON.stringify(value)
  if (text === undefined) return { value: undefined, size: 0 }
  return { value: JSON.parse(text), size: Buffer.byteLength(text) }
}

/** The codes of the framework that a second try would only repeat, beside those whose status says so. */
const neverAgain = ['T7111', 'T7116', 'T0019', 'T0022']

/** The statuses of a framework error that a second try would only repeat. */
const repeats = [400, 401, 403, 404, 409, 413]

/**
 * Whether a step that failed with this error is tried again: not for an app's own `fail`, a framework error whose
 * status says that a second try would only repeat it, and the four codes that are named for it.
 */
export function isTriedAgain(error: unknown): boolean {
  if (!(error instanceof TentError)) return true
  if (!Object.hasOwn(registry, error.code)) return false
  if (neverAgain.includes(error.code)) return false
  const status = registry[error.code].status
  return status === undefined || !repeats.includes(status)
}

/**
 * Takes what was thrown. Answers what a row keeps of it: the code, the short word and the message, with the fix
 * and the fields where it has them. The place of a call that waits for a yes is never kept: it belongs to the one
 * refusal that carried it. An error that is no `TentError` is kept as an error in app code.
 */
export function keptError(error: unknown): Record<string, unknown> {
  // The reference under which the log holds an error, where the engine gave it one.
  const ref: unknown = Reflect.get(Object(error), 'ref')
  const referred = typeof ref === 'string' ? { ref } : {}
  if (error instanceof TentError)
    return {
      code: error.code,
      name: error.name,
      message: error.message,
      ...(error.fix === undefined ? {} : { fix: error.fix }),
      ...(error.fields === undefined ? {} : { fields: error.fields }),
      ...referred,
    }
  return {
    code: 'T0009',
    name: 'internal',
    message: error instanceof Error ? error.message : String(error),
    ...referred,
  }
}

/** Takes what a row keeps of an error. Answers the error again, as what is thrown. */
export function thrownOf(kept: unknown): TentError {
  const held = isWritten(kept) ? kept : {}
  const fields = isWritten(held.fields)
    ? Object.fromEntries(Object.entries(held.fields).map(([name, check]) => [name, String(check)]))
    : undefined
  const thrown = new TentError(String(held.code ?? 'T0009'), String(held.message ?? codes.T0009.sentence), {
    ...(typeof held.fix === 'string' ? { fix: held.fix } : {}),
    ...(fields ? { fields } : {}),
  })
  if (typeof held.ref === 'string') Reflect.set(thrown, 'ref', held.ref)
  return thrown
}

/**
 * Takes what a row keeps of an error. Answers what a caller would see of it: an app's own `fail` and a code that
 * has a status as they are, and anything else as the code for what is not a caller's to see, with its sentence.
 */
export function seenOf(kept: unknown): { code: string; message: string } {
  const held = isWritten(kept) ? kept : {}
  const code = String(held.code ?? 'T0009')
  const shown = code !== 'T0009' && (!Object.hasOwn(registry, code) || registry[code].status !== undefined)
  return shown ? { code, message: String(held.message ?? '') } : { code: 'T0009', message: codes.T0009.sentence }
}
