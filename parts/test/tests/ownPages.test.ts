import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { expectPicture } from '../../../rig/pictures.ts'
import { buildProject } from '../../build/index.ts'
import type { Engine } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { pageLook } from '../../core/internal.ts'

// What the tests of this file started and made: each engine is closed and each folder removed when the file ends.
const engines: Engine[] = []
const folders: string[] = []
after(async () => {
  for (const engine of engines) await engine.close()
  for (const folder of folders) rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

/** Builds a copy of the project of the desk, with what `change` writes into it, and serves it in a mode. */
async function desk(mode: 'live' | 'development', change?: (folder: string) => void): Promise<string> {
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const work = mkdtempSync(join(all, 'own-pages-'))
  folders.push(work)
  const folder = join(work, 'desk')
  cpSync(join(import.meta.dirname, 'ownPages'), folder, { recursive: true })
  change?.(folder)
  const made = await buildProject(folder, { for: mode === 'development' ? 'dev' : 'release' })
  assert.deepEqual(made.findings, [])
  const engine = createEngine({ port: 0 })
  engines.push(engine)
  const dataFolder = join(work, 'data')
  await engine.open(made.bundleFolder, { dataFolder, mode })
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  return `http://localhost:${port}`
}

// The project as it is written, on live data, served once for the tests that change nothing of it.
let live: Promise<string> | undefined
const onLive = (): Promise<string> => {
  live ??= desk('live')
  return live
}

// The same project with a count of one screen a minute: once it is used up, the next request is answered with 429.
let counted: Promise<string> | undefined
const onCounted = (): Promise<string> => {
  counted ??= desk('live', (folder) => {
    const file = join(folder, 'tent.ts')
    writeFileSync(file, readFileSync(file, 'utf8').replace('screensPerMinute: 100000', 'screensPerMinute: 1'))
  })
  return counted
}

/**
 * Uses up the count of screens of the minute that a request asked now falls in, and is sure that request falls in
 * it: near the end of a minute it waits for the next, then asks until the count is used up.
 */
async function usedUp(address: string): Promise<void> {
  const left = 60_000 - (Date.now() % 60_000)
  if (left < 5_000) await new Promise((done) => setTimeout(done, left + 50))
  for (let tries = 0; tries < 3; tries++)
    if ((await fetch(address, { headers: { accept: 'text/html' } })).status === 429) return
  assert.fail(`the count of screens of ${address} is never used up`)
}

/**
 * Each page of the engine's own, by its name: the address that answers it, its status, and what makes the engine
 * answer it so right before it is asked.
 */
const pages = async (): Promise<{ name: string; address: string; status: number; before?: () => Promise<void> }[]> => {
  const tooMany = `${await onCounted()}/`
  return [
    { name: 'notFound', address: `${await onLive()}/nothing/here`, status: 404 },
    // The page of a failure that is known before the head of the page is sent: one of its own entries failed.
    { name: 'error', address: `${await onLive()}/stuck`, status: 500 },
    { name: 'signIn', address: `${await onLive()}/members`, status: 401 },
    { name: 'outOfDate', address: `${await onLive()}/_t/screen?path=%2F&version=gone`, status: 409 },
    { name: 'tooMany', address: tooMany, status: 429, before: () => usedUp(tooMany) },
  ]
}

/** What a browser that asks for HTML is sent for an address. */
async function asked(address: string, language = 'en'): Promise<{ status: number; html: string; policy: string }> {
  const answer = await fetch(address, { headers: { accept: 'text/html', 'accept-language': language } })
  return {
    status: answer.status,
    html: await answer.text(),
    policy: answer.headers.get('content-security-policy') ?? '',
  }
}

test('[43-7] each page of the engine is plain HTML in one look: its status large and its words beside it, one style, no script, no file of its own, and under 4 KB', async () => {
  for (const page of await pages()) {
    await page.before?.()
    const sent = await asked(page.address)
    assert.equal(sent.status, page.status, page.name)
    assert.match(sent.html, /^<!doctype html>/i, page.name)
    assert.match(sent.html, new RegExp(`<h1[^>]*>${page.status}</h1>`), page.name)
    assert.equal((sent.html.match(/<style/g) ?? []).length, 1, page.name)
    assert.ok(!/<script|<link|\bsrc=/.test(sent.html), `${page.name}: ${sent.html}`)
    assert.ok(new TextEncoder().encode(sent.html).length < 4096, `${page.name} is ${sent.html.length} characters`)
    assert.match(sent.policy, /default-src 'none'/, page.name)
    assert.ok(!/script-src/.test(sent.policy), page.name)
  }
})

test('[43-7] each page of the engine, light and dark as the browser prefers, is the stored picture, and loads nothing but itself, in the three browsers', async () => {
  // Every picture is taken and held, and what did not hold is told at the end: a new one is written beside its place.
  const missed: string[] = []
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      for (const one of await pages())
        for (const scheme of ['light', 'dark'] as const) {
          const asked: string[] = []
          const watch = (request: { url(): string }): void => void asked.push(request.url())
          page.on('request', watch)
          await page.emulateMedia({ colorScheme: scheme })
          await one.before?.()
          const answer = await page.goto(one.address)
          assert.equal(answer?.status(), one.status, `${one.name} in ${engine}`)
          page.off('request', watch)
          assert.deepEqual(asked, [one.address], `${one.name} in ${engine}`)
          await expectPicture(`own.${one.name}.${scheme}`, await page.screenshot(), { engine }).catch(
            (error: unknown) => missed.push(error instanceof Error ? error.message : String(error)),
          )
        }
    })
  assert.deepEqual(missed, [])
})

