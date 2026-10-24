import assert from 'node:assert/strict'
import { test } from 'node:test'
import { action, importFile, project } from '../index.ts'
import type { Loaded } from '../internal.ts'
import { describe } from '../internal.ts'

test('[45-9] an action whose run names importFile is stored as one that imports, so its app keeps runs; one that does not is not', () => {
  const loaded: Loaded[] = [
    { value: project('club', {}) },
    {
      value: action('imports', {
        access: 'signedIn',
        run: async () => importFile('a file', { with: { definition: 'addMember' } }),
      }),
    },
    { value: action('plain', { access: 'signedIn', run: async () => 'nothing' }) },
  ]
  const { functions } = describe({ definitions: loaded }).description
  assert.deepEqual([functions.imports.imports, functions.plain.imports], [true, undefined])
})
