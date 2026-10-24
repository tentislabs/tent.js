import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const parts = join(import.meta.dirname, '..', '..')

/** Every file of code of a folder, by its place, with the folders of the tests left out. */
function codeFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? entry.name === 'tests'
        ? []
        : codeFiles(join(folder, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(folder, entry.name)]
        : [],
  )
}

test('[31-20] a page and a part drawn on the server alone are drawn by the one streaming draw: renderToString is named nowhere in the page code or the engine', () => {
  const naming = [...codeFiles(join(parts, 'screens')), ...codeFiles(join(parts, 'engine'))].filter((file) =>
    readFileSync(file, 'utf8').includes('renderToString'),
  )
  assert.deepEqual(
    naming.map((file) => file.slice(parts.length + 1)),
    [],
  )
})
