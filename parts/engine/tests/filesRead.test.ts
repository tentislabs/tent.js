import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

// Every read of the files of a version goes through one reader, which answers for a folder and for a list alike.

const engine = join(import.meta.dirname, '..')

/** Every file of the engine's own code, by its path from the folder of the engine, written with `/`. */
const codeFiles = (): string[] =>
  readdirSync(engine, { recursive: true })
    .map((one) => String(one).replaceAll('\\', '/'))
    .filter((one) => one.endsWith('.ts') && !one.startsWith('tests/') && !one.includes('/tests/'))

test('[21-17] the files of a version are read by the reader of versions alone: no other file of the engine joins a path to the place of a version', async () => {
  const joined = /join\(\s*[\w.]*\b(bundle|bundleFolder|folder)\b\s*,/
  const found = codeFiles().flatMap((file) =>
    readFileSync(join(engine, file), 'utf8')
      .split('\n')
      .flatMap((line, at) =>
        joined.test(line) && /\b(bundle|bundleFolder)\b/.test(line) ? [`${file}:${at + 1}: ${line.trim()}`] : [],
      ),
  )
  assert.deepEqual(
    found.filter((one) => !one.startsWith('files.ts:')),
    [],
  )
  // A version of development is never named by a folder of its own any more.
  for (const file of codeFiles())
    assert.ok(!/keepFolder|\{ folder: resolve\(/.test(readFileSync(join(engine, file), 'utf8')), file)
})
