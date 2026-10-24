import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { bundlePage } from '../borrowed/vite.ts'

const entry = join(import.meta.dirname, '..', '..', 'screens', 'page', 'server.ts')
const pure = (file: string): boolean => file.includes('/parts/core/')

/** The server side of the page code, built small in a program that says what it runs for. */
async function builtFor(runsFor: string): Promise<string> {
  const before = process.env.NODE_ENV
  process.env.NODE_ENV = runsFor
  try {
    return await bundlePage({ entry, side: 'server', small: true, pure })
  } finally {
    if (before === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = before
  }
}

test('[31-14@6] the page code is built to the same bytes whatever the program built before it: after a development build in the same program its tags are still made by the plain runtime', async () => {
  // A development build leaves the program marked for development, as `tent dev` does before it needs the page code.
  const [after, plain] = [await builtFor('development'), await builtFor('production')]
  assert.equal(after === plain, true, 'the page code differs after a development build in the same program')
})
