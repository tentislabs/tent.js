import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { openText, sealText } from '../values/sealing.ts'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** The other spellings of a text in base64 for an address that read as the same bytes: they differ in its last character. */
function sameBytes(text: string): string[] {
  const bytes = Buffer.from(text, 'base64url')
  return [...alphabet]
    .map((last) => `${text.slice(0, -1)}${last}`)
    .filter((other) => other !== text && Buffer.from(other, 'base64url').equals(bytes))
}

test('[05-11.6] a sealed text that differs in a bit of its last character that no byte uses opens to nothing', () => {
  const key = randomBytes(32)
  // 28 bytes are added to the text: a text of 1 and of 3 bytes leaves the sealed bytes no multiple of three.
  for (const text of ['a', 'abc']) {
    const sealed = sealText(key, text, 'state')
    assert.equal(openText(key, sealed, 'state'), text)
    const others = sameBytes(sealed)
    assert.ok(others.length > 0, 'a spelling of the same bytes is there to try')
    for (const other of others) assert.equal(openText(key, other, 'state'), undefined, other)
  }
})
