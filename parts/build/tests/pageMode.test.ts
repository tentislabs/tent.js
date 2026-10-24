import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { pageCode } from '../pageCode.ts'

const textOf = (file: string): string => readFileSync(file, 'utf8')

test('[34-3] [31-19] the file of the page code that every page loads holds nothing of the inspect mode and nothing that tells the engine of a failure: the part inspect and the part of development hold them', async () => {
  const { folder, page } = await pageCode()
  for (const form of [page.browser, page.browserDev]) {
    const main = textOf(join(folder, form.main))
    // What the mode tells a tool, the token in an address, and the word of a failure.
    for (const sought of ['tent.highlight', 't-inspect', '"thrown"', "'thrown'"])
      assert.ok(!main.includes(sought), `${form.main} holds ${sought}`)
    assert.ok(textOf(join(folder, form.parts.inspect)).includes('tent.highlight'), 'the part inspect tells a tool')
    const overlay = textOf(join(folder, form.parts.overlay))
    assert.ok(overlay.includes('thrown'), 'the part of development tells the engine of a failure')
  }
})
