import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { LiveServed } from './living.ts'
import { servedLive, signedInLive, cardTitlesOf } from './living.ts'

const system = { kind: 'system' } as const

/** Asks for a screen again, as a page does, and answers the status with what the wire form holds. */
async function again(
  at: LiveServed,
  path: string,
  o: { version?: string; prefetch?: true; cookie?: string } = {},
): Promise<{ status: number; value: Record<string, unknown>; error: Record<string, unknown>; kept: string | null }> {
  const asked = new URLSearchParams({ path, ...(o.version === undefined ? {} : { version: o.version }) })
  if (o.prefetch) asked.set('prefetch', '1')
  const answer = await fetch(`${at.origin}/_t/screen?${asked}`, { headers: o.cookie ? { cookie: o.cookie } : {} })
  const body = Object(await answer.json())
  return {
    status: answer.status,
    value: Object(body.value),
    error: Object(body.error),
    kept: answer.headers.get('cache-control'),
  }
}

/** The answers of the record of a page, each by what it asks. */
const answersOf = (value: Record<string, unknown>): Record<string, Record<string, unknown>> =>
  Object.fromEntries(Object(value.answers).map((one: Record<string, unknown>) => [String(one.what), one]))

test('[31-10] /_t/screen answers the record of the page of an address with the answers its view asked for through useQuery, goTo for a screen that needs a sign-in and for an address with a slash at its end, and T0007 with the running version for a version that is gone', async (t) => {
  const at = await servedLive(t)
  const version = String(Object(await (await fetch(`${at.origin}/_t/health`)).json()).value.version)

  // A view that reads with a hook: the engine draws to meet what the view asks for, and sends the answers
  // and no drawing.
  const shown = await again(at, '/optimistic', { version })
  assert.deepEqual([shown.status, shown.kept], [200, 'no-store'])
  assert.deepEqual(
    [shown.value.screen, shown.value.version, shown.value.status, shown.value.path],
    ['optimisticScreen', version, 200, '/optimistic'],
  )
  const asked = answersOf(shown.value).allCards
  assert.deepEqual(cardTitlesOf(asked.value), ['One', 'Two', 'Three', 'Four', 'Five'])
  assert.match(String(asked.mark), /^[0-9a-f]{16}$/)
  assert.equal('html' in shown.value, false)
  assert.equal(String(Object(shown.value.load).screen).startsWith('browser/'), true)
  // A screen, with the entry of its `data`, and with no version named: the running one answers.
  const cards = await again(at, '/')
  assert.deepEqual([cards.value.screen, answersOf(cards.value).allCards.entry], ['cardsScreen', 'cards'])
  // The address is taken with what stands after its question mark, and the user is the caller's.
  const { user, cookie } = await signedInLive(at, 'Ada', ['staff'])
  const staff = await again(at, '/staff?tab=open', { version, cookie })
  assert.deepEqual([staff.value.screen, Object(staff.value.user).id], ['staffScreen', user])

  // What a request for the address would have sent the visitor on to is told as an address to go to.
  assert.deepEqual((await again(at, '/staff', { version })).value, { goTo: '/sign-in?back=%2Fstaff' })
  assert.deepEqual((await again(at, '/page/', { version })).value, { goTo: '/page' })
  assert.deepEqual((await again(at, '/page/?x=1', { version })).value, { goTo: '/page?x=1' })
  // An address that another address of the door takes is one to leave the page for.
  assert.deepEqual((await again(at, '/_t/health', { version })).value, { leave: '/_t/health' })
  assert.deepEqual((await again(at, '/api/cards', { version })).value, { leave: '/api/cards' })
  // An address that no screen answers is the record of the screen that is not found, and a caller that the rule
  // of a screen keeps out is told the same.
  const none = await again(at, '/no/such/screen', { version })
  assert.deepEqual([none.status, none.value.screen, none.value.status], [200, 'tent.notFound', 404])
  const out = await signedInLive(at, 'Bo', [])
  assert.equal((await again(at, '/staff', { version, cookie: out.cookie })).value.screen, 'tent.notFound')

  // A version that is gone answers T0007, and names the one that runs.
  const gone = await again(at, '/', { version: 'a-version-that-never-was' })
  assert.deepEqual([gone.status, gone.error.code, gone.error.running], [409, 'T0007', version])
  // What is no address of the app is not found, and nothing is fetched for it.
  for (const path of ['https://evil.tent.test/', '//evil.tent.test/', '/\\evil.tent.test', 'page', ''])
    assert.deepEqual([(await again(at, path, { version })).error.code, path], ['T0001', path])
  const noPath = await fetch(`${at.origin}/_t/screen?version=${version}`)
  assert.equal(noPath.status, 404)
})

test('[31-10] a request for a screen with prefetch=1 calls no action, and with two versions kept /_t/b/ serves a file that only the older one holds', async (t) => {
  const at = await servedLive(t)
  const quotes = async (): Promise<unknown> => at.app.call('quotes', {}, { as: system })
  // Asked for as a move asks, the screen calls its action, once for each asking.
  const first = await again(at, '/quote')
  assert.deepEqual([answersOf(first.value).quote.value, await quotes()], [1, 1])
  // Asked for ahead of a move, the action is left for the move: it is not called.
  const prefetched = await again(at, '/quote', { prefetch: true })
  assert.deepEqual(
    [prefetched.value.screen, answersOf(prefetched.value).quote.left, await quotes()],
    ['quoteScreen', 'prefetch', 1],
  )
  assert.equal('value' in answersOf(prefetched.value).quote, false)
  // A screen with no action is answered to a prefetch as it is at a move.
  assert.deepEqual(cardTitlesOf(answersOf((await again(at, '/', { prefetch: true })).value).allCards.value).length, 5)
  assert.equal(await quotes(), 1)

  // A second version, in which one screen changed: its browser file is another, under another mark.
  const before = String(Object(first.value.load).screen)
  const old = readFileSync(join(at.projectFolder, 'screens.tsx'), 'utf8')
  writeFileSync(join(at.projectFolder, 'screens.tsx'), old.replace('Quote {quote}', 'The quote is {quote}'))
  const next = await at.built()
  const version = await at.app.add(next.bundleFolder)
  await at.app.switch(version)
  const after = String(Object((await again(at, '/quote', { version })).value.load).screen)
  assert.notEqual(after, before)
  // Both versions are kept: the file that only the older one holds is still served, and so is the new one.
  for (const file of [before, after]) {
    const answer = await fetch(`${at.origin}/_t/b/${file}`)
    assert.equal(answer.status, 200, file)
    // In development the module of a screen imports the module of its file, which holds the view: at its address
    // with no fingerprint, and with the mark it has in that version.
    const imported = /from "\.\/(src\.screens\.tsx\.js\?v=[0-9a-f]{12})"/.exec(await answer.text())?.[1]
    assert.ok(imported, file)
    const view = await fetch(`${at.origin}/_t/b/browser/${imported}`)
    assert.equal(view.status, 200, imported)
    assert.match(await view.text(), file === before ? /Quote / : /The quote is /)
  }
  // Once the older version is dropped, the file that only it held is served no more.
  assert.equal(await at.app.drop(String(first.value.version)), true)
  assert.equal((await fetch(`${at.origin}/_t/b/${before}`)).status, 404)
  assert.equal((await fetch(`${at.origin}/_t/b/${after}`)).status, 200)
})
