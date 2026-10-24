import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadedWhole } from '../page/address.ts'

test('[32-7] the page writes an address that row 4 of the table of addresses takes as it is written: the sitemap and robots.txt get no language code', () => {
  const missed = ['/sitemap.xml', '/sitemap-2.xml', '/robots.txt'].filter((path) => !loadedWhole(path, []))
  assert.deepEqual(missed, [], `the page would write a language code in front of ${missed.join(', ')}`)
})
