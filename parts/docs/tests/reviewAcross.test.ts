import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findPage } from '../index.ts'

// The adapters an app can fill, as the document of the engine's callers names them, with `Room`.
const adapters = [
  'Store',
  'FileStore',
  'Mailer',
  'Clock',
  'Sandbox',
  'TextReader',
  'Provider',
  'Searcher',
  'ChangeSink',
  'Lease',
  'Workers',
  'Signer',
  'Verifier',
  'Room',
]

test('[03-5] every adapter that an app can fill has its page of the docs', () => {
  const missing = adapters.filter((name) => findPage(`adapter.${name}`) === undefined)
  assert.deepEqual(missing, [], `no page for ${missing.join(', ')}`)
})

test('[03-5] every helper that tentjs/ui gives a screen file has its page of the docs: read, message, asset, messages and given', () => {
  const missing = ['read', 'message', 'asset', 'messages', 'given'].filter(
    (name) => findPage(`word.${name}`) === undefined,
  )
  assert.deepEqual(missing, [], `no page for ${missing.join(', ')}`)
})
