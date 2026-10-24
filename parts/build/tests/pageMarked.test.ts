import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { madePageCode } from '../pageCode.ts'

/** Every file of the page code as it is made in a program marked for `runsFor`, or for nothing, by its name. */
async function madeFor(runsFor: string | undefined): Promise<Record<string, string>> {
  const before = process.env.NODE_ENV
  if (runsFor === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = runsFor
  const folder = mkdtempSync(join(tmpdir(), 'tent-page-marked-'))
  try {
    await madePageCode(folder)
    return Object.fromEntries(
      readdirSync(folder)
        .sort()
        .map((file) => [file, readFileSync(join(folder, file), 'utf8')]),
    )
  } finally {
    rmSync(folder, { recursive: true, force: true })
    if (before === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = before
  }
}

test('[31-14] the page code is made to the same bytes in a program marked for development as in one marked for nothing: the same files under the same names', async () => {
  const marked = await madeFor('development')
  const unmarked = await madeFor(undefined)
  assert.deepEqual(Object.keys(marked), Object.keys(unmarked), 'the files of the page code are named otherwise')
  for (const [file, text] of Object.entries(marked))
    assert.equal(text === unmarked[file], true, `${file} differs by what the program is marked for`)
})

test('[31-14] no file of the page code holds the folder of the repository it was made in: each names its sources from there, so a release holds no folder of the computer that made it', async () => {
  const made = await madeFor(undefined)
  const repository = fileURLToPath(new URL('../../../', import.meta.url)).replace(/[\\/]$/, '')
  // As a path is written in code, in a source map, and in a text of JSON inside a map.
  const forms = new Set([repository, repository.replaceAll('\\', '/'), JSON.stringify(repository).slice(1, -1)])
  for (const [file, text] of Object.entries(made))
    for (const form of forms) assert.equal(text.includes(form), false, `${file} holds ${form}`)
  // The development form still tells the place of each tag, by its path from the repository.
  assert.ok(
    Object.entries(made).some(([file, text]) => file.startsWith('page.dev.') && text.includes('"parts/screens/page/')),
    'a file of the development form names a view of the page code by its path from the repository',
  )
})
