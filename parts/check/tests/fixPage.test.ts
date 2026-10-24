import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { heldToProjects } from './copies.ts'

// The name of a build document, which a developer does not have.
const buildDocument = /\b\d{2}-[a-z-]+\.md\b/

test('[15-1@9a] the fix of T7007 names its page of the shipped docs, and no build document', async () => {
  const { findings } = await heldToProjects('T7007')
  for (const one of findings) {
    assert.match(one.fix ?? '', /`tent docs option\.agent\.memory`/, one.message)
    assert.doesNotMatch(one.fix ?? '', buildDocument, one.message)
  }
})

test('[15-1@9a] no rule of the check gives a fix or words that name a build document', () => {
  const folder = join(import.meta.dirname, '..', 'rules')
  for (const name of readdirSync(folder).filter((one) => one.endsWith('.ts')))
    assert.doesNotMatch(readFileSync(join(folder, name), 'utf8'), buildDocument, name)
})
