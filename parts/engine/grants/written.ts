import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { App } from '../app.ts'
import { openedOf } from '../app.ts'
import { heldOpen } from '../opened.ts'
import { grantCaller } from './caller.ts'
import { grantMade } from './issued.ts'
import { grantAt } from './kept.ts'

/** What a grant is written with by a program that holds the app: as a person would allow it. */
export interface GrantGiven {
  user: string
  scopes?: string[]
  client?: string
  name?: string
  for?: 'mcp' | 'app'
}

/**
 * Takes an app and what a grant is made with. Makes the grant, as a person who allowed a program would, and answers
 * its id, its caller and its access token: it is how `app.grant` of the test helpers makes a caller. Throws T0013
 * for an app that is closed, and T2103 for a user who is not there.
 */
export function writeGrant(app: App, given: GrantGiven): { id: string; caller: Caller; token: string } {
  const o = openedOf(app)
  if (!o) throw new TentError('T0013', 'A grant is written into an app that an engine opened.')
  heldOpen(o)
  // The user is looked for first, so that a grant for nobody leaves no row behind.
  const gone = new TentError('T2103', `No user ${given.user.slice(0, 40)} is there to give a grant.`)
  const tables = new Set(o.store.layout().map((one) => one.name))
  const user = tables.has('users')
    ? o.store.read({ from: 'users', one: 'get', id: given.user }, { kind: 'system' }).value
    : undefined
  if (user === undefined || user === null) throw gone
  const kind = given.for ?? 'mcp'
  const client = given.client ?? 'https://client.example/client.json'
  const origin = 'http://localhost'
  const made = grantMade(o, {
    user: given.user,
    client,
    name: given.name ?? client,
    redirect: '',
    challenge: '',
    scopes: given.scopes ?? ['read'],
    resource: kind === 'app' ? origin : `${origin}/mcp`,
    for: kind,
  })
  const grant = grantAt(o, made.id)
  const caller = grant ? grantCaller(o, grant) : undefined
  if (!caller) throw gone
  return { id: made.id, caller, token: made.pair.access_token }
}
