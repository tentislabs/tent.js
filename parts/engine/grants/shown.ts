import type { Caller } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { storedLimit } from '../limits.ts'
import { madeText } from '../mcp/texts.ts'
import type { Asking, Trusted } from './asking.ts'
import type { Client } from './clients.ts'
import { grantPage } from './page.ts'
import { askingLines, languageOf, grantWordOf } from './words.ts'
import { unframed } from '../pages/unframed.ts'

/** What the text of the page that asks a person holds: this person, this request, and what it would grant. */
interface Deciding {
  user: string
  client: string
  name: string
  redirect: string
  challenge: string
  state: string
  scopes: string[]
  resource: string
  for: 'mcp' | 'app'
}

/** The host that the page names: of the client's document, or for a client with none, of its return address. */
function hostShown(o: Opened, client: Client, redirect: string, language: string): string {
  if (client.host) return client.host
  const back = new URL(redirect)
  const here = back.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(back.hostname)
  return here ? grantWordOf(o.description, language, 'tent.grant.here') : back.host
}

/**
 * The page that asks a person whether a program may act for them: the project's own screen `for: 'grant'`, drawn
 * with every rule of a screen, or the engine's own page. Each is handed a text of the engine's own that holds
 * this person, this request and what it would grant, good for `askTime`, which the answer is sent with.
 */
export async function askingPage(
  o: Opened,
  o2: {
    person: string
    caller: Caller
    client: Client
    asking: Asking
    trusted: Trusted
    request: Request
    origin: string
  },
): Promise<Response> {
  const { person, client, asking, trusted, request, origin } = o2
  const language = languageOf(o.description, request.headers.get('accept-language'))
  const deciding: Deciding = {
    user: person,
    client: client.id,
    name: client.name,
    redirect: asking.redirect,
    challenge: asking.challenge,
    state: asking.state,
    scopes: trusted.scopes,
    resource: trusted.resource,
    for: trusted.for,
  }
  const text = madeText(o, 'decide', { ...deciding })
  const host = hostShown(o, client, asking.redirect, language)
  const word = client.id === 'tent-cli' ? { word: trusted.word } : {}
  const lines = askingLines(new URL(asking.redirect).origin)
  const own = Object.entries(o.description.screens).find(([, one]) => one.for === 'grant')?.[0]
  if (!own) {
    const shown = {
      language,
      name: client.name,
      host,
      named: client.named,
      scopes: trusted.scopes,
      for: trusted.for,
      text,
      ...word,
    }
    return new Response(grantPage(o.description, shown), { status: 200, headers: lines })
  }
  const press = (answer: string) => ({
    definition: `tent.grant.${answer}`,
    kind: 'post' as const,
    post: '/_t/oauth/decide',
    form: { t: text, answer },
  })
  const grant = {
    name: client.name,
    host,
    named: client.named,
    scopes: trusted.scopes,
    for: trusted.for,
    ...word,
    allow: press('allow'),
    refuse: press('refuse'),
  }
  const { pageAnswer } = await import('../pages/answer.ts')
  const url = new URL(request.url)
  const page = await pageAnswer(o, url, origin, o2.caller, undefined, false, request.headers.get('cookie'), {
    screen: { name: own, handed: { grant } },
  })
  // Its answer leads to the client's host alone.
  return unframed(page, lines['content-security-policy'].match(/form-action [^;]*/)?.[0] ?? "form-action 'self'")
}

/** How long the text of the page that asks a person works, and the text of a request that waits for a sign-in. */
export const lives = (o: Opened): { decide: number; authorize: number } => ({
  decide: storedLimit(o.description, 'askTime'),
  authorize: storedLimit(o.description, 'authorizeTime'),
})
