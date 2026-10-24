import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { SignIn } from '../connect/index.ts'
import { proofOf } from '../core/internal.ts'
import { openTab } from './openTab.ts'

// How long the command line waits for the person in the browser.
const waits = 10 * 60_000

/**
 * The browser's part of `login` for an app's own command line: it makes the standard's proof, listens on a port of
 * this computer that the system gives, opens the browser at the app's `/_t/oauth/authorize` as the client
 * `tent-cli`, for the whole app and to read and change, and waits for the code that the browser brings back. The
 * word of the proof is told first, so that the terminal shows what the page shows. `open` is how the browser is
 * opened: the person's own, where none is handed.
 */
export function browserSignIn(o: { open?: (address: string) => void | Promise<void> } = {}): SignIn {
  const open = o.open ?? openTab
  return async ({ address, word, signal }) => {
    const { verifier, challenge } = proofOf()
    const state = randomBytes(16).toString('base64url')
    let done: (code: string) => void = () => undefined
    let fail: (error: Error) => void = () => undefined
    const coded = new Promise<string>((resolve, reject) => {
      done = resolve
      fail = reject
    })
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const code = url.searchParams.get('code')
      if (url.pathname !== '/callback' || url.searchParams.get('state') !== state) {
        response.writeHead(404).end()
        return
      }
      response
        .writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        .end(code ? 'The command line is signed in: this window may be closed.' : 'The sign-in was refused.')
      if (code) done(code)
      else fail(new Error('The sign-in was refused in the browser.'))
    })
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
    const port = Number(Reflect.get(Object(server.address()), 'port'))
    const redirect = `http://127.0.0.1:${port}/callback`
    const timer = setTimeout(() => fail(new Error('Nobody signed in in the browser in time.')), waits)
    const stopped = (): void => fail(new Error('The command was stopped.'))
    signal?.addEventListener('abort', stopped, { once: true })
    try {
      word(challenge.slice(0, 6).toUpperCase())
      const asked = new URL('/_t/oauth/authorize', address)
      for (const [name, value] of Object.entries({
        response_type: 'code',
        client_id: 'tent-cli',
        redirect_uri: redirect,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        scope: 'read write',
        resource: new URL(address).origin,
        state,
      }))
        asked.searchParams.set(name, value)
      await open(asked.toString())
      return { code: await coded, verifier, redirect }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', stopped)
      server.closeAllConnections()
      await new Promise((closed) => server.close(closed))
    }
  }
}
