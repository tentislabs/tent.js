import assert from 'node:assert/strict'
import { mkdirSync, renameSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { copied } from './typed.ts'

/** Waits until something holds, and answers whether it did within the time. */
async function within(ms: number, holds: () => boolean | Promise<boolean>): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await holds()) return true
    await new Promise((done) => setTimeout(done, 50))
  }
  return false
}

const extra = `import { screen } from 'tentjs/ui'

export const extraScreen = screen('extraScreen', {
  path: '/extra',
  access: 'anyone',
  view: () => <h1>The extra screen</h1>,
})
`

test('[31-21] a screen file moved into the project, which keeps the moment it was written elsewhere, is a save that is built', async (t) => {
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = copied(t, 'reviewed-moved-in', 'devs')
  const dev = await startDev(folder, { port: 0, out: () => undefined })
  started = dev
  const first = dev.version()
  // A file written an hour ago in another folder, as one kept in a folder of downloads, is moved into the project:
  // a move keeps the moment the file was written.
  const elsewhere = join(folder, '..', 'elsewhere')
  mkdirSync(elsewhere, { recursive: true })
  const written = join(elsewhere, 'extra.tsx')
  writeFileSync(written, extra)
  const hourAgo = new Date(Date.now() - 3_600_000)
  utimesSync(written, hourAgo, hourAgo)
  renameSync(written, join(folder, 'extra.tsx'))
  const built = await within(15_000, () => dev.version() !== first)
  assert.ok(built, 'the session built the project again with the new screen file')
  const page = await fetch(`http://localhost:${dev.port}/extra`)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /The extra screen/)
})

test('[31-21] a screen file that was removed and is put back as it was, as from the bin of the system, is a save that is built', async (t) => {
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = copied(t, 'reviewed-put-back', 'devs')
  writeFileSync(join(folder, 'extra.tsx'), extra)
  const dev = await startDev(folder, { port: 0, out: () => undefined })
  started = dev
  const first = dev.version()
  assert.equal((await fetch(`http://localhost:${dev.port}/extra`)).status, 200)
  // The bin of the system keeps a removed file with the moment it was written, and puts it back so.
  const bin = join(folder, '..', 'bin')
  mkdirSync(bin, { recursive: true })
  renameSync(join(folder, 'extra.tsx'), join(bin, 'extra.tsx'))
  assert.ok(await within(15_000, () => dev.version() !== first), 'the removal is a save')
  const without = dev.version()
  const hourAgo = new Date(Date.now() - 3_600_000)
  utimesSync(join(bin, 'extra.tsx'), hourAgo, hourAgo)
  renameSync(join(bin, 'extra.tsx'), join(folder, 'extra.tsx'))
  assert.ok(await within(15_000, () => dev.version() !== without), 'the file put back is a save')
  assert.equal(dev.version(), first, 'the files are those of the first build again')
  assert.equal((await fetch(`http://localhost:${dev.port}/extra`)).status, 200)
})
