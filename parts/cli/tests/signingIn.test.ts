import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { TestApp, TestBrowser } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { root } from './typed.ts'

/** A page of the docs whose examples these tests build an app of. */
const page = (name: string): string =>
  readFileSync(join(root, 'parts', 'docs', 'pages', `${name}.md`), 'utf8').replaceAll('\r\n', '\n')

/**
 * The files that the examples of the pages of signing in write, each a block of code whose first line names its
 * file. Those of the page of a sign-in from a package make an app of their own, and the others the app of a password.
 */
function examples(): { password: Record<string, string>; fromPackage: Record<string, string> } {
  const filesOf = (part: string): Record<string, string> =>
    Object.fromEntries(
      [...part.matchAll(/```tsx?\n\/\/ ([\w./-]+)\n([\s\S]*?)```/g)].map((found) => [found[1], found[2]] as const),
    )
  return {
    password: filesOf(`${page('topic.signIn')}\n${page('topic.signIn.mail')}`),
    fromPackage: filesOf(page('topic.signIn.package')),
  }
}

// What the tests add to the app of the page: a note that its owner alone reads, and a screen for the signed-in.
const own: Record<string, string> = {
  'tables/notes.ts': `import { link, table, text } from 'tentjs'

export const notes = table('notes', {
  columns: { title: text(), owner: link('users') },
  owner: 'owner',
  access: { read: 'owner', add: 'signedIn' },
})
`,
  'functions/notes.ts': `import { change, input, query, text } from 'tentjs'
import { notes } from '../tables/notes'

export const addNote = change('addNote', {
  access: 'signedIn',
  input: { title: text() },
  set: notes.add({ title: input('title') }),
})

export const myNotes = query('myNotes', {
  access: 'signedIn',
  rows: notes.oldest('createdAt'),
})
`,
  'screens/mine.tsx': `import { read, screen } from 'tentjs/ui'
import { myNotes } from '../functions/notes'

export const mineScreen = screen('mineScreen', {
  path: '/mine',
  access: 'signedIn',
  data: { notes: read(myNotes) },
  view: ({ notes }) => (
    <main>
      {notes.map((note, place) => <span key={place}>{note.title}</span>)}
    </main>
  ),
})
`,
}

/** Lays an app of files into an empty folder of the test under `results/`, removed when the test ends. */
function laid(t: TestContext, name: string, files: Record<string, string>): string {
  const folder = join(root, 'results', 'cli', name)
  const remove = (): void => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  remove()
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  t.after(remove)
  return folder
}

/** Opens the test app of a folder, closed when the test ends, before its folder is removed. */
async function opened(t: TestContext, folder: string, secrets?: Record<string, string>): Promise<TestApp> {
  const app = await testApp({ folder, ...(secrets ? { secrets } : {}) })
  t.after(() => app.close())
  return app
}

/** The app of the password, as the page writes it, with the tests' own note and screen. */
async function passwordApp(t: TestContext, name: string): Promise<TestApp> {
  const files = examples().password
  for (const path of ['tent.ts', 'tables/users.ts', 'functions/signUp.ts', 'functions/signIn.ts'])
    assert.ok(files[path], `the page writes ${path}`)
  return await opened(t, laid(t, name, { ...files, ...own }))
}

const ada = { email: 'ada@example.com', name: 'Ada', password: 'a long secret' }
const signInOf = { email: ada.email, password: ada.password }

/** The titles of the notes that a browser reads, or the code it is refused with. */
async function notesOf(browser: TestBrowser): Promise<string[] | string> {
  const read = await browser.call('myNotes')
  if (!read.ok) return String(read.error?.code)
  return (Array.isArray(read.value) ? read.value : []).map((one) => String(Reflect.get(Object(one), 'title')))
}

test('[43-2] the sign-in of the page: a person signs up, signs in, is limited after too many tries and signs out, and signedIn and the rule of a row hold for them', async (t) => {
  const app = await passwordApp(t, 'signing-in')
  const browser = app.browser({ from: '10.20.0.1' })

  // A stranger is let into nothing that needs a sign-in, and is sent to the sign-in screen.
  assert.equal(await notesOf(browser), 'T0006')
  const stranger = await browser.page('/mine')
  assert.equal(stranger.status, 302)
  assert.match(String(stranger.headers.location), /^\/sign-in\?back=%2Fmine/)

  // Signing up signs in: the row rule lets them read their own note.
  const signedUp = await browser.call('signUp', ada)
  assert.equal(signedUp.ok, true, JSON.stringify(signedUp))
  assert.equal((await browser.call('addNote', { title: 'Ada writes' })).ok, true)
  assert.deepEqual(await notesOf(browser), ['Ada writes'])
  assert.equal((await browser.page('/mine')).status, 200)
  // The same email again is refused.
  assert.equal((await app.browser({ from: '10.20.0.9' }).call('signUp', ada)).error?.code, 'has-account')

  // A second person reads none of Ada's notes.
  const bob = app.browser({ from: '10.20.0.2' })
  assert.equal(
    (await bob.call('signUp', { email: 'bob@example.com', name: 'Bob', password: 'another secret' })).ok,
    true,
  )
  assert.deepEqual(await notesOf(bob), [])

  // Signing out ends the session: the row rule and signedIn refuse what they let in before.
  assert.equal((await browser.call('signOut')).ok, true)
  assert.equal(await notesOf(browser), 'T0006')

  // Signing in again with the password works; a wrong one fails, and the sixth try within the window is limited.
  assert.equal((await browser.call('signIn', { email: ada.email, password: ada.password })).ok, true)
  assert.deepEqual(await notesOf(browser), ['Ada writes'])
  assert.equal((await browser.call('signOut')).ok, true)
  for (let n = 0; n < 5; n++)
    assert.equal((await browser.call('signIn', { email: ada.email, password: 'not it' })).error?.code, 'wrong-sign-in')
  assert.equal((await browser.call('signIn', signInOf)).error?.code, 'T0005')
  assert.equal(await notesOf(browser), 'T0006')
})

