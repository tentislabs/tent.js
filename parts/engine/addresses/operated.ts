import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Address } from '../door/address.ts'
import { failureOf } from '../door/failure.ts'
import { keyIn } from '../keys/caller.ts'
import { sentKey } from '../keys/form.ts'
import { holdsRight } from '../keys/rights.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { bodyOf } from '../web/body.ts'
import { readJson } from '../web/json.ts'
import { jsonAnswer, okAnswer, wireError } from '../wire.ts'
import { logShown, runShown } from '../keys/unvalued.ts'
import { isWritten } from '../../core/internal.ts'

const prefix = '/_t/admin/'

/** The commands of the admin channel that a key of the right `operate` reaches: the run commands and the log. */
export const operated = ['runs', 'logs']

/** What every refusal says, so that it tells nothing of what was wrong: the words of the admin channel. */
const closed = (): TentError =>
  new TentError('T0006', 'The commands of an engine are for whoever started it.', {
    fix: 'Reach a server with a key of the right `operate`, which `tent access key add <name> --right operate` makes there, for `tent runs` and `tent logs` alone.',
  })

/** The answer to a command that failed, in the wire form, with its full words: whoever holds the key operates the app. */
function failed(o: Opened, name: string, error: unknown): Response {
  const { ref } = failureOf(o, `admin ${name}`, error)
  const { status, error: sent } = wireError(error, true, { ...(ref ? { ref } : {}), command: true })
  return jsonAnswer(status, { ok: false, error: sent })
}

/**
 * `POST /_t/admin/runs` and `/_t/admin/logs` with a key of the right `operate`, from anywhere: the run commands
 * and the log of an app on a server, as on this computer. It passes steps 1 to 4 of the door, and `onRequest` as
 * every request. The key is the caller of an act on a run, which is kept in the log with its id. A key without the
 * right, and one of another form, is refused in the words of the admin channel; the mails of the log are refused,
 * and no value of the app is sent: not the words of an error nor the data of a line, nor what a run was handed or answered.
 */
export const address: Address = {
  order: 1,
  match(request) {
    const { pathname } = new URL(request.url)
    if (request.method !== 'POST' || !pathname.startsWith(prefix) || sentKey(request) === undefined) return false
    const name = pathname.slice(prefix.length)
    return operated.includes(name) && { name }
  },
  steps: [1, 2, 3, 4],
  async handle({ app, request, matched }) {
    const name = String(Reflect.get(matched, 'name'))
    const found = keyIn(app, request)
    if (!found?.key.rights || !holdsRight(found.key.rights, ['operate'])) return failed(app, name, closed())
    try {
      const body = readJson(await bodyOf(request, limitOf(app.description, 'callSize')))
      if (!isWritten(body) || !isWritten(body.args) || Object.keys(body).length !== 1)
        throw new TentError('T0002', 'The body of a command is one record: { "args": { ... } }.', {
          fields: { args: 'type' },
        })
      const args = body.args
      if (name === 'logs' && args.mail === true) throw closed()
      const { list } = await import('../admin/list.ts')
      const entry = list.find((one) => one.name === name)
      if (!entry) throw closed()
      const { admin } = await entry.load()
      const what = typeof args.what === 'string' ? args.what : 'list'
      const caller: Caller = found.caller
      const answer: unknown = await admin.run(app, args)
      // An act on a run is the key's: it is kept in the log with the id of the key.
      if (name === 'runs' && !['list', 'show'].includes(what))
        app.log.write('lines', {
          at: app.clock.now(),
          level: 'info',
          message: `runs ${what}`,
          data: JSON.stringify({ run: args.id, key: found.key.id, caller: caller.kind }),
          name: 'admin runs',
          run: typeof args.id === 'string' ? args.id : undefined,
        })
      return okAnswer((name === 'logs' ? logShown(answer) : what === 'show' ? runShown(answer) : answer) ?? null)
    } catch (error) {
      return failed(app, name, error)
    }
  },
}
