import { existsSync, statSync } from 'node:fs'
import type { Terminal } from '../../core/index.ts'
import type { Reach } from '../env.ts'
import { boundedJson, listSize } from './bounded.ts'
import type { SignIn } from './browserLogin.ts'
import { browserLogin, grantLeft } from './browserLogin.ts'
import { written } from './downloaded.ts'
import { Unrunnable } from './flags.ts'
import { forgetServer, keepKey } from './keys.ts'
import { safe } from './printed.ts'

/** What a word of the runner's own is handed: `raw` reaches the app with no sign-in of the runner's own. */
interface Own {
  words: string[]
  terminal: Terminal
  reach: Reach
  raw: Reach
  home: string
  address?: string
  yes: boolean
  signIn?: SignIn
  signal?: AbortSignal
}

/** Whether the app turns the browser's way of `login` off, as `/_t/cli/me` says: `cli: { login: 'key' }`. */
async function keysAlone(reach: Reach): Promise<boolean> {
  const answer = await reach.request(new Request('http://localhost/_t/cli/me'))
  const read = await boundedJson(answer, listSize, 'The answer of the app to /_t/cli/me')
  return Reflect.get(Object(Reflect.get(Object(read), 'value')), 'login') === 'key'
}

/** Who a key, or the caller of a request, is, as `/_t/cli/me` answers it, or nothing for nobody. */
async function whoIs(
  reach: Reach,
  key?: string,
): Promise<{ user?: { id: string }; key?: { name: string }; system?: true } | undefined> {
  const answer = await reach.request(
    new Request('http://localhost/_t/cli/me', key ? { headers: { authorization: `Bearer ${key}` } } : {}),
  )
  const read = await boundedJson(answer, listSize, 'The answer of the app to /_t/cli/me')
  const value: unknown = Reflect.get(Object(read), 'value')
  const me: Record<string, unknown> = Object(value)
  return me.user || me.key || me.system ? Object(value) : undefined
}

/**
 * `login --key`: asks for a key without showing it, or reads it from the input, asks the server who that is, and
 * keeps it by the address of the server. A key that is nobody ends with 1, and nothing is kept.
 */
async function login(o: Own): Promise<number> {
  if (!o.address) throw new Unrunnable('`login` is for an app on a server: name its address.')
  if (o.terminal.interactive) o.terminal.error('Key: ')
  const key = (await o.terminal.line({ hidden: true }))?.trim() ?? ''
  const me = key === '' ? undefined : await whoIs(o.reach, key)
  if (!me) {
    o.terminal.error('error T0006 not-signed-in: the key names nobody at this server, and nothing was kept.\n')
    return 1
  }
  keepKey(o.home, o.address, key)
  o.terminal.write(safe(`Signed in as ${me.key?.name ?? me.user?.id ?? 'the system'}.\n`))
  return 0
}

/**
 * Carries out a word of the runner's own: `login`, `logout`, `whoami` and `file`. Answers how it ends, or nothing
 * for a word that is none of them.
 */
export async function ownWord(word: string, o: Own): Promise<number | undefined> {
  if (word === 'login') {
    // With no flag the person signs in in the browser, where the runner was handed the way and the app keeps it.
    if (o.address && o.signIn && !o.words.includes('--key') && !(await keysAlone(o.raw)))
      return browserLogin({
        terminal: o.terminal,
        reach: o.raw,
        home: o.home,
        address: o.address,
        signIn: o.signIn,
        ...(o.signal ? { signal: o.signal } : {}),
      })
    return login(o)
  }
  if (word === 'logout') {
    if (!o.address) throw new Unrunnable('`logout` is for an app on a server: name its address.')
    await grantLeft(o.raw, o.home, o.address)
    forgetServer(o.home, o.address, false)
    return 0
  }
  if (word === 'whoami') {
    const me = await whoIs(o.reach)
    o.terminal.write(safe(`${me?.key?.name ?? me?.user?.id ?? (me?.system ? 'the system' : 'nobody')}\n`))
    return 0
  }
  if (word !== 'file') return undefined
  const [id, ...rest] = o.words
  const at = rest.indexOf('--out')
  const out = at < 0 ? undefined : rest[at + 1]
  if (!id || !out) throw new Unrunnable('`file <id> --out <path>` downloads a file: --out is needed.')
  if (existsSync(out) && (statSync(out).isDirectory() || !o.yes))
    throw new Unrunnable(`${out} is there already: type --yes before the word to write over it.`)
  const answer = await o.reach.request(new Request(`http://localhost/_t/files/${encodeURIComponent(id)}`))
  if (!answer.ok) {
    o.terminal.error(`error T0001 not-found: no file ${safe(id.slice(0, 40))} is here for this caller.\n`)
    return 1
  }
  await written(answer, out)
  return 0
}
