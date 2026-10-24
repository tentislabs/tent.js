import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { keepKey, keptKey } from '../cli/keys.ts'

test('[24-15] `keys.json` read again and again, as the requests of one command read it, is not asked of the tools of the system each time', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'tent-keys-read-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  keepKey(home, 'https://server.test', 'tent_kept')
  assert.equal(keptKey(home, 'https://server.test'), 'tent_kept')
  const began = performance.now()
  for (let n = 0; n < 10; n++) assert.equal(keptKey(home, 'https://server.test'), 'tent_kept')
  // A start of a tool of the system takes hundreds of milliseconds: ten of them take seconds.
  const took = performance.now() - began
  assert.ok(took < 1000, `ten reads took ${Math.round(took)} ms`)
})
