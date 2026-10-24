import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { TentError } from '../../core/index.ts'
import { writeOwnerOnly } from '../../core/internal.ts'
import { findPage } from '../../docs/index.ts'
import { engineAt } from '../reach.ts'

// The advice works with the defaults: the engine listens on 127.0.0.1, so a host reaching it from `::1` reaches nothing.
const advised = (text: string): boolean => text.includes('127.0.0.2') && !text.includes('::1`')

test('[21-21] T0006 of an engine behind a proxy of this computer advises a host in front that reaches it from 127.0.0.2, in its fix and on its pages', async (t) => {
  // What answers on the port of `engine.json` as an engine behind a proxy of this computer answers a command.
  const refusing = createServer((_request, answer) => {
    answer.writeHead(401, { 'content-type': 'application/json' })
    answer.end(JSON.stringify({ ok: false, error: { code: 'T0006' } }))
  })
  await new Promise<void>((done) => refusing.listen(0, '127.0.0.1', done))
  t.after(() => refusing.close())
  const data = mkdtempSync(join(tmpdir(), 'tent-behind-host-'))
  t.after(() => rmSync(data, { recursive: true, force: true }))
  const address = refusing.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  writeOwnerOnly(join(data, 'engine.json'), JSON.stringify({ port, token: 'a token', pid: process.pid }))
  await assert.rejects(
    engineAt(data),
    (error) => error instanceof TentError && error.code === 'T0006' && advised(error.fix ?? ''),
  )
  for (const page of ['code.T0006', 'topic.engine.web']) assert.equal(advised(findPage(page)?.text ?? ''), true, page)
})
