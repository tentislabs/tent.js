import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

// A name that a file gives to another file stands once in its part: the rule of whether a field must be given has
// one home in core, which the door's check and the checks of a form read alike.

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

test('[32-4] core gives the rule of whether a field must be given from one file, which the checks of a form and the door share', () => {
  const core = join(import.meta.dirname, '..')
  const giving = codeFiles(core).filter((file) =>
    /export\s+(?:const|function)\s+isRequired\b/.test(readFileSync(file, 'utf8')),
  )
  assert.equal(
    giving.length,
    1,
    `isRequired is given by ${giving.map((file) => file.slice(core.length + 1)).join(' and ')}`,
  )
})