test('[43-7] the words of a page of the engine are the texts of the project, in the language of the request', async () => {
  const address = `${await onLive()}/nothing/here`
  assert.match((await asked(address, 'en')).html, /Nothing lives at this address\./)
  assert.match((await asked(address, 'tr')).html, /Bu adreste bir şey yok\./)
  // A page whose words the project does not give has those of the engine.
  assert.match((await asked(`${await onLive()}/broken`)).html, /Something went wrong\./)
})

test('[43-7] in development an error is shown by the failure overlay of the page code, at its place in the source, and on live data the page of the engine shows the words alone and nothing of the error', async () => {
  const address = await desk('development')
  const text = readFileSync(join(import.meta.dirname, 'ownPages', 'screens.tsx'), 'utf8').replace(/\r\n?/g, '\n')
  const line = text.slice(0, text.indexOf('the drawer of secrets is stuck')).split('\n').length
  await inBrowser('chromium', async (page) => {
    // The view fails once the head was sent: the status of the head stands, and the error is drawn in place.
    const answer = await page.goto(`${address}/broken`)
    assert.equal(answer?.status(), 200)
    // The page is the page code's, which comes alive: the engine's own page holds no script.
    assert.match(String(await answer?.text()), /<script/)
    const shown = page.locator('#tent-overlay p', { hasText: 'the drawer of secrets is stuck' })
    await shown.first().waitFor()
    await page
      .locator('#tent-overlay p', { hasText: `screens.tsx:${line}` })
      .first()
      .waitFor()
  })
  const kept = await asked(`${await onLive()}/broken`)
  assert.equal(kept.status, 200)
  assert.match(kept.html, /Something went wrong\./)
  assert.ok(!/drawer of secrets|screens\.tsx|Error/.test(kept.html), kept.html)
})

test('[43-7] where the project has a screen for it, that screen is drawn in the place of the page of the engine', async () => {
  const address = await desk('live', (folder) =>
    writeFileSync(
      join(folder, 'own.tsx'),
      [
        "import { screen } from 'tentjs/ui'",
        '',
        "export const lostScreen = screen('lostScreen', { for: 'notFound', access: 'anyone', view: () => <span>Lost on the desk</span> })",
        "export const failedScreen = screen('failedScreen', { for: 'error', access: 'anyone', view: () => <span>The desk fell</span> })",
        "export const signInScreen = screen('signInScreen', { path: '/sign-in', access: 'anyone', view: () => <span>Sign in to the desk</span> })",
        '',
      ].join('\n'),
    ),
  )
  const lost = await asked(`${address}/nothing/here`)
  assert.equal(lost.status, 404)
  assert.match(lost.html, /Lost on the desk/)
  const failed = await asked(`${address}/broken`)
  assert.equal(failed.status, 200)
  assert.match(failed.html, /The desk fell/)
  const members = await fetch(`${address}/members`, { headers: { accept: 'text/html' }, redirect: 'manual' })
  assert.equal(members.status, 302)
  assert.match(String(members.headers.get('location')), /^\/sign-in\?back=/)
})

test('[43-7] [31-4] with no screen at the sign-in path a browser is sent the page of the engine for a sign-in that is needed, in development too', async () => {
  const address = await desk('development')
  const sent = await asked(`${address}/members`)
  assert.equal(sent.status, 401)
  assert.match(sent.html, /<h1[^>]*>401<\/h1>/)
})

test('[43-7] each page of the engine has the one look of the built-in screens: its status, its words under it and one link, to the start or to try again, and in development the code in a pill, on live data nothing of it', async () => {
  for (const page of await pages()) {
    await page.before?.()
    const sent = await asked(page.address)
    // The one style holds the look of each part, as the built-in screens carry it.
    for (const part of [pageLook.window, pageLook.status, pageLook.words, pageLook.link])
      assert.ok(sent.html.includes(part), `${page.name}: ${part}`)
    const link = ['notFound', 'signIn'].includes(page.name)
      ? /<a href="\/">Back to the start<\/a>/
      : /<a href="">Try again<\/a>/
    assert.match(sent.html, new RegExp(`<h1>${page.status}</h1><h2>[^<]+</h2>${link.source}</div>`), page.name)
    assert.ok(!/T\d{4}|<pre|<span/.test(sent.html), `${page.name}: ${sent.html}`)
  }
  const developed = await asked(`${await desk('development')}/members`)
  assert.match(developed.html, /<h2>Sign in to see this page\.<\/h2><span>T0006<\/span><a href="\/">/)
})
