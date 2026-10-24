import type { Terminal } from '../../core/index.ts'
import type { Reach } from '../env.ts'
import { keepTokens, keptApp } from './keys.ts'
import { safe } from './printed.ts'
import { cliClient, tokenRequest, tokensOf } from './tokens.ts'

/**
 * What `cli` hands the runner for a `login` in the browser: it opens the browser at the app's sign-in for programs,
 * with the standard's proof, waits on a port of this computer for the code, and answers it with the proof and the
 * return address it named. It tells the word made from the proof first, which the terminal prints.
 */
export type SignIn = (o: {
  address: string
  word(word: string): void
  signal?: AbortSignal
}) => Promise<{ code: string; verifier: string; redirect: string }>

/** What a `login` in the browser is handed. */
interface Login {
  terminal: Terminal
  reach: Reach
  home: string
  address: string
  signIn: SignIn
  signal?: AbortSignal
}

/**
 * `login` with no flag: the person signs in in the browser, the app's own way, and allows the command line; the
 * code is changed for the two tokens, which are kept where a key is kept. Answers how it ends: 0 when it worked,
 * and 1 when the app gave no tokens.
 */
export async function browserLogin(o: Login): Promise<number> {
  const asked = await o.signIn({
    address: o.address,
    word: (word) =>
      o.terminal.error(safe(`The page in the browser shows the word ${word}: allow only where it does.\n`)),
    ...(o.signal ? { signal: o.signal } : {}),
  })
  const tokens = await tokensOf(
    await o.reach.request(
      tokenRequest({
        grant_type: 'authorization_code',
        code: asked.code,
        redirect_uri: asked.redirect,
        client_id: cliClient,
        code_verifier: asked.verifier,
      }),
    ),
  )
  if (!tokens) {
    o.terminal.error('error T0006 not-signed-in: the app gave no tokens for this sign-in, and nothing was kept.\n')
    return 1
  }
  keepTokens(o.home, o.address, tokens)
  o.terminal.write('Signed in.\n')
  return 0
}

/** `logout` of a `login` in the browser: ends the grant at the app, whatever it answers. */
export async function grantLeft(reach: Reach, home: string, address: string): Promise<void> {
  const refresh = keptApp(home, address)?.refresh
  if (!refresh) return
  await reach
    .request(
      new Request('http://localhost/_t/oauth/end', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refresh }).toString(),
      }),
    )
    .catch(() => undefined)
}
