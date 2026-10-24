import { TentError } from '../../core/index.ts'
import { pythonFailed } from './values.ts'

/** A size in bytes as a person reads it: in MB, whole. */
const inMb = (bytes: number): string => `${Math.round(bytes / 1_048_576)} MB`

/**
 * Takes the name of a `python`, the error that its Python program sent for a call, the errors of the calls that
 * Python made, by the number of their asking, and what its `run` was handed. Answers the error as the caller is
 * to see it: the app's own failure for `tent.Fail`, an error of a call that Python let out as itself, the hand-back
 * of a task for `tent.Back`, T7119 for a value with no plain form and for any other error, with its Python trace.
 */
export function pythonFailureOf(
  name: string,
  error: unknown,
  asked: Map<number, unknown>,
  handed: Record<string, unknown>,
): unknown {
  const kind = Reflect.get(Object(error), 'kind')
  const said = (key: string): string => String(Reflect.get(Object(error), key) ?? '')
  if (kind === 'fail') {
    const fields = Object.fromEntries(
      Object.entries(Object(Reflect.get(Object(error), 'fields'))).map(([key, value]) => [key, String(value)]),
    )
    return new TentError(said('code'), said('message'), Object.keys(fields).length ? { fields } : {})
  }
  if (kind === 'back') {
    const back: unknown = handed.back
    if (typeof back === 'function')
      try {
        back()
      } catch (thrown) {
        return thrown
      }
    return pythonFailed(`${name} raised tent.Back, and its work is no task that can be handed back.`)
  }
  if (kind === 'wire') {
    const wire: unknown = Reflect.get(Object(error), 'error')
    const own = asked.get(Number(Reflect.get(Object(wire), 'ask')))
    if (own !== undefined) return own
    return new TentError(String(Reflect.get(Object(wire), 'code')), String(Reflect.get(Object(wire), 'message')))
  }
  if (kind === 'tent') return new TentError(said('code'), said('message'))
  if (kind === 'plain')
    return pythonFailed(
      `${name} answered at ${said('field')} a value that has no plain form: no text, number, list or record.`,
    )
  const failed = pythonFailed(`The code of ${name} raised an error: ${said('message')}`)
  // The log keeps the Python trace in the place of the trace of the engine.
  failed.stack = `${failed.name}: ${failed.message}\n${said('trace')}`
  return failed
}

/** The error of a call whose Python program ended in the middle of it, by why it ended, where the engine knows. */
export function endedOf(name: string, why: string): TentError {
  if (why.startsWith('memory:'))
    return pythonFailed(
      `${name} passed its memory limit of ${inMb(Number(why.slice('memory:'.length)))}, and its Python program was ended.`,
      'Give the definition a larger `limits.memory`, or let it hold less at one time.',
    )
  if (why.startsWith('frame:'))
    return pythonFailed(`The Python program of ${name} sent ${why.slice('frame:'.length)}, and was ended.`)
  return pythonFailed(`The Python program of ${name} ended in the middle of its call.`)
}
