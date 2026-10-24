import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { startWords } from './startWords.ts'
import { copied, typed } from './typed.ts'

const key = 'k'.repeat(48)

test('[05-15.25] the key file of a server that follows, which another user of that computer may read, is not taken: T0013, and the key is never printed', async (t) => {
  const project = copied(t, 'follow-key')
  const keyFile = join(project, '..', 'follow.key')
  writeFileSync(keyFile, `${key}\n`, { mode: 0o644 })
  if (process.platform === 'win32') execFileSync('icacls', [keyFile, '/grant', '*S-1-1-0:(R)'], { stdio: 'ignore' })
  else chmodSync(keyFile, 0o644)
  const started = await typed(
    project,
    ...startWords([
      'start',
      '--versions-from',
      'http://127.0.0.1:9',
      '--key-from',
      keyFile,
      '--data',
      join(project, '..', 'follower'),
      '--insecure',
      '--json',
    ]),
  )
  const [found] = started.answer.findings ?? []
  assert.deepEqual([started.ended !== 0, found?.code], [true, 'T0013'], JSON.stringify(started.answer))
  assert.equal(started.printed.includes(key), false)
})
