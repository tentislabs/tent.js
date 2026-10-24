import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { startWords } from './startWords.ts'
import { copied, typed } from './typed.ts'

test('[15-6@4] `tent start --proxy` ends the command for an entry that is none of its words, and for entries with no from: whom the engine believes is not guessed at, and nothing is started', async (t) => {
  const project = copied(t, 'start-proxy')
  const data = join(project, '..', 'data')
  const started = (...proxy: string[]) =>
    typed(
      project,
      ...startWords(['start', '--data', data, '--port', '0', ...proxy.flatMap((entry) => ['--proxy', entry])]),
    )
  for (const [entries, names] of [
    [['from=127.0.0.1', 'header=forwardd'], /header=forwardd.*forwarded, x-forwarded/],
    [['from=127.0.0.1', 'scheme=htps'], /scheme=htps.*https, http, header/],
    [['from=127.0.0.1', 'host=yes'], /host=yes.*true, false/],
    [['from=127.0.0.1', 'hots=true'], /no "hots"/],
    [['host=true'], /from=<address>/],
  ] as const) {
    const ended = await started(...entries)
    assert.equal(ended.ended, 2, entries.join(' '))
    assert.match(ended.printed, names)
  }
  assert.equal(existsSync(join(data, 'engine.json')), false)
})
