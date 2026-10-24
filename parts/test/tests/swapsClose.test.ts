import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { servedLive } from './living.ts'

test('[31-22] a page of development that is told two swaps while it takes the first takes the modules of both once the first ends, at their newest marks, and asks for no screen', async (t) => {
  const at = await servedLive(t, { mode: 'development' })
  const html = await (await fetch(`${at.origin}/quote`)).text()
  const record = JSON.parse(/<script type="application\/json" id="tent-page">(.*?)<\/script>/s.exec(html)?.[1] ?? '{}')
  const description = JSON.parse(readFileSync(join(at.bundleFolder, 'description.json'), 'utf8'))
  const code = await import(pathToFileURL(join(at.bundleFolder, String(description.browser.page.main))).href)
  const files = [record.load.screen, ...record.load.parts].filter((one: unknown) => typeof one === 'string' && one)
  const records = (
    await Promise.all(
      files.map(
        async (one: string) => (await import(pathToFileURL(join(at.bundleFolder, one.split('?')[0])).href)).default,
      ),
    )
  ).filter((one) => one !== undefined)
  const asked: string[] = []
  const taken: { address: string; mark: string }[][] = []
  let message: ((text: string) => void) | undefined
  // The first swap takes its time, as a module asked of the engine does; every later one is taken at once.
  let first: (taken: boolean) => void = () => undefined
  const taking = new Promise<boolean>((done) => {
    first = done
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
    swap: (modules: { address: string; mark: string }[]) => {
      taken.push(modules)
      return taken.length === 1 ? taking : Promise.resolve(true)
    },
    socket: (_address: string, on: { opened(): void; message(text: string): void }) => {
      message = on.message
      queueMicrotask(() => on.opened())
      return { send: () => undefined, close: () => undefined }
    },
  })
  for (let n = 0; n < 200 && !message; n++) await new Promise((done) => setTimeout(done, 5))
  assert.ok(message, 'a page of development opens its connection')
  const screen = 'browser/src.screens.tsx.js'
  const other = 'browser/src.ui.tsx.js'
  message(JSON.stringify({ t: 'version', version: 'second', swap: [{ address: screen, mark: 'aaaaaaaaaaaa' }] }))
  message(JSON.stringify({ t: 'version', version: 'third', swap: [{ address: screen, mark: 'bbbbbbbbbbbb' }] }))
  message(JSON.stringify({ t: 'version', version: 'fourth', swap: [{ address: other, mark: 'cccccccccccc' }] }))
  first(true)
  for (let n = 0; n < 200 && taken.length < 2; n++) await new Promise((done) => setTimeout(done, 5))
  assert.deepEqual(taken, [
    [{ address: screen, mark: 'aaaaaaaaaaaa' }],
    [
      { address: screen, mark: 'bbbbbbbbbbbb' },
      { address: other, mark: 'cccccccccccc' },
    ],
  ])
  await new Promise((done) => setTimeout(done, 50))
  assert.deepEqual(asked, [], 'the page asked for no screen, and loaded no address anew')
})
