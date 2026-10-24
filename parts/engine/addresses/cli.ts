import { mayDescribe } from './apiDescribed.ts'
import { commandList, hasCommands } from '../cli/commands.ts'
import type { Address } from '../door/address.ts'
import { logCall, refusedCall } from '../door/failure.ts'
import { keyAt } from '../keys/kept.ts'
import { visit } from '../visit.ts'
import { errorAnswer, okAnswer } from '../wire.ts'

const paths = ['/_t/cli', '/_t/cli/me']

/**
 * `GET /_t/cli`: what the runner of the command line knows of the app, the list of its commands, under
 * `describeTo`; with `?have=<version>` it answers `{ same: true }` while that version runs. `GET /_t/cli/me`: who
 * the caller is, open to every caller. Both pass steps 1 to 4 and 10 of the door. An app that offers nothing to
 * the command line, and holds no command, has neither.
 */
export const address: Address = {
  order: 1,
  match(request) {
    const { pathname } = new URL(request.url)
    const o = visit()?.app
    return (
      request.method === 'GET' && paths.includes(pathname) && !!o && hasCommands(o.description) && { name: pathname }
    )
  },
  steps: [1, 2, 3, 4, 10],
  async handle({ app: o, request, caller, began }) {
    const url = new URL(request.url)
    try {
      if (url.pathname === '/_t/cli/me') {
        const key = caller.key && keyAt(o, caller.key.id)?.key
        logCall(o, { name: url.pathname, caller, began })
        return okAnswer({
          ...(caller.user ? { user: { id: caller.user.id, roles: caller.user.roles } } : {}),
          ...(caller.key ? { key: { id: caller.key.id, name: key?.name ?? '', roles: caller.key.roles } } : {}),
          ...(caller.kind === 'system' ? { system: true } : {}),
          // The runner learns here, before any sign-in, that the app turns the browser's way of `login` off.
          ...(Reflect.get(Object(o.description.project.cli), 'login') === 'key' ? { login: 'key' } : {}),
        })
      }
      mayDescribe(o, caller)
      logCall(o, { name: url.pathname, caller, began })
      if (url.searchParams.get('have') === o.version) return okAnswer({ same: true })
      return okAnswer(commandList(o.description, o.version))
    } catch (error) {
      refusedCall(o, url.pathname, caller, began, error)
      return errorAnswer(o, url.pathname, error)
    }
  },
}
