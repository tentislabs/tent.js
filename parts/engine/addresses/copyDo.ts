import { TentError } from '../../core/index.ts'
import { admin as runs } from '../admin/runs.ts'
import { noLink } from '../noLink.ts'
import type { Address } from '../door/address.ts'
import { placeOf } from '../held.ts'
import { limitOf } from '../limits.ts'
import { sessionHanded } from '../sessions.ts'
import { callerNamed } from '../program.ts'
import { bodyOf } from '../web/body.ts'
import { readJson } from '../web/json.ts'
import { keyed } from '../door/keyed.ts'
import { errorAnswer, jsonAnswer, okAnswer, wireError } from '../wire.ts'
import { isWritten } from '../../core/internal.ts'

// The members of an app that a reader sends to its writer, where code asked the reader for them.
const members = ['call', 'write', 'seed', 'read', 'page', 'start', 'runs', 'session']

/**
 * `POST /_t/copy/do`: on test data only, and not found on live data. `{ member, args, as }`: a member of an app
 * that code asked a reader for and that only the writer carries out. The writer carries it out as `app.<member>`
 * does, as the caller that the code named, and answers what it answers, in the wire form with the full message.
 */
export const address: Address = {
  order: 1,
  match: (request) => request.method === 'POST' && new URL(request.url).pathname === '/_t/copy/do' && {},
  steps: [1, 2, 3, 10],
  handle: (reached) =>
    keyed(
      reached,
      'copy/do',
      async () => {
        const { app, request } = reached
        // Without the key of a reader, on live data and on a machine that is no writer, the address is not found.
        if (app.mode === 'live' || !app.machine.writer) throw noLink()
        const told = readJson(await bodyOf(request, limitOf(app.description, 'callSize')))
        if (
          !isWritten(told) ||
          typeof told.member !== 'string' ||
          !members.includes(told.member) ||
          !Array.isArray(told.args)
        )
          throw new TentError('T0002', 'A member that a reader sends on is { "member", "args", "as" }.', {
            fields: { member: 'type' },
          })
        const as = { as: callerNamed(told.as) }
        const [first, second]: unknown[] = told.args
        const { call, page, read, seed, start, write } = app.app
        // A session is answered with the number of its write, which the reader waits to hold.
        if (told.member === 'session') {
          sessionHanded(app, first)
          return okAnswer({ n: placeOf(app).n })
        }
        if (told.member === 'start') return okAnswer(await start(String(first), second, as))
        // What answers, moves or stops a run is told as the command `runs` is, by its words.
        if (told.member === 'runs') return okAnswer((await runs.run(app, Object(first))) ?? null)
        if (told.member === 'page') return okAnswer(await page(String(first), as))
        if (told.member === 'call') return okAnswer((await call(String(first), second, as)) ?? null)
        if (told.member === 'read') return okAnswer((await read(Object(first), as)) ?? null)
        if (told.member === 'write') return okAnswer((await write(Array.isArray(first) ? first : [], as)) ?? null)
        await seed()
        return okAnswer(null)
      },
      (error) => {
        // An address that is not there is told as one, as it is to a request with no key.
        if (error instanceof TentError && error.code === 'T0001') return errorAnswer(reached.app, 'copy/do', error)
        // A reader throws to its own code what its writer threw: the code and the words travel as they are, since
        // whoever holds the key of a reader holds the data.
        if (!(error instanceof TentError)) return jsonAnswer(500, { ok: false, error: wireError(error, true).error })
        const { code, name, message, fix, fields } = error
        return jsonAnswer(409, { ok: false, error: { code, name, message, fix, fields } })
      },
    ),
}
