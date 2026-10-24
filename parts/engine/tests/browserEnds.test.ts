import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { browsed } from '../index.ts'
import { bidiAt } from '../shot/bidi.ts'
import { endProgram } from '../shot/endProgram.ts'
import { running } from './apps.ts'
import { stillChannel } from './stillChannel.ts'

test('[48-1] a command that a driven browser never answers fails once its page is ended, and the end answers, in chromium and in firefox', {
  timeout: 120_000,
}, async (t) => {
  const { app } = await running(t)
  for (const engine of ['chromium', 'firefox'] as const) {
    const page = await browsed(app, { engine, size: { width: 800, height: 600 }, dark: false })
    const told = page.evaluate('new Promise(() => {})').then(
      () => 'answered',
      () => 'failed',
    )
    await page.end()
    assert.equal(await told, 'failed', `${engine}: the command that waited fails when its browser ends`)
  }
})

test('[48-1] a command over a channel of WebDriver BiDi that is never answered fails within its time, and one that waits fails at once when the connection closes', {
  timeout: 30_000,
}, async (t) => {
  const channel = await stillChannel(t)
  const bidi = await bidiAt(channel.address)
  t.after(() => bidi.close())
  const began = performance.now()
  await assert.rejects(bidi.send('session.status', {}, 300), { code: 'T0016' })
  assert.ok(performance.now() - began < 5_000, 'it failed by its own time')
  const waiting = bidi.send('session.status')
  channel.drop()
  await assert.rejects(waiting, /closed/)
})

test('[48-1] a channel of WebDriver BiDi whose opening is never answered fails within ten seconds', {
  timeout: 30_000,
}, async (t) => {
  const channel = await stillChannel(t, { opens: false })
  const began = performance.now()
  await assert.rejects(bidiAt(channel.address), { code: 'T0016' })
  assert.ok(performance.now() - began < 15_000, 'it failed by the time of an opening')
})

test('[48-1] a program of a browser that does not end when it is asked is ended, and its folder taken away', {
  timeout: 60_000,
}, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'tent-ending-'))
  // A program that lets the polite end pass, as a browser that hangs does.
  const program = spawn(
    process.execPath,
    ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); console.error('started')"],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  await new Promise<void>((done) => program.stderr.once('data', () => done()))
  const began = performance.now()
  await endProgram(program, folder, 1_000)
  assert.ok(program.exitCode !== null || program.signalCode !== null, 'the program ended')
  assert.equal(existsSync(folder), false, 'its folder is gone')
  assert.ok(performance.now() - began < 20_000, 'it was ended within its bounds')
})
