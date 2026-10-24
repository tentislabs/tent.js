import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { servedLive } from './living.ts'

/** The record of the page of an address, as the first HTML holds it, and the address of its main file of the page code. */
async function pageOf(origin: string, path: string): Promise<{ load: Record<string, unknown>; main: string }> {
  const html = await (await fetch(`${origin}${path}`)).text()
  const record = JSON.parse(/<script type="application\/json" id="tent-page">(.*?)<\/script>/s.exec(html)?.[1] ?? '{}')
  // The main file is the last module the page names: a part that runs before it stands above it.
  const main = [...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].at(-1)?.[1] ?? ''
  return { load: Object(record.load), main }
}

test('[31-22] in development a module of a file of the project is served at its address with no fingerprint and no-store, named at its mark by the record of a page and by each module that imports it; the page code keeps its year, and a mark that no kept version holds is not found', async (t) => {
  const at = await servedLive(t, { mode: 'development' })
  const { load, main } = await pageOf(at.origin, '/quote')
  const screen = String(load.screen)
  assert.match(screen, /^browser\/[\w.-]+\.js\?v=[0-9a-f]{12}$/)
  const answer = await fetch(`${at.origin}/_t/b/${screen}`)
  assert.equal(answer.status, 200)
  assert.equal(answer.headers.get('cache-control'), 'no-store')
  // The module of the screen names the module of its file at its address, with the mark it has in this version.
  const imported = /from "\.\/(src\.screens\.tsx\.js)\?v=([0-9a-f]{12})"/.exec(await answer.text())
  assert.ok(imported, 'the module of the screen imports the module of its file at its mark')
  const own = await fetch(`${at.origin}/_t/b/browser/${imported[1]}`)
  assert.equal(own.status, 200)
  assert.equal(own.headers.get('cache-control'), 'no-store')
  assert.equal((await fetch(`${at.origin}/_t/b/browser/${imported[1]}?v=${imported[2]}`)).status, 200)
  // A mark that no version that is kept holds is not found: the page that asked it loads its address anew.
  assert.equal((await fetch(`${at.origin}/_t/b/browser/${imported[1]}?v=000000000000`)).status, 404)
  // The page code carries its fingerprint, and is kept for a year.
  const code = await fetch(`${at.origin}${main}`)
  assert.equal(code.status, 200)
  assert.match(String(code.headers.get('cache-control')), /max-age=31536000/)
})

test('[31-22] in development a switch with a swap tells each open page the modules to take in place, each at its mark, and keeps the watches of the page, moved to the new version; a switch with none drops them; a switch with reload has each page load its address anew', async (t) => {
  const at = await servedLive(t, { mode: 'development' })
  const origin = at.origin
  const live = at.app.live(new Request(`${origin}/_t/live`, { headers: { origin } }))
  const heard: Record<string, unknown>[] = []
  live.each(
    (message) => void heard.push(message),
    () => undefined,
  )
  const until = async (what: string, holds: () => boolean): Promise<void> => {
    for (let n = 0; n < 1000 && !holds(); n++) await new Promise((done) => setTimeout(done, 5))
    assert.ok(holds(), what)
  }
  const countsOf = (): number => heard.filter((one) => one.t === 'result' && one.id === 'w1').length
  live.send({ t: 'watch', id: 'w1', query: 'countCards', input: {}, version: at.app.versions()[0].id })
  await until('the watch is answered', () => countsOf() === 1)
  // A save of the look alone: the version is built, added and switched to with the module of the screen file.
  const file = join(at.projectFolder, 'screens.tsx')
  const next = async (from: string, to: string): Promise<string> => {
    writeFileSync(file, readFileSync(file, 'utf8').replace(from, to))
    return at.app.add((await at.built()).bundleFolder)
  }
  const swapped = await next('Quote {quote}', 'The quote is {quote}')
  await at.app.switch(swapped, { swap: ['browser/src.screens.tsx.js'] })
  await until('the page is told the version', () => heard.some((one) => one.t === 'version'))
  const told = heard.find((one) => one.t === 'version')
  assert.equal(told?.version, swapped)
  assert.deepEqual(Object.keys(Object(told)).sort(), ['swap', 't', 'version'])
  const [entry] = Array.isArray(told?.swap) ? told.swap : []
  assert.equal(Object(entry).address, 'browser/src.screens.tsx.js')
  assert.match(String(Object(entry).mark), /^[0-9a-f]{12}$/)
  // The watch stands, under the new version: a write is told to the page.
  await at.app.call('addCard', { title: 'After the swap', rank: 9 }, { as: { kind: 'system' } })
  await until('the watch that the swap kept is answered', () => countsOf() === 2)
  // A switch with no swap drops it: the page sends it again under the new version.
  const followed = await next('The quote is {quote}', 'Quote {quote}')
  await at.app.switch(followed)
  await until('the page is told the second version', () => heard.filter((one) => one.t === 'version').length === 2)
  assert.equal(Object.hasOwn(Object(heard.filter((one) => one.t === 'version')[1]), 'swap'), false)
  await at.app.call('addCard', { title: 'After the switch', rank: 10 }, { as: { kind: 'system' } })
  await new Promise((done) => setTimeout(done, 100))
  assert.equal(countsOf(), 2, 'a watch of the version that was left is answered no more')
  // A switch with reload, to the version that runs, has the page load its address anew.
  await at.app.switch(followed, { reload: true })
  await until('the page is told to reload', () => heard.some((one) => one.t === 'reload'))
  live.close()
})

test('[31-22] a page of the mode development runs the part refresh before the main file of the page code; a page of the mode test holds nothing of it', async (t) => {
  const developed = await servedLive(t, { mode: 'development' })
  const html = await (await fetch(`${developed.origin}/quote`)).text()
  const scripts = [...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map((one) => one[1])
  assert.equal(scripts.length, 2, html)
  assert.match(scripts[0], /\/_t\/b\/browser\/page\.dev\.refresh\.[0-9a-f]{12}\.js$/)
  assert.equal(scripts[1], (await pageOf(developed.origin, '/quote')).main)
  assert.equal((await fetch(`${developed.origin}${scripts[0]}`)).status, 200)
  const tested = await servedLive(t, { mode: 'test' })
  assert.doesNotMatch(await (await fetch(`${tested.origin}/quote`)).text(), /refresh/)
})
