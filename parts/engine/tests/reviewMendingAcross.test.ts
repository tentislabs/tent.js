import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { writtenOut } from '../export/written.ts'

test('[32-13] run a second time, an export removes a page that it wrote under a name that --names any keeps, a dot at its end, once the page is no longer written', (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'tent-export-'))
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  // A value of a row that ends with a dot is written as a page where `names: 'any'` keeps it.
  const page = 'notes/v1./index.html'
  // What every export writes, under `_t/`, where it keeps its list too.
  const always: [string, string][] = [['_t/s/index.json', '{}']]
  writtenOut(folder, new Map([[page, '<p>v1.</p>'], ...always]))
  assert.equal(existsSync(join(folder, page)), true, 'the first export wrote the page')
  writtenOut(folder, new Map(always))
  assert.equal(existsSync(join(folder, page)), false, 'the page of the export before is still in the folder')
})
