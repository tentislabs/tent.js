import type { Address } from '../door/address.ts'
import type { Asking } from '../grants/asking.ts'
import { askingIn, isAsking, trusted } from '../grants/asking.ts'
import { backTo, sentBack } from '../grants/back.ts'
import { clientOf } from '../grants/clients.ts'
import { newCode } from '../grants/codes.ts'
import { countedHere, personOf, programsAt } from '../grants/door.ts'
import { grantsOf } from '../grants/kept.ts'
import { askingPage, lives } from '../grants/shown.ts'
import { heldTo, madeText, readText } from '../mcp/texts.ts'
import type { Opened } from '../opened.ts'
import { errorAnswer } from '../wire.ts'
import { untrusted } from '../grants/clients.ts'

/** Whether a return address is over `https`, where only the site that holds its name is sent the code. */
const overHttps = (redirect: string): boolean => new URL(redirect).protocol === 'https:'

/**
 * The refusal of a request that no return can be made for: the `error` screen of the app with the failure, and in
 * an app that holds no screen the wire form of it. Nobody is sent anywhere.
 */
async function refused(o: Opened, request: Request, origin: string, error: unknown): Promise<Response> {
  if (!Object.keys(o.description.screens).length) return errorAnswer(o, 'oauth-authorize', error)
  const { pageAnswer } = await import('../pages/answer.ts')
  const page = await pageAnswer(o, new URL(request.url), origin, { kind: 'nobody' }, undefined, false, null, {
    failure: error,
  })
  return new Response(page.html, { status: page.status, headers: page.headers })
}

/**
 * `GET /_t/oauth/authorize`: where a client sends the person. A person who is not signed in is sent to the
 * project's `signInPath`, with a text of the engine's own that holds the whole request and works for
 * `authorizeTime`; nothing is fetched before. A signed-in person is asked on the page, or, where they gave this
 * client the same before and it is sent back to an `https` address, sent back with a code at once. A request that
 * cannot be trusted is the `error` screen with T0002, and never a return. It passes steps 1 to 4 of the door,
 * counted like a request for a screen, and a key and a token are nobody here.
 */
export const address: Address = {
  order: 2,
  match: (request) =>
    request.method === 'GET' && programsAt(request, '/_t/oauth/authorize') && { name: 'oauth-authorize' },
  steps: [1, 2, 3],
  async handle({ app: o, request, caller, about }) {
    try {
      countedHere(o, about.from)
    } catch (error) {
      return errorAnswer(o, 'oauth-authorize', error)
    }
    const query = new URL(request.url).searchParams
    const sealed = query.get('r')
    let asking: Asking
    if (sealed !== null) {
      const opened = readText(o, 'authorize', sealed, lives(o).authorize)
      if (!opened || !isAsking(opened))
        return refused(
          o,
          request,
          about.origin,
          untrusted('The sign-in was asked for too long ago, or by another app.'),
        )
      asking = opened
    } else asking = askingIn(query)
    const person = personOf(caller)
    // The text is the request of whoever signs in with it first: carried to another person it opens nothing.
    if (sealed !== null && person !== undefined && !heldTo(o, sealed, person, lives(o).authorize))
      return refused(o, request, about.origin, untrusted('The sign-in was asked for by another person.'))
    if (person === undefined) {
      const signIn =
        typeof o.description.project.signInPath === 'string' ? o.description.project.signInPath : '/sign-in'
      const back = `/_t/oauth/authorize?r=${madeText(o, 'authorize', { ...asking })}`
      return new Response(null, {
        status: 302,
        headers: { location: `${signIn}?back=${encodeURIComponent(back)}`, 'cache-control': 'no-store' },
      })
    }
    try {
      const client = await clientOf(o, asking.client, person)
      const trust = trusted(o, client, asking, about.origin)
      // The same things given to the same client before are not asked about again, where the client is sent back
      // to an `https` address: a return to this computer or of a program's own kind cannot be told from another
      // program that claims it.
      const before = grantsOf(o, person).some(
        (one) =>
          one.client === client.id &&
          one.for === trust.for &&
          trust.scopes.every((scope) => one.scopes.includes(scope)),
      )
      if (before && overHttps(asking.redirect) && client.id !== 'tent-cli' && !client.forApp) {
        const code = newCode(o, {
          user: person,
          client: client.id,
          name: client.name,
          redirect: asking.redirect,
          challenge: asking.challenge,
          scopes: trust.scopes,
          resource: trust.resource,
          for: trust.for,
        })
        return sentBack(backTo(asking.redirect, { code, state: asking.state }, about.origin))
      }
      return await askingPage(o, { person, caller, client, asking, trusted: trust, request, origin: about.origin })
    } catch (error) {
      return refused(o, request, about.origin, error)
    }
  },
}
