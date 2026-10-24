import assert from 'node:assert/strict'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { startHeld } from '../rooms/held/process.ts'
import { workFolder } from './apps.ts'

// The attack of the reviewer on how the held program of an app is started.

/** Lays files into a new folder of the test, and answers the folder. */
function laid(t: TestContext, files: Record<string, string>): string {
  const folder = workFolder(t)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  return folder
}

test('[43-6] attack 3: the held program refuses to start where a link inside the built code leads outside it', (t) => {
  const outside = laid(t, { 'secret.txt': 'what lies outside the code' })
  const bundle = laid(t, {
    'leak.js': `import { readFileSync } from 'node:fs'
import { join } from 'node:path'
export const leak = { options: { run: () => readFileSync(join(import.meta.dirname, 'link', 'secret.txt'), 'utf8') } }
`,
  })
  symlinkSync(outside, join(bundle, 'link'), 'junction')
  assert.throws(
    () => {
      const program = startHeld({ place: bundle, native: [], nativeFolders: [], serve: () => undefined })
      t.after(() => program.close())
    },
    (error: { code?: string }) => error.code === 'T0035',
    'the held program was not started',
  )
})
