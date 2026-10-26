import { TentError } from '../../core/index.ts'
import type { App } from '../app.ts'
import { called } from '../door/call.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { callerNamed } from '../program.ts'
import { readerCarries } from '../onlyReads.ts'
import { appModelCall } from '../ai/appCall.ts'
import { servedBy, versionGone } from '../versions.ts'
import { releasedFor } from '../gradual/served.ts'
import { shownFailure } from '../failed/failure.ts'

/**
 * `app.call`: a function called through steps 5 to 10 of the door, with no web request. An error that is no
 * `TentError` is the fault of the code of the app: the promise is refused with T0009, and the error is its cause.
 * On a reader a query is answered there, and anything else is the writer's.
 */
export const member =
  (o: Opened): App['call'] =>
  async (name, input, how) => {
    heldOpen(o)
    const caller = callerNamed(Reflect.get(Object(how), 'as'))
    const named = typeof name === 'string' ? name : String(Reflect.get(Object(name), 'definition'))
    // A model call is made here, as a program makes it: the model layer counts it where it is made.
    const model = appModelCall(o, named, input, caller)
    if (model) return model
    const reads = readerCarries(o, named)
    // A loadable version that is not the running one answers too: a publish asks its health check of it so.
    const asked: unknown = Reflect.get(Object(how), 'version')
    // While a release goes, a call that names no version is served by the version its caller is given: on a
    // reader only what it answers itself, since the writer gives what it hands on its own.
    const served = asked !== undefined ? servedBy(o, asked) : o.machine.reader && !reads ? o : releasedFor(o, caller)
    if (!served) throw versionGone(asked)
    try {
      if (served !== o) return await called(served, named, input, { caller, own: true, waits: true })
      return await o.machine.sent('call', [named, input], caller, reads, () =>
        called(o, named, input, { caller, own: true, waits: true }),
      )
    } catch (error) {
      if (error instanceof TentError) throw error
      // In development and in a test, the definition and the line of its source, as the overlay names them.
      const place = o.mode === 'live' ? undefined : shownFailure(o, named, error).where
      const failed = new TentError('T0009', error instanceof Error ? error.message : String(error), {
        fix: 'The code of the app failed: the log holds the error with its trace.',
        ...(place ? { where: { file: place.file, line: place.line, definition: named } } : {}),
      })
      failed.cause = error
      throw failed
    }
  }
