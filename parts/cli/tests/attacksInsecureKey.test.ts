import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { commandLine } from '../commandLine.ts'

/** Sets variables of the environment for the length of a test, and gives back what stood there. */
function envFor(t: TestContext, values: Record<string, string | undefined>): void {
  const before = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]))
  const set = (all: Record<string, string | undefined>): void => {
    for (const [name, value] of Object.entries(all))
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
  }
  set(values)
  t.after(() => set(before))
}

/** Runs the command line, and answers how it ended and what it wrote to the error output. */
async function ran(words: string[], folder: string): Promise<{ ended: number; said: string }> {
  const said: string[] = []
  const write = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    said.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk))
    return true
  }
  try {
    const ended = await commandLine(words, folder).catch(() => -1)
    return { ended, said: said.join('') }
  } finally {
    process.stderr.write = write
  }
}

test('[05-12.22] the key of a login sent to an http address is refused, unless --insecure names that host', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'tent-attacks-insecure-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  envFor(t, { TENT_HOME: home, TENT_KEY: 'tent_the_key_of_a_login', TENT_AT: 'http://shop.example' })
  for (const words of [
    ['http://shop.example', 'login'],
    ['http://shop.example', 'whoami'],
    ['http://shop.example:8080', 'whoami'],
    ['http://SHOP.example', 'whoami'],
    ['http://shop.example', 'whoami', '--insecure', 'other.example'],
    ['http://shop.example', 'whoami', '--insecure', 'example'],
  ]) {
    const { ended, said } = await ran(words, home)
    assert.equal(ended, 2, words.join(' '))
    assert.match(said, /no secure connection/, words.join(' '))
    assert.equal(said.includes('tent_the_key_of_a_login'), false)
  }
  assert.equal(existsSync(join(home, 'keys.json')), false, 'a key was kept for an address that is not secure')
  // With --insecure naming the host, the key is sent there: the refusal is not what ends it.
  const named = await ran(['http://shop.example', 'whoami', '--insecure', 'shop.example'], home)
  assert.doesNotMatch(named.said, /no secure connection/)
})