test('[43-2] the code by mail of the page: a person asks a code, is mailed it, and signs in with it once', async (t) => {
  const app = await passwordApp(t, 'signing-in-code')
  const files = examples().password
  assert.ok(files['functions/codes.ts'], 'the page writes functions/codes.ts')
  const browser = app.browser({ from: '10.21.0.1' })
  assert.equal((await browser.call('signUp', ada)).ok, true)
  assert.equal((await browser.call('signOut')).ok, true)

  assert.equal((await browser.call('sendCode', { email: ada.email })).ok, true)
  const mail = app.mailbox.filter((one) => JSON.stringify(one.to).includes(ada.email)).at(-1)
  const code = /\b(\d{6})\b/.exec(String(mail?.text ?? ''))?.[1]
  assert.ok(code, 'a code of six digits was mailed')
  const wrong = code === '000000' ? '111111' : '000000'
  assert.equal((await browser.call('signInWithCode', { email: ada.email, code: wrong })).ok, false)
  assert.equal((await browser.call('signInWithCode', { email: ada.email, code })).ok, true)
  assert.deepEqual(await notesOf(browser), [])
  // A code signs in once.
  assert.equal((await browser.call('signOut')).ok, true)
  assert.equal((await browser.call('signInWithCode', { email: ada.email, code })).ok, false)
})

test('[22-2@8d] a sign-in of the project uses attempts.limit: the sixth wrong password of an email from one address is T0005, also for the right one, while another address still signs in', async (t) => {
  const app = await passwordApp(t, 'signing-in-attempts')
  assert.equal((await app.browser({ from: '10.22.0.9' }).call('signUp', ada)).ok, true)
  const guesser = app.browser({ from: '10.22.0.1' })
  for (let n = 0; n < 5; n++)
    assert.equal(
      (await guesser.call('signIn', { email: ada.email, password: 'a wrong one' })).error?.code,
      'wrong-sign-in',
    )
  assert.equal((await guesser.call('signIn', signInOf)).error?.code, 'T0005')
  assert.equal((await app.browser({ from: '10.22.0.2' }).call('signIn', signInOf)).ok, true)
  // Once its window ended, the address is let try again.
  app.clock.advance('11 minutes')
  assert.equal((await guesser.call('signIn', signInOf)).ok, true)
})

// A package of the test that signs its own token: the text of a user's id with its signature under a key.
const tokens = {
  'node_modules/@acme/tokens/package.json': JSON.stringify({
    name: '@acme/tokens',
    version: '1.0.0',
    type: 'module',
    exports: './index.js',
  }),
  'node_modules/@acme/tokens/index.js': `import { createHmac, timingSafeEqual } from 'node:crypto'

const signed = (user, key) => createHmac('sha256', key).update(user).digest('base64url')

export function signToken(user, key) {
  return user + '.' + signed(user, key)
}

export function readToken(token, key) {
  const [user, signature] = String(token).split('.')
  if (!user || !signature) return undefined
  const right = Buffer.from(signed(user, key))
  const given = Buffer.from(signature)
  return right.length === given.length && timingSafeEqual(right, given) ? user : undefined
}
`,
}

/** A token as the package signs it, written here as the package writes it. */
const tokenOf = (user: string, key: string): string =>
  `${user}.${createHmac('sha256', key).update(user).digest('base64url')}`

test("[43-2] a sign-in of a package: identify reads the package's own token and names the user, and signedIn and the rule of a row hold for them", async (t) => {
  const { password, fromPackage } = examples()
  assert.ok(fromPackage['tent.ts']?.includes('identify'), 'the page writes a tent.ts with identify')
  const key = 'the key of the tokens of this test'
  const app = await opened(
    t,
    laid(t, 'signing-in-package', {
      ...tokens,
      ...fromPackage,
      'tables/users.ts': password['tables/users.ts'],
      ...own,
    }),
    { TOKEN_KEY: key },
  )
  const maya = String((await app.user({ email: 'maya@example.com', roles: [] })).user?.id)
  const omar = String((await app.user({ email: 'omar@example.com', roles: [] })).user?.id)

  /** Calls a function with the cookie of the package, as the page of a user drawn for them does. */
  const called = async (name: string, cookie: string, as: string, input: object = {}) => {
    const answer = await app.request(
      new Request(`http://localhost/_t/call/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie },
        body: JSON.stringify({ input, ...(as ? { as } : {}) }),
      }),
    )
    return Object(await answer.json())
  }
  const of = (user: string): string => `acme_token=${tokenOf(user, key)}`

  assert.equal((await called('addNote', of(maya), maya, { title: 'Maya writes' })).ok, true)
  assert.deepEqual(
    (await called('myNotes', of(maya), maya)).value.map((one: { title: string }) => one.title),
    ['Maya writes'],
  )
  // Another user of the package reads none of them.
  assert.deepEqual((await called('myNotes', of(omar), omar)).value, [])
  // A token of another key, and none, name nobody: signedIn refuses.
  assert.equal((await called('myNotes', `acme_token=${tokenOf(maya, 'another key')}`, '')).error?.code, 'T0006')
  assert.equal((await called('myNotes', '', '')).error?.code, 'T0006')
})
