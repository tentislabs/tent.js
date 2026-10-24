import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { servedLive } from './living.ts'

test('[31-22] a page of development that is told a later version with no swap while it takes a swap in place follows that version: it asks for its screen again under it', async (t) => {
  const at = await servedLive(t, { mode: 'development' })
  const html = await (await fetch(`${at.origin}/quote`)).text()
  const record = JSON.parse(/<script type="application\/json" id="tent-page">(.*?)<\/script>/s.exec(html)?.[1] ?? '{}')
  const description = JSON.parse(readFileSync(join(at.bundleFolder, 'description.json'), 'utf8'))
  const code = await import(pathToFileURL(join(at.bundleFolder, String(description.browser.page.main))).href)
  const files = [record.load.screen, ...record.load.parts].filter((one: unknown) => typeof one === 'string' && one)
  const loaded = await Promise.all(
    files.map(
      async (one: string) => (await import(`${pathToFileURL(join(at.bundleFolder, one.split('?')[0])).href}`)).default,
    ),
  )
  const records = loaded.filter((one) => one !== undefined)
  const asked: string[] = []
  let message: ((text: string) => void) | undefined
  // The swap of the first save takes its time, as a module asked of the engine does.
  let swapped: (taken: boolean) => void = () => undefined
  const taking = new Promise<boolean>((done) => {
    swapped = done
  })
  const timers = new Set<NodeJS.Timeout>()
  t.after(() => {
    for (const one of timers) clearTimeout(one)
  })
  code.livingPage(record, records, {
    post: async () => ({ ok: true, value: null }),
    get: async (address: string) => {
      asked.push(address)
      return { ok: false }
    },
    go: (address: string) => void asked.push(`go ${address}`),
    load: async () => [],
    shows: () => '/quote',
    wait: (work: () => void, ms: number) => {
      const one = setTimeout(work, ms)
      timers.add(one)
      return () => clearTimeout(one)
    },
    every: () => () => undefined,
    swap: () => taking,
    socket: (_address: string, on: { opened(): void; message(text: string): void }) => {
      message = on.message
      queueMicrotask(() => on.opened())
      return { send: () => undefined, close: () => undefined }
    },
  })
  for (let n = 0; n < 200 && !message; n++) await new Promise((done) => setTimeout(done, 5))
  assert.ok(message, 'a page of development opens its connection')
  const swap = [{ address: 'browser/src.screens.tsx.js', mark: '0123456789ab' }]
  message(JSON.stringify({ t: 'version', version: 'second', swap }))
  // A save of `data` comes while the first is taken: the engine dropped the watches, and the page must follow.
  message(JSON.stringify({ t: 'version', version: 'third' }))
  swapped(true)
  for (let n = 0; n < 200 && !asked.length; n++) await new Promise((done) => setTimeout(done, 5))
  assert.ok(
    asked.some((one) => one.includes('version=third') || one.startsWith('go ')),
    `the page follows the third version: ${asked.join(', ') || 'it asked nothing'}`,
  )
})

test('[31-22] in development the source map of a module at its address with no fingerprint keeps that address while its bytes change, so it is kept by no browser, as its module is not', async (t) => {
  const at = await servedLive(t, { mode: 'development' })
  const html = await (await fetch(`${at.origin}/quote`)).text()
  const record = JSON.parse(/<script type="application\/json" id="tent-page">(.*?)<\/script>/s.exec(html)?.[1] ?? '{}')
  const screen = new URL(`/_t/b/${String(record.load.screen)}`, at.origin)
  const own = /from "\.\/(src\.screens\.tsx\.js\?v=[0-9a-f]{12})"/.exec(await (await fetch(screen)).text())?.[1]
  assert.ok(own, 'the module of the screen imports the module of its file at its mark')
  /** The source map that a browser's tools read for the module of the screen file, by the address that module names. */
  const mapOf = async (module: URL): Promise<{ address: string; text: string; cache: string | null }> => {
    const code = await (await fetch(module)).text()
    const named = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(code)?.[1]
    assert.ok(named, 'the module names its source map')
    const address = new URL(named, module).href
    const answer = await fetch(address)
    assert.equal(answer.status, 200, address)
    return { address, text: await answer.text(), cache: answer.headers.get('cache-control') }
  }
  const before = await mapOf(new URL(own, screen))
  // A save of the screen file: its module and its source map are other bytes in the new version.
  const file = join(at.projectFolder, 'screens.tsx')
  writeFileSync(file, readFileSync(file, 'utf8').replace('Quote {quote}', 'The quote is {quote}'))
  await at.app.switch(await at.app.add((await at.built()).bundleFolder))
  const page = await (await fetch(`${at.origin}/quote`)).text()
  const next = JSON.parse(/<script type="application\/json" id="tent-page">(.*?)<\/script>/s.exec(page)?.[1] ?? '{}')
  const screenNow = new URL(`/_t/b/${String(next.load.screen)}`, at.origin)
  const ownNow = /from "\.\/(src\.screens\.tsx\.js\?v=[0-9a-f]{12})"/.exec(await (await fetch(screenNow)).text())?.[1]
  assert.ok(ownNow)
  assert.notEqual(ownNow, own, 'the module of the saved file is another mark')
  const after = await mapOf(new URL(ownNow, screenNow))
  if (after.address === before.address && after.text !== before.text)
    assert.doesNotMatch(
      String(before.cache),
      /max-age=31536000|immutable/,
      `${before.address} held other bytes after the save, and was sent to be kept for a year`,
    )
})
