import { TentError } from '../../core/index.ts'
import { list } from '../admin/list.ts'
import type { Address } from '../door/address.ts'
import { adminClosed, adminWords } from '../door/adminAsked.ts'
import { fromCommands } from '../door/adminCaller.ts'
import { failureOf } from '../door/failure.ts'
import { adminGiven } from '../given.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { isProofNumber, tokenProof } from '../proof.ts'
import { bodyOf } from '../web/body.ts'
import { readJson } from '../web/json.ts'
import type { About } from '../web/proxy.ts'
import { jsonAnswer, okAnswer, wireError } from '../wire.ts'
import { sentKey } from '../keys/form.ts'
import { operated } from './operated.ts'
import { isWritten } from '../../core/internal.ts'

const prefix = '/_t/admin/'

const notFound = (name: string): TentError =>
  new TentError('T0001', `The engine has no command ${JSON.stringify(name).slice(0, 60)}.`, {
    fix: 'See `tent docs commands` for the commands of this version.',
  })

/**
 * Finds a command of the channel by the name in the address, and by `what` of its words where the command is a
 * folder of several. A name is letters, digits and hyphens: one that holds a slash or dots is no command.
 */
async function found(
  o: Opened,
  name: string,
  args: Record<string, unknown>,
): Promise<{ run(o: Opened, args: object): unknown }> {
  if (!/^[a-z][a-zA-Z0-9-]*$/.test(name)) throw notFound(name)
  // A command that a part above the engine gave stands in front of the engine's own of that name.
  const given = adminGiven(o, name)
  if (given) return { run: (app, words) => given.run(app.app, words) }
  const what = typeof args.what === 'string' && /^[a-z][a-zA-Z0-9-]*$/.test(args.what) ? args.what : ''
  const entry = list.find((one) => one.name === name) ?? list.find((one) => one.name === `${name}/${what}`)
  if (!entry) throw notFound(what === '' ? name : `${name} ${what}`)
  return (await entry.load()).admin
}

/** The answer to a command that failed: the wire error with its full message, whatever the mode, since whoever holds the token holds the data. */
function failed(o: Opened, name: string, error: unknown): Response {
  const { ref } = failureOf(o, `admin ${name}`, error)
  const { status, error: sent } = wireError(error, true, { ...(ref ? { ref } : {}), command: true })
  return jsonAnswer(status, { ok: false, error: sent })
}

/**
 * `POST /_t/admin`: the engine proves that it holds its token, before a command sends the token. The body is
 * `{ "number": "<64 characters of base sixteen>" }`, a number that the command drew, and the answer is
 * `{ proof }`, the fingerprint of the token with that number. No token is asked: what is answered tells nothing
 * of the token. It is answered on a request of this computer that came through no proxy, as a command is.
 */
async function proved(o: Opened, request: Request, about: About): Promise<Response> {
  if (!fromCommands(about)) return failed(o, 'prove', adminClosed())
  try {
    const body = readJson(await bodyOf(request, limitOf(o.description, 'callSize')))
    if (!isWritten(body) || !isProofNumber(body.number) || Object.keys(body).length !== 1)
      throw new TentError(
        'T0002',
        'An engine is asked with one record: { "number": "<64 characters of base sixteen>" }.',
        {
          fields: { number: 'type' },
        },
      )
    return okAnswer({ proof: tokenProof(o.token, body.number) })
  } catch (error) {
    return failed(o, 'prove', error)
  }
}

/**
 * `POST /_t/admin/<command>`: a command of this computer. It passes step 1 of the door, then the admin token, on a
 * request of this computer that came through no proxy. Its body is `{ "args": { ... } }`, and it is answered in
 * the wire form with the value of the command. `POST /_t/admin`, with no command, is the question of `proved`.
 */
export const address: Address = {
  order: 1,
  match(request) {
    const { pathname } = new URL(request.url)
    if (request.method !== 'POST') return false
    if (pathname === '/_t/admin') return { prove: true }
    if (!pathname.startsWith(prefix)) return false
    const name = pathname.slice(prefix.length)
    // A key, and no admin token, asks the run commands and the log of an app on a server: another address takes it.
    if (operated.includes(name) && sentKey(request) !== undefined) return false
    return { name }
  },
  steps: [1],
  async handle({ app, request, about, matched }) {
    if (Reflect.get(matched, 'prove') === true) return proved(app, request, about)
    const name = String(Reflect.get(matched, 'name'))
    try {
      const args = await adminWords(request, about, app.token, limitOf(app.description, 'callSize'))
      const command = await found(app, name, args)
      return okAnswer((await command.run(app, args)) ?? null)
    } catch (error) {
      return failed(app, name, error)
    }
  },
}
