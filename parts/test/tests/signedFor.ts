import { createHash, randomBytes } from 'node:crypto'
import type { TestContext } from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { App } from '../../engine/index.ts'
import type { TestApp, TestBrowser } from '../index.ts'
import type { Remote } from './remotes.ts'
import { remoteOf } from './remotes.ts'

/** The standard's proof of one sign-in: the text that the client keeps, and the fingerprint it sends ahead. */
export interface Proof {
  verifier: string
  challenge: string
}

/** A new proof, as a client makes one: 32 random bytes, and their fingerprint with SHA-256, in the letters of an address. */
export function proof(): Proof {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

/** A chat app of the tests: the address of its document, which is its id, and what its server was asked. */
export interface ChatApp {
  id: string
  remote: Remote
}

/**
 * Starts the server of a chat app of the tests on this computer, which answers its own document at
 * `/client.json`: its name, the address it names as its own, and where a person may be sent back to.
 */
export async function chatApp(
  t: TestContext,
  o: { name?: string; redirects?: string[]; own?: (id: string) => string; body?: (id: string) => string } = {},
): Promise<ChatApp> {
  let id = ''
  const remote = await remoteOf(t, (_heard, response) => {
    const document =
      o.body?.(id) ??
      JSON.stringify({
        client_id: o.own ? o.own(id) : id,
        client_name: o.name ?? 'Chat <b>app</b>',
        redirect_uris: o.redirects ?? ['https://chat.example/callback', 'http://127.0.0.1/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_method: 'none',
      })
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(document)
  })
  id = `${remote.origin}/client.json`
  return { id, remote }
}

/** What a client sends the person with to `/_t/oauth/authorize`. */
export interface Authorizing {
  client: string
  redirect: string
  proof?: Proof
  scope?: string
  state?: string
  resource?: string
  method?: string
}

/** The address of `/_t/oauth/authorize` for what a client asks. */
export function authorizeAt(asking: Authorizing): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: asking.client,
    redirect_uri: asking.redirect,
    state: asking.state ?? 'the state of the client',
    ...(asking.proof ? { code_challenge: asking.proof.challenge, code_challenge_method: asking.method ?? 'S256' } : {}),
    ...(asking.scope === undefined ? {} : { scope: asking.scope }),
    ...(asking.resource === undefined ? {} : { resource: asking.resource }),
  })
  return `/_t/oauth/authorize?${query}`
}

/** The hidden text of the form of the page that asks a person, and the address its form posts to. */
export function decideFormOf(html: string): { action: string; text: string } {
  const action = /<form[^>]*action="([^"]+)"/.exec(html)?.[1] ?? ''
  const text = /name="t" value="([^"]+)"/.exec(html)?.[1] ?? ''
  return { action: action.replaceAll('&amp;', '&'), text }
}

/** Sends the person's answer to the page that asked them, as the form of the page does. */
export function decided(
  browser: Pick<TestBrowser, 'request'>,
  text: string,
  answer: 'allow' | 'refuse' = 'allow',
): Promise<Response> {
  return browser.request('POST', '/_t/oauth/decide', {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ t: text, answer }).toString(),
  })
}

/** The code and the state that a return address was handed. */
export function returned(answer: Response): { code: string; state: string; iss: string; error: string; to: string } {
  const to = answer.headers.get('location') ?? ''
  const query = new URL(to, 'http://localhost').searchParams
  return {
    code: query.get('code') ?? '',
    state: query.get('state') ?? '',
    iss: query.get('iss') ?? '',
    error: query.get('error') ?? '',
    to,
  }
}

/** What answers a request of a test with no network: a test app, or an app that a program holds. */
interface Answers {
  request(request: Request, o?: { from?: string }): Promise<Response>
}

/** A browser of a session that the test made for a user, over an app that a program holds: it keeps its one cookie. */
export function sessionBrowser(app: App, user: string, origin = 'http://localhost'): Pick<TestBrowser, 'request'> {
  const cookie = app.session(user)
  return {
    request: (method, path, o = {}) =>
      app.request(
        new Request(`${origin}${path}`, {
          method,
          headers: { cookie, ...(method === 'GET' ? {} : { origin }), ...o.headers },
          ...(o.body === undefined ? {} : { body: o.body }),
        }),
      ),
  }
}

/** Sends a form to the token address, as a client does, and answers its status and its body. */
export async function tokenAsked(
  app: Answers,
  form: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const answer = await app.request(
    new Request('http://localhost/_t/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(form).toString(),
    }),
  )
  return { status: answer.status, body: Object(await answer.json()) }
}

/** What a whole sign-in gives: the code, the tokens, and the grant they belong to. */
export interface Signed {
  code: string
  access: string
  refresh: string
  scope: string
}

/**
 * A whole sign-in of a client for a person: the page asks, the person allows, and the code is changed for the
 * tokens. Fails where one of its steps is answered other than a sign-in that works.
 */
export async function signedFor(
  app: TestApp,
  person: Caller,
  asking: Omit<Authorizing, 'proof'>,
): Promise<Signed & { browser: TestBrowser }> {
  const browser = app.browser({ as: person })
  return { ...(await signedWith(app, browser, asking)), browser }
}

/** A whole sign-in of a client, in a browser that is already the person. */
export async function signedWith(
  app: Answers,
  browser: Pick<TestBrowser, 'request'>,
  asking: Omit<Authorizing, 'proof'>,
): Promise<Signed> {
  const made = proof()
  const page = await browser.request('GET', authorizeAt({ ...asking, proof: made }))
  let code: string
  if (page.status === 200) {
    const { text } = decideFormOf(await page.text())
    code = returned(await decided(browser, text)).code
  } else code = returned(page).code
  if (!code) throw new Error(`no code was handed back: ${page.status} ${page.headers.get('location')}`)
  const tokens = await tokenAsked(app, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: asking.redirect,
    client_id: asking.client,
    code_verifier: made.verifier,
  })
  if (tokens.status !== 200) throw new Error(`the code was not changed for tokens: ${JSON.stringify(tokens.body)}`)
  return {
    code,
    access: String(tokens.body.access_token),
    refresh: String(tokens.body.refresh_token),
    scope: String(tokens.body.scope),
  }
}
